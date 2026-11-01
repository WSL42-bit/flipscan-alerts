var db = require('./db');
var tg = require('./telegram');
var TIERS = require('./config').TIERS;
var scrapers = {
  marktplaats: require('./scrapers/marktplaats'),
  vinted: require('./scrapers/vinted'),
  ebay: require('./scrapers/ebay')
};

var MAX_PER_RUN = 8;
var MAX_AGE_MS = 90 * 60 * 1000; // alleen advertenties die de laatste 90 minuten geplaatst zijn

// Accessoires, onderdelen en rommel eruit, tenzij de gebruiker daar zelf op zoekt
var JUNK = ['hoes','hoesje','hoesjes','case','cases','cover','coque','hülle','custodia','funda','screen protector','screenprotector','beschermglas','tempered glass','panzerglas','onderdeel','onderdelen','parts','for parts','pour pièces','ricambi','motherboard','logic board','moederbord','defect','kapot','broken','cracked','lege doos','empty box','box only','alleen doos','gezocht','ruilen','ruil','kabel','lader','charger','oplader','sticker','skin','dummy','replica'];
function junk(title, query) {
  var t = ' ' + title.replace(/[^a-z0-9äöüéèàç ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  for (var i = 0; i < JUNK.length; i++) {
    var w = JUNK[i];
    if (query.indexOf(w) !== -1) continue;
    if (t.indexOf(' ' + w + ' ') !== -1) return true;
  }
  return false;
}
var running = false;

// Meer zoektermen = meer verzoeken, dus iets ruimer interval: 1 tot 5 termen 30 sec, 6 tot 10 60 sec, 11 tot 15 90 sec
var INTERVAL_FACTOR_SQL = "(CASE WHEN COALESCE(cardinality(s.terms), 1) > 10 THEN 3 WHEN COALESCE(cardinality(s.terms), 1) > 5 THEN 2 ELSE 1 END)";

function excluded(title, list) {
  if (!list || !list.length) return false;
  var t = ' ' + title.replace(/[^a-z0-9äöüéèàç ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  for (var i = 0; i < list.length; i++) {
    var w = String(list[i]).toLowerCase().replace(/[^a-z0-9äöüéèàç ]+/g, ' ').trim();
    if (w && t.indexOf(' ' + w) !== -1) return true; // woord (of woordbegin) komt voor
  }
  return false;
}

function matches(item, s) {
  var title = String(item.title || '').toLowerCase();
  if (excluded(title, s.exclude)) return false;
  if (junk(title, s.query.toLowerCase())) return false;
  var words = s.query.toLowerCase().split(/\s+/).filter(function (w) { return w.length > 1; });
  for (var i = 0; i < words.length; i++) if (title.indexOf(words[i]) === -1) return false;
  if (item.price != null) {
    if (s.min_price && item.price < s.min_price) return false;
    if (s.max_price && item.price > s.max_price) return false;
  }
  // Extra filters: onbekende waarde laten we door, anders missen we deals
  if (s.conditions && s.conditions.length && item.condition && s.conditions.indexOf(item.condition) === -1) return false;
  if (s.delivery && item.delivery && item.delivery !== 'beide' && item.delivery !== s.delivery) return false;
  if (s.fixed_only && (item.price == null || item.fixed === false)) return false;
  return true;
}

// Stille uren in Nederlandse tijd, bijvoorbeeld 23 tot 7
function amsHour() {
  return parseInt(new Intl.DateTimeFormat('nl-NL', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Amsterdam' }).format(new Date()), 10);
}
function quiet(s) {
  if (s.quiet_from == null || s.quiet_to == null || s.quiet_from === s.quiet_to) return false;
  var h = amsHour();
  return s.quiet_from < s.quiet_to ? (h >= s.quiet_from && h < s.quiet_to) : (h >= s.quiet_from || h < s.quiet_to);
}

async function checkSearch(s) {
  var tier = TIERS[s.tier] || TIERS.free;
  var platforms = s.platforms.filter(function (p) { return tier.platforms.indexOf(p) !== -1; });
  var found = [];
  var counts = [];
  var dup = {};
  // Elke zoekterm apart zoeken, resultaten samenvoegen (zelfde advertentie maar één keer)
  var terms = s.terms && s.terms.length ? s.terms : [s.query];
  for (var ti = 0; ti < terms.length; ti++) {
    var st = Object.assign({}, s, { query: terms[ti] });
    for (var i = 0; i < platforms.length; i++) {
      try {
        var items = await scrapers[platforms[i]].search(st);
        var ok = items.filter(function (it) { return matches(it, st) && !dup[it.platform + ':' + it.id] && (dup[it.platform + ':' + it.id] = 1); });
        counts.push(platforms[i] + ' ' + items.length + '/' + ok.length);
        found = found.concat(ok);
      } catch (e) {
        console.error('[' + platforms[i] + '] ' + terms[ti] + ': ' + e.message);
      }
    }
  }

  // Platforms die voor deze zoekopdracht nog nooit gecheckt zijn: eerst stil opslaan (geen meldingen)
  var known = await db.pool.query('SELECT DISTINCT platform FROM alert_seen WHERE search_id = $1', [s.id]);
  var knownSet = known.rows.map(function (r) { return r.platform; });
  var fresh = [];
  for (var j = 0; j < found.length; j++) {
    var it = found[j];
    var r = await db.pool.query(
      'INSERT INTO alert_seen (search_id, platform, item_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING item_id',
      [s.id, it.platform, it.id]
    );
    // Alleen echt nieuw geplaatste advertenties: bekende plaatsingstijd moet recent zijn
    var recent = it.createdAt == null || (it.createdAt > 0 && Date.now() - it.createdAt < MAX_AGE_MS);
    if (r.rowCount && knownSet.indexOf(it.platform) !== -1 && recent) fresh.push(it);
  }

  // Eerste run: alleen bestaande advertenties opslaan, niet spammen
  if (!s.seeded) {
    await db.pool.query('UPDATE alert_searches SET seeded = TRUE, last_checked_at = NOW() WHERE id = $1', [s.id]);
    await tg.sendMessage(s.chat_id, '✅ Zoekopdracht <b>' + tg.esc(s.name || s.query) + '</b> staat aan' + (terms.length > 1 ? ' (' + terms.length + ' zoektermen)' : '') + '. Je krijgt vanaf nu alleen nieuwe advertenties.');
    return;
  }

  await db.pool.query('UPDATE alert_searches SET last_checked_at = NOW() WHERE id = $1', [s.id]);
  console.log('[check] "' + (s.name || s.query) + '" ' + counts.join(', ') + ' (gevonden/passend), nieuw: ' + fresh.length);
  if (quiet(s)) return; // wel bijhouden wat er al was, niet melden
  for (var k = 0; k < fresh.length && k < MAX_PER_RUN; k++) {
    await tg.sendListing(s.chat_id, fresh[k], s.name || s.query);
  }
}

async function tick() {
  if (running) return;
  running = true;
  try {
    var due = await db.pool.query(
      "SELECT s.*, u.tier FROM alert_searches s JOIN alert_users u ON u.chat_id = s.chat_id " +
      "WHERE s.active = TRUE AND u.paused = FALSE AND u.tier = 'pro' AND (s.last_checked_at IS NULL OR s.last_checked_at < NOW() - INTERVAL '1 second' * " + TIERS.pro.intervalSec + " * " + INTERVAL_FACTOR_SQL + ") ORDER BY s.last_checked_at NULLS FIRST LIMIT 50"
    );
    for (var i = 0; i < due.rows.length; i++) {
      await checkSearch(due.rows[i]);
    }
  } catch (e) {
    console.error('tick fout:', e.message);
  }
  running = false;
}

async function cleanup() {
  try { await db.pool.query("DELETE FROM alert_seen WHERE created_at < NOW() - INTERVAL '14 days'"); } catch (e) {}
}

function start() {
  setInterval(tick, 15 * 1000);
  setInterval(cleanup, 6 * 60 * 60 * 1000);
  // Eerste check iets later: Railway's interne DNS is bij opstarten soms nog niet klaar
  setTimeout(tick, 10 * 1000);
}

module.exports = { start: start, tick: tick };
