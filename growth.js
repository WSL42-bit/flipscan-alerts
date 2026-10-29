// Groei-automatisering. Draait volledig vanzelf in de backend:
// 1. Founder deal: eerste 100 abonnees €9,99 per maand (Stripe prijs wordt automatisch aangemaakt)
// 2. Referrals: eigen link per gebruiker, vriend krijgt 7 dagen gratis, jij €4,99 tegoed per betalende vriend
// 3. Gratis Telegram dealskanaal dat zichzelf vult met echte deals (met upsell naar Pro)
// 4. Dagrapport en /stats voor de beheerder
var crypto = require('crypto');
var db = require('./db');
var tg = require('./telegram');
var livefeed = require('./livefeed');

var FOUNDER_TOTAL = 100;
var FOUNDER_CENTS = 999;
var FOUNDER_LOOKUP = 'flipscan_founder_month';
var REF_TRIAL_DAYS = 7;
var REF_CREDIT_CENTS = 499;
var CHANNEL = process.env.TELEGRAM_CHANNEL || '@FlipScanDeals';
var BOT = process.env.TELEGRAM_BOT_USERNAME || 'FlipScanAlertsBot';
var DELAY_MIN = 15;          // kanaal post pas als we de deal minstens 15 min geleden vonden
var POST_EVERY_MIN = 40;     // tussen 08:00 en 23:00
var stripe = null;
var founderPriceId = null;

async function init(stripeClient) {
  stripe = stripeClient;
  await db.pool.query(
    'ALTER TABLE alert_users ADD COLUMN IF NOT EXISTS ref_code TEXT;' +
    'ALTER TABLE alert_users ADD COLUMN IF NOT EXISTS referred_by BIGINT;' +
    'ALTER TABLE alert_users ADD COLUMN IF NOT EXISTS source TEXT;' +
    'ALTER TABLE alert_users ADD COLUMN IF NOT EXISTS founder BOOLEAN NOT NULL DEFAULT FALSE;' +
    'ALTER TABLE alert_users ADD COLUMN IF NOT EXISTS ref_rewarded BOOLEAN NOT NULL DEFAULT FALSE;' +
    'ALTER TABLE alert_users ADD COLUMN IF NOT EXISTS pending_credit_cents INTEGER NOT NULL DEFAULT 0;' +
    'ALTER TABLE alert_users ADD COLUMN IF NOT EXISTS sub_status TEXT;' +
    'ALTER TABLE alert_users ADD COLUMN IF NOT EXISTS paid_since TIMESTAMPTZ;' +
    'CREATE UNIQUE INDEX IF NOT EXISTS alert_users_ref_code ON alert_users(ref_code);' +
    'CREATE TABLE IF NOT EXISTS growth_kv (k TEXT PRIMARY KEY, v TEXT);' +
    'CREATE TABLE IF NOT EXISTS channel_posts (item_id TEXT PRIMARY KEY, posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW());'
  );
  await ensureFounderPrice();
}

// ---------- Founder deal ----------
async function ensureFounderPrice() {
  if (!stripe || !process.env.STRIPE_PRICE_MONTHLY) return;
  try {
    var found = await stripe.prices.list({ lookup_keys: [FOUNDER_LOOKUP], active: true, limit: 1 });
    if (found.data[0]) { founderPriceId = found.data[0].id; return; }
    var monthly = await stripe.prices.retrieve(process.env.STRIPE_PRICE_MONTHLY);
    var p = await stripe.prices.create({
      product: typeof monthly.product === 'string' ? monthly.product : monthly.product.id,
      currency: 'eur', unit_amount: FOUNDER_CENTS, recurring: { interval: 'month' },
      lookup_key: FOUNDER_LOOKUP, nickname: 'Founder (eerste 100)'
    });
    founderPriceId = p.id;
    console.log('[growth] founder prijs aangemaakt: ' + p.id);
  } catch (e) {
    console.error('[growth] founder prijs:', e.message);
  }
}

async function founderLeft() {
  // Founder deal pas aan als de checkout-koppeling veilig live staat (FOUNDER_ENABLED=1)
  if (!founderPriceId || process.env.FOUNDER_ENABLED !== '1') return 0;
  var n = (await db.pool.query('SELECT COUNT(*)::int AS n FROM alert_users WHERE founder = TRUE')).rows[0].n;
  return Math.max(0, FOUNDER_TOTAL - n);
}

function isFounderPrice(id) { return !!id && id === founderPriceId; }

