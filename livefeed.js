// Live feed voor de website: echte, actuele advertenties (met hun eigen foto) van Marktplaats, Vinted en eBay.
// Wordt elke paar minuten ververst in de achtergrond, bezoekers krijgen altijd direct de cache.
var scrapers = {
  marktplaats: require('./scrapers/marktplaats'),
  vinted: require('./scrapers/vinted'),
  ebay: require('./scrapers/ebay')
};

// Populaire flip-categorieën. Per ronde pakken we er een paar, zodat de feed blijft wisselen.
var QUERIES = [
  { query: 'iphone 13', min_price: 180, max_price: 650, exclude: /\b(mini hoes|14|15|16)\b/ },
  { query: 'nike dunk', min_price: 30, max_price: 250 },
  { query: 'playstation 5', min_price: 200, max_price: 600, exclude: /\b(game|spel|ps4|vr)\b/i },
  { query: 'airpods pro', min_price: 70, max_price: 250, exclude: /\b(oordopjes|tips|links|rechts|left|right|case only|losse)\b/i },
  { query: 'nintendo switch', min_price: 100, max_price: 400, exclude: /\b(game|spel|joy-?con only)\b/i },
  { query: 'lego star wars', min_price: 20, max_price: 400 },
  { query: 'macbook air', min_price: 300, max_price: 1400, exclude: /\b(sleeve|tas|bag|toetsenbord|keyboard|scherm|display)\b/i },
  { query: 'dyson', min_price: 60, max_price: 500 },
  { query: 'stone island', min_price: 40, max_price: 400 },
  { query: 'ray-ban', min_price: 30, max_price: 200 },
  { query: 'gazelle fiets', min_price: 100, max_price: 900 },
  { query: 'canon eos', min_price: 100, max_price: 1200 }
];
var PER_ROUND = 4;
var REFRESH_MS = 4 * 60 * 1000;
var MAX_ITEMS = 36;

var cache = { items: [], updatedAt: null, checked: 0, stats: {} };
var round = 0;
var busy = false;

// Strenger dan de alerts: de homepage moet alleen kloppende, complete producten laten zien
var JUNK = /\b(hoes|hoesje|case|cover|screen ?protector|beschermglas|onderdelen|onderdeel|parts?|motherboard|logic ?board|moederbord|defect|kapot|broken|read|lees|alleen doos|lege doos|empty box|box only|doos only|gezocht|ruilen|ruil|gevraagd|replica|fake|portal|controller only|kabel|lader|charger|sticker|skin|poster|sokken|veters)\b/i;
var EBAY_OK = { NL: 'Nederland', BE: 'België', DE: 'Duitsland' };

function esc(w) { return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function matches(item, q) {
  var t = String(item.title || '');
  if (JUNK.test(t)) return false;
  var words = q.query.toLowerCase().split(/\s+/).filter(Boolean);
  for (var i = 0; i < words.length; i++) {
    var w = words[i];
    var re = new RegExp('(^|[^a-z0-9])' + esc(w).replace('-', '[- ]?') + '($|[^a-z0-9])', 'i');
    if (!re.test(t)) return false;
  }
  if (q.exclude && q.exclude.test(t)) return false;
  if (item.price == null) return false;
  if (item.platform === 'ebay' && !EBAY_OK[item.location]) return false;
  return item.price >= q.min_price && item.price <= q.max_price;
}

function clean(it, q) {
  return {
    id: it.platform + ':' + it.id,
    title: String(it.title).slice(0, 90),
    price: it.price,
    url: it.url,
    image: it.image,
    location: it.platform === 'ebay' ? (EBAY_OK[it.location] || it.location) : (it.location || null),
    platform: it.platform,
    query: q.query
  };
}

async function refresh() {
  if (busy) return;
  busy = true;
  try {
    var picked = [];
    for (var i = 0; i < PER_ROUND; i++) picked.push(QUERIES[(round * PER_ROUND + i) % QUERIES.length]);
    round++;
    var fresh = [];
    var checked = 0;
    var pricePool = {};
    for (var j = 0; j < picked.length; j++) {
      var q = picked[j];
      for (var p in scrapers) {
        try {
          var items = await scrapers[p].search(q);
          checked += items.length;
          // Prijzen van alle kloppende advertenties bewaren, voor een eerlijke 'gemiddelde vraagprijs'
          items.forEach(function (it) { if (matches(it, q)) (pricePool[q.query] = pricePool[q.query] || []).push(it.price); });
          items
            .filter(function (it) { return it.image && /^https?:\/\//.test(it.image) && matches(it, q); })
            .filter(function (it) { return p !== 'marktplaats' || /^m/.test(it.id); }) // geen betaalde Admarkt advertenties
            .slice(0, 4)
            .forEach(function (it) { fresh.push(clean(it, q)); });
        } catch (e) {
          console.error('[livefeed] ' + p + ' "' + q.query + '": ' + e.message);
        }
      }
    }
    Object.keys(pricePool).forEach(function (k) {
      var arr = pricePool[k].slice().sort(function (a, b) { return a - b; });
      if (arr.length >= 8) cache.stats[k] = { median: arr[Math.floor(arr.length / 2)], n: arr.length, at: Date.now() };
    });
    if (fresh.length) {
      // Nieuwste ronde voorop, platforms afwisselen, aanvullen met vorige ronde
      var byP = { marktplaats: [], vinted: [], ebay: [] };
      fresh.forEach(function (it) { byP[it.platform].push(it); });
      var mixed = [];
      for (var k = 0; mixed.length < fresh.length; k++) {
        ['marktplaats', 'vinted', 'ebay'].forEach(function (pl) { if (byP[pl][k]) mixed.push(byP[pl][k]); });
      }
      var prevSeen = {};
      cache.items.forEach(function (it) { prevSeen[it.id] = it.seenAt; });
      mixed.forEach(function (it) { it.seenAt = prevSeen[it.id] || Date.now(); });
      var seen = {};
      cache.items = mixed.concat(cache.items).filter(function (it) {
        if (seen[it.id]) return false; seen[it.id] = 1; return true;
      }).slice(0, MAX_ITEMS);
      cache.updatedAt = new Date().toISOString();
      cache.checked = checked;
    }
  } finally {
    busy = false;
  }
}

function get() { return cache; }

function start() {
  setTimeout(refresh, 15 * 1000);
  setInterval(refresh, REFRESH_MS);
}

module.exports = { start: start, get: get, refresh: refresh };
