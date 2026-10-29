// Vinted, nieuwe API (sinds september 2026):
// 1. Anoniem token = cookie access_token_web van www.vinted.nl (24 uur geldig)
// 2. Zoeken via https://api.vinted.nl/svc-catalogue/items met "Authorization: Bearer <token>"
// Token eerst licht ophalen (HEAD), lukt dat niet dan via headless Chrome (Datadome).
var BASE = 'https://www.vinted.nl';
var API = 'https://api.vinted.nl/svc-catalogue/items';
var UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
var token = null;
var tokenAt = 0;
var browser = null;

function lastCookie(headers, name) {
  var list = headers.getSetCookie ? headers.getSetCookie() : [];
  var val = null;
  list.forEach(function (c) {
    var kv = c.split(';')[0];
    var i = kv.indexOf('=');
    if (kv.slice(0, i).trim() === name && kv.slice(i + 1)) val = kv.slice(i + 1); // laatste niet-lege waarde
  });
  return val;
}

async function tokenViaFetch() {
  var res = await fetch(BASE + '/catalog', { signal: AbortSignal.timeout(15000), method: 'HEAD', headers: { 'User-Agent': UA, 'Accept-Language': 'nl-NL,nl;q=0.9' } });
  return lastCookie(res.headers, 'access_token_web');
}

async function tokenViaBrowser() {
  var puppeteer = require('puppeteer');
  if (!browser || browser.connected === false) {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-blink-features=AutomationControlled']
    });
    browser.on('disconnected', function () { browser = null; });
  }
  var page = await browser.newPage();
  try {
    await page.setUserAgent(UA);
    await page.goto(BASE + '/catalog', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(function (r) { setTimeout(r, 2000); });
    var cookies = await page.cookies();
    var c = cookies.filter(function (x) { return x.name === 'access_token_web' && x.value; })[0];
    return c ? c.value : null;
  } finally {
    page.close().catch(function () {});
  }
}

async function getToken(force) {
  if (!force && token && Date.now() - tokenAt < 20 * 60 * 60 * 1000) return token;
  var t = null;
  try { t = await tokenViaFetch(); } catch (e) { console.error('[vinted] token via fetch mislukt:', e.message); }
  if (!t) {
    try { t = await tokenViaBrowser(); console.log('[vinted] token via browser opgehaald'); } catch (e) { console.error('[vinted] token via browser mislukt:', e.message); }
  }
  if (!t) throw new Error('Vinted: geen sessie token');
  token = t; tokenAt = Date.now();
  return token;
}

async function call(s, t) {
  var url = API + '?search_text=' + encodeURIComponent(s.query) + '&order=newest_first&page=1&per_page=30' +
    (s.min_price ? '&price_from=' + s.min_price : '') + (s.max_price ? '&price_to=' + s.max_price : '');
  return fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'Authorization': 'Bearer ' + t, 'Accept': 'application/json', 'User-Agent': UA, 'Accept-Language': 'nl-NL,nl;q=0.9' } });
}

async function search(s) {
  var res = await call(s, await getToken(false));
  if (res.status === 401 || res.status === 403) res = await call(s, await getToken(true));
  if (!res.ok) throw new Error('Vinted HTTP ' + res.status);
  var data = await res.json();
  return (data.items || []).filter(function (i) { return !i.promoted && !i.is_promoted; }).map(function (i) {
    var amount = i.price && typeof i.price === 'object' ? i.price.amount : i.price;
    var u = i.url || ('/items/' + i.id);
    return {
      id: String(i.id),
      title: i.title,
      price: amount != null ? parseFloat(amount) : null,
      url: u.indexOf('http') === 0 ? u : BASE + u,
      image: i.photo && i.photo.url ? i.photo.url : null,
      location: i.item_box && i.item_box.second_line ? i.item_box.second_line : null,
      createdAt: i.photo && i.photo.high_resolution && i.photo.high_resolution.timestamp ? i.photo.high_resolution.timestamp * 1000 : null,
      platform: 'vinted'
    };
  });
}

module.exports = { search: search };