// ---------- Referrals en bron ----------
function newCode() { return crypto.randomBytes(4).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() || 'FS' + Date.now().toString(36); }

async function refCode(chatId) {
  var r = (await db.pool.query('SELECT ref_code FROM alert_users WHERE chat_id=$1', [chatId])).rows[0];
  if (r && r.ref_code) return r.ref_code;
  for (var i = 0; i < 5; i++) {
    try {
      var c = newCode();
      await db.pool.query('UPDATE alert_users SET ref_code=$1 WHERE chat_id=$2', [c, chatId]);
      return c;
    } catch (e) { /* botsing, opnieuw */ }
  }
  return null;
}

function refLink(code) { return 'https://t.me/' + BOT + '?start=ref_' + code; }

// Wordt aangeroepen bij /start <payload>. Alleen voor nieuwe gebruikers vastleggen.
async function onStart(chatId, payload, isNew) {
  if (!isNew || !payload) return;
  var p = String(payload).slice(0, 60);
  if (p.indexOf('ref_') === 0) {
    var ref = (await db.pool.query('SELECT chat_id FROM alert_users WHERE ref_code=$1', [p.slice(4).toUpperCase()])).rows[0];
    if (ref && String(ref.chat_id) !== String(chatId)) {
      await db.pool.query('UPDATE alert_users SET referred_by=$1, source=$2 WHERE chat_id=$3', [ref.chat_id, 'referral', chatId]);
      return 'ref';
    }
  }
  var src = p.indexOf('src_') === 0 ? p.slice(4) : p;
  await db.pool.query('UPDATE alert_users SET source=$1 WHERE chat_id=$2 AND source IS NULL', [src.replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'onbekend', chatId]);
}

// Checkout instellingen voor deze gebruiker (founder prijs, langere proef bij referral)
async function checkoutOptions(chatId, interval, defaultPrice, trial) {
  var u = (await db.pool.query('SELECT referred_by FROM alert_users WHERE chat_id=$1', [chatId])).rows[0] || {};
  var out = { price: defaultPrice, founder: false, trialDays: null };
  if (interval === 'month' && (await founderLeft()) > 0) { out.price = founderPriceId; out.founder = true; }
  if (trial && u.referred_by) out.trialDays = REF_TRIAL_DAYS;
  return out;
}

async function applyPendingCredit(chatId, customerId) {
  if (!stripe || !customerId) return;
  var u = (await db.pool.query('SELECT pending_credit_cents FROM alert_users WHERE chat_id=$1', [chatId])).rows[0];
  if (!u || !u.pending_credit_cents) return;
  await stripe.customers.createBalanceTransaction(customerId, { amount: -u.pending_credit_cents, currency: 'eur', description: 'FlipScan referral tegoed' });
  await db.pool.query('UPDATE alert_users SET pending_credit_cents=0 WHERE chat_id=$1', [chatId]);
}

// Na checkout.session.completed
async function onCheckoutCompleted(chatId, session) {
  if (session.metadata && session.metadata.founder === '1') {
    await db.pool.query('UPDATE alert_users SET founder=TRUE WHERE chat_id=$1', [chatId]);
  }
  try { await applyPendingCredit(chatId, session.customer); } catch (e) { console.error('[growth] tegoed:', e.message); }
}

// Na customer.subscription.updated/deleted. prev = event.data.previous_attributes
async function onSubscriptionChange(sub, prev) {
  var u = (await db.pool.query('SELECT chat_id, referred_by, ref_rewarded, paid_since FROM alert_users WHERE stripe_customer_id=$1', [sub.customer])).rows[0];
  if (!u) return;
  await db.pool.query('UPDATE alert_users SET sub_status=$1 WHERE chat_id=$2', [sub.status, u.chat_id]);
  var priceId = sub.items && sub.items.data[0] ? sub.items.data[0].price.id : null;
  if (isFounderPrice(priceId)) await db.pool.query('UPDATE alert_users SET founder=TRUE WHERE chat_id=$1', [u.chat_id]);
  var nowPaying = sub.status === 'active' && (!prev || prev.status === 'trialing' || prev.status === 'incomplete' || !u.paid_since);
  if (sub.status === 'active' && !u.paid_since) await db.pool.query('UPDATE alert_users SET paid_since=NOW() WHERE chat_id=$1', [u.chat_id]);
  // Referral beloning bij de eerste echte betaling van de vriend
  if (nowPaying && u.referred_by && !u.ref_rewarded) {
    await db.pool.query('UPDATE alert_users SET ref_rewarded=TRUE WHERE chat_id=$1', [u.chat_id]);
    var ref = (await db.pool.query('SELECT chat_id, stripe_customer_id FROM alert_users WHERE chat_id=$1', [u.referred_by])).rows[0];
    if (ref) {
      try {
        if (ref.stripe_customer_id && stripe) {
          await stripe.customers.createBalanceTransaction(ref.stripe_customer_id, { amount: -REF_CREDIT_CENTS, currency: 'eur', description: 'FlipScan referral tegoed' });
        } else {
          await db.pool.query('UPDATE alert_users SET pending_credit_cents = pending_credit_cents + $1 WHERE chat_id=$2', [REF_CREDIT_CENTS, ref.chat_id]);
        }
        await tg.sendMessage(ref.chat_id, '🎁 Een vriend die jij uitnodigde is nu abonnee. Je hebt <b>€4,99 tegoed</b> gekregen, dat gaat automatisch van je volgende betaling af.\n\nStuur /vrienden voor je link en je stand.');
      } catch (e) { console.error('[growth] referral beloning:', e.message); }
    }
  }
}

async function referralText(chatId) {
  var code = await refCode(chatId);
  var r = (await db.pool.query(
    "SELECT COUNT(*)::int AS joined, COUNT(*) FILTER (WHERE ref_rewarded)::int AS paid FROM alert_users WHERE referred_by=$1", [chatId])).rows[0];
  return '🤝 <b>Nodig vrienden uit</b>\n\n' +
    'Jouw vriend krijgt <b>' + REF_TRIAL_DAYS + ' dagen gratis</b> (in plaats van 2). Wordt hij abonnee, dan krijg jij <b>€4,99 tegoed</b>. Geen maximum.\n\n' +
    'Jouw link:\n' + refLink(code) + '\n\n' +
    'Aangemeld via jou: ' + r.joined + ' · betalend: ' + r.paid;
}

async function referralInfo(chatId) {
  var code = await refCode(chatId);
  var r = (await db.pool.query("SELECT COUNT(*)::int AS joined, COUNT(*) FILTER (WHERE ref_rewarded)::int AS paid FROM alert_users WHERE referred_by=$1", [chatId])).rows[0];
  return { link: refLink(code), joined: r.joined, paid: r.paid, trialDays: REF_TRIAL_DAYS, credit: '€4,99' };
}

// ---------- Dealskanaal ----------
var lastChannelError = 0;
var postCount = 0;

function amsterdam() {
  var parts = new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  var o = {}; parts.forEach(function (p) { o[p.type] = p.value; });
  return { h: +o.hour, m: +o.minute };
}

var PLATFORM = { marktplaats: '🟠 Marktplaats', vinted: '🟢 Vinted', ebay: '🔵 eBay' };

async function postDeal() {
  var c = livefeed.get();
  var cutoff = Date.now() - DELAY_MIN * 60 * 1000;
  var candidates = c.items.filter(function (it) { return it.seenAt && it.seenAt <= cutoff; });
  if (!candidates.length) return;
  var posted = (await db.pool.query('SELECT item_id FROM channel_posts WHERE posted_at > NOW() - INTERVAL \'7 days\'')).rows.map(function (r) { return r.item_id; });
  var lastQ = (await db.pool.query("SELECT v FROM growth_kv WHERE k='last_channel_query'")).rows[0];
  var pick = candidates.filter(function (it) { return posted.indexOf(it.id) === -1 && (!lastQ || it.query !== lastQ.v); })[0] ||
             candidates.filter(function (it) { return posted.indexOf(it.id) === -1; })[0];
  if (!pick) return;
  var mins = Math.round((Date.now() - pick.seenAt) / 60000);
  var left = await founderLeft();
  var caption = '<b>' + tg.esc(pick.title) + '</b>\n💶 €' + String(pick.price).replace('.', ',') + '\n' +
    PLATFORM[pick.platform] + (pick.location ? ' · ' + tg.esc(pick.location) : '') + '\n\n' +
    '⏱ FlipScan vond deze ' + mins + ' min geleden. Met Pro krijg je dit soort deals binnen een minuut, voor je eigen zoekopdracht.' +
    (left > 0 ? '\n🔥 Founder deal: €9,99 p/m voor de eerste 100 (nog ' + left + ' plekken)' : '');
  var markup = { inline_keyboard: [
    [{ text: 'Bekijk advertentie', url: pick.url }],
    [{ text: '⚡ Zelf als eerste? 2 dagen gratis', url: 'https://t.me/' + BOT + '?start=src_kanaal' }]
  ] };
  var r = await tg.call('sendPhoto', { chat_id: CHANNEL, photo: pick.image, caption: caption, parse_mode: 'HTML', reply_markup: markup });
  if (!r.ok) {
    if (Date.now() - lastChannelError > 6 * 3600 * 1000) {
      lastChannelError = Date.now();
      console.error('[growth] kanaal ' + CHANNEL + ' post mislukt (is de bot admin van het kanaal?): ' + (r.description || ''));
    }
    return;
  }
  postCount++;
  await db.pool.query('INSERT INTO channel_posts (item_id) VALUES ($1) ON CONFLICT DO NOTHING', [pick.id]);
  await db.pool.query("INSERT INTO growth_kv (k, v) VALUES ('last_channel_query', $1) ON CONFLICT (k) DO UPDATE SET v=$1", [pick.query]);
}

async function postPromo() {
  var left = await founderLeft();
  var text = left > 0
    ? '🔥 <b>Founder deal</b>\n\nDe eerste 100 abonnees betalen <b>€9,99 per maand</b> in plaats van €14,99, zolang je abonnement loopt. Nog <b>' + left + '</b> plekken.\n\nJe krijgt elke nieuwe advertentie die past bij jouw zoekopdracht binnen een minuut op je telefoon. Marktplaats, Vinted en eBay, 25 zoekopdrachten, elk met prijsfilter. Eerst 2 dagen gratis.'
    : '⚡ <b>Waarom wachten op dit kanaal?</b>\n\nMet FlipScan Pro krijg je elke nieuwe advertentie die past bij jouw zoekopdracht binnen een minuut. Marktplaats, Vinted en eBay, 25 zoekopdrachten met prijsfilter. 2 dagen gratis.';
  await tg.call('sendMessage', { chat_id: CHANNEL, text: text, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Start 2 dagen gratis', url: 'https://t.me/' + BOT + '?start=src_kanaal' }]] } });
}

// ---------- Beheerder ----------
function isAdmin(from, chatId) {
  var names = String(process.env.ADMIN_USERNAMES || process.env.ADMIN_USERNAME || '').toLowerCase().replace(/@/g, '').split(/[,\s]+/).filter(Boolean);
  var ids = String(process.env.ADMIN_CHAT_IDS || '').split(/[,\s]+/).filter(Boolean);
  return (from && from.username && names.indexOf(from.username.toLowerCase()) !== -1) || ids.indexOf(String(chatId)) !== -1;
}

async function isAdminChat(from, chatId) {
  if (isAdmin(from, chatId)) return true;
  var r = (await db.pool.query("SELECT v FROM growth_kv WHERE k='admin_chat'")).rows[0];
  return !!r && r.v === String(chatId);
}

// /admin <waarde van ADMIN_USERNAME> koppelt dit Telegram account als beheerder
async function claimAdmin(chatId, code) {
  var want = String(process.env.ADMIN_USERNAME || '').toLowerCase().replace(/@/g, '').trim();
  if (!want || String(code || '').toLowerCase().replace(/@/g, '').trim() !== want) return false;
  await registerAdmin(chatId);
  return true;
}

async function registerAdmin(chatId) {
  await db.pool.query("INSERT INTO growth_kv (k, v) VALUES ('admin_chat', $1) ON CONFLICT (k) DO UPDATE SET v=$1", [String(chatId)]);
}

async function statsText() {
  var q = function (sql) { return db.pool.query(sql).then(function (r) { return r.rows[0]; }); };
  var t = await q("SELECT COUNT(*)::int AS users," +
    " COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS new24," +
    " COUNT(*) FILTER (WHERE sub_status='trialing')::int AS trials," +
    " COUNT(*) FILTER (WHERE sub_status='active')::int AS paying," +
    " COUNT(*) FILTER (WHERE sub_status='active' AND plan_interval='week')::int AS weekly," +
    " COUNT(*) FILTER (WHERE sub_status='active' AND plan_interval='month' AND NOT founder)::int AS monthly," +
    " COUNT(*) FILTER (WHERE sub_status='active' AND founder)::int AS founders," +
    " COUNT(*) FILTER (WHERE sub_status IN ('canceled','unpaid','incomplete_expired'))::int AS churned," +
    " COUNT(*) FILTER (WHERE referred_by IS NOT NULL)::int AS referred FROM alert_users");
  var srcs = (await db.pool.query("SELECT COALESCE(source,'onbekend') AS s, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE sub_status IN ('active','trialing'))::int AS conv FROM alert_users GROUP BY 1 ORDER BY 2 DESC LIMIT 8")).rows;
  var topRef = (await db.pool.query("SELECT u.username, u.first_name, COUNT(r.*)::int AS n FROM alert_users r JOIN alert_users u ON u.chat_id=r.referred_by GROUP BY 1,2 ORDER BY 3 DESC LIMIT 5")).rows;
  var posts = await q("SELECT COUNT(*)::int AS n FROM channel_posts WHERE posted_at > NOW() - INTERVAL '24 hours'");
  var mrr = t.weekly * 4.99 * 52 / 12 + t.monthly * 14.99 + t.founders * 9.99;
  var f = livefeed.get();
  return '📊 <b>FlipScan stand</b>\n\n' +
    '💰 Betalend: <b>' + t.paying + '</b> / 100 doel\n' +
    '🧪 In proef: ' + t.trials + '\n' +
    '📈 MRR: €' + mrr.toFixed(0) + '\n' +
    '🔥 Founder plekken over: ' + (await founderLeft()) + '\n' +
    '👥 Gebruikers: ' + t.users + ' (+' + t.new24 + ' in 24u)\n' +
    '↩️ Gestopt: ' + t.churned + '\n' +
    '🤝 Via referral: ' + t.referred + '\n\n' +
    '<b>Bronnen</b> (aanmeldingen / actief)\n' + (srcs.map(function (s) { return '· ' + tg.esc(s.s) + ': ' + s.n + ' / ' + s.conv; }).join('\n') || '· nog niks') + '\n\n' +
    (topRef.length ? '<b>Top referrers</b>\n' + topRef.map(function (r) { return '· ' + tg.esc(r.username ? '@' + r.username : r.first_name) + ': ' + r.n; }).join('\n') + '\n\n' : '') +
    '📣 Kanaalposts 24u: ' + posts.n + '\n' +
    '🛰 Live feed: ' + f.items.length + ' deals, laatste check ' + (f.updatedAt ? new Date(f.updatedAt).toLocaleTimeString('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit' }) : 'nog niet');
}

async function dailyReport() {
  var a = (await db.pool.query("SELECT v FROM growth_kv WHERE k='admin_chat'")).rows[0];
  if (!a) return;
  await tg.sendMessage(a.v, await statsText());
}

// ---------- Planner ----------
var lastMinuteKey = '';
async function tick() {
  var t = amsterdam();
  var key = t.h + ':' + t.m;
  if (key === lastMinuteKey) return;
  lastMinuteKey = key;
  try {
    var minuteOfDay = t.h * 60 + t.m;
    if (t.h >= 8 && t.h < 23 && minuteOfDay % POST_EVERY_MIN === 0) {
      var n = (await db.pool.query("SELECT COUNT(*)::int AS n FROM channel_posts WHERE posted_at::date = NOW()::date")).rows[0].n;
      if (n > 0 && n % 6 === 0 && !(await db.pool.query("SELECT 1 FROM growth_kv WHERE k='promo_' || $1", [String(n) + NOW_DATE()])).rows[0]) {
        await db.pool.query("INSERT INTO growth_kv (k, v) VALUES ('promo_' || $1, '1') ON CONFLICT DO NOTHING", [String(n) + NOW_DATE()]);
        await postPromo();
      } else {
        await postDeal();
      }
    }
    if (t.h === 9 && t.m === 0) await dailyReport();
  } catch (e) {
    console.error('[growth] planner:', e.message);
  }
}
function NOW_DATE() { return new Date().toISOString().slice(0, 10); }

function start() {
  setInterval(tick, 20 * 1000);
}

module.exports = {
  init: init, start: start, founderLeft: founderLeft, isFounderPrice: isFounderPrice,
  onStart: onStart, checkoutOptions: checkoutOptions, onCheckoutCompleted: onCheckoutCompleted,
  onSubscriptionChange: onSubscriptionChange, referralText: referralText, referralInfo: referralInfo,
  isAdmin: isAdmin, isAdminChat: isAdminChat, claimAdmin: claimAdmin, registerAdmin: registerAdmin, statsText: statsText, postDeal: postDeal,
  FOUNDER_TOTAL: FOUNDER_TOTAL, CHANNEL: CHANNEL
};
