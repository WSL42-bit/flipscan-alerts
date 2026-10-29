// Dagelijkse deal-video (1080x1920, ~20 sec) met echte advertentiefoto's, prijzen en marge t.o.v. de gemiddelde vraagprijs.
// Slides worden met Chromium gerenderd (foto's onvervormd: object-fit contain), ffmpeg maakt er een mp4 van.
// De bot stuurt de video elke ochtend naar de beheerder, of direct met /video.
var fs = require('fs');
var os = require('os');
var path = require('path');
var execFile = require('child_process').execFile;
var db = require('./db');
var livefeed = require('./livefeed');

var W = 1080, H = 1920;
var LABEL = { marktplaats: 'Marktplaats', vinted: 'Vinted', ebay: 'eBay' };
var COLOR = { marktplaats: '#E9741B', vinted: '#09B1BA', ebay: '#E53238' };

function euro(n) { return '€' + (Math.round(n) === n ? n.toLocaleString('nl-NL') : n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function cap(s) { return String(s).replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }

// Kies de beste deals: duidelijk onder de gemiddelde vraagprijs, maar niet verdacht goedkoop, en gevarieerd
function pickDeals(max) {
  var c = livefeed.get();
  var withMargin = c.items.map(function (it) {
    var st = c.stats && c.stats[it.query];
    if (!st || !it.price) return null;
    var diff = st.median - it.price;
    return Object.assign({}, it, { median: st.median, n: st.n, diff: diff, pct: diff / st.median });
  }).filter(function (d) { return d && d.pct >= 0.12 && d.pct <= 0.65 && d.diff >= 15; });
  withMargin.sort(function (a, b) { return b.diff - a.diff; });
  var out = [], usedQ = {};
  withMargin.forEach(function (d) { if (out.length < max && !usedQ[d.query]) { usedQ[d.query] = 1; out.push(d); } });
  withMargin.forEach(function (d) { if (out.length < max && out.indexOf(d) === -1) out.push(d); });
  return out;
}

var BASE_CSS = '@import url("https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;700&display=swap");' +
  '*{margin:0;padding:0;box-sizing:border-box}html,body{width:' + W + 'px;height:' + H + 'px;overflow:hidden}' +
  "body{font-family:'Apercu Mono Pro','Geist Mono',monospace;background:#0E1116;color:#fff;letter-spacing:-.02em}";

function introHtml(n, date) {
  return '<style>' + BASE_CSS + '.w{height:100%;display:flex;flex-direction:column;justify-content:center;padding:110px}' +
    '.tag{display:inline-block;background:#2340F5;padding:14px 26px;border-radius:999px;font-size:34px;font-weight:700;margin-bottom:50px;align-self:flex-start}' +
    'h1{font-size:118px;line-height:1.02;font-weight:700;letter-spacing:-.05em}h1 span{color:#8EA0FF}p{font-size:40px;color:#B7BDC8;margin-top:50px;line-height:1.35}</style>' +
    '<div class="w"><div class="tag">FLIPSCAN · ' + esc(date) + '</div><h1>' + n + ' deals die FlipScan <span>vandaag</span> vond</h1>' +
    '<p>Onder de gemiddelde vraagprijs op Marktplaats, Vinted en eBay.</p></div>';
}

function dealHtml(d, i, n) {
  return '<style>' + BASE_CSS +
    '.bg{position:absolute;inset:-60px;background:url("' + esc(d.image) + '") center/cover;filter:blur(60px) brightness(.45)}' +
    '.photo{position:absolute;left:60px;right:60px;top:150px;height:1000px;border-radius:40px;overflow:hidden;background:rgba(0,0,0,.35)}' +
    '.photo img{width:100%;height:100%;object-fit:contain}' +
    '.count{position:absolute;top:60px;left:60px;font-size:34px;font-weight:700;color:#fff;opacity:.85}' +
    '.plat{position:absolute;top:50px;right:60px;background:#fff;color:#0E1116;border-radius:999px;padding:12px 26px;font-size:32px;font-weight:700;display:flex;align-items:center;gap:14px}' +
    '.plat i{width:20px;height:20px;border-radius:50%;background:' + COLOR[d.platform] + '}' +
    '.card{position:absolute;left:60px;right:60px;bottom:90px;background:#fff;color:#0E1116;border-radius:40px;padding:46px 50px}' +
    '.t{font-size:40px;line-height:1.2;font-weight:500;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
    '.row{display:flex;align-items:flex-end;justify-content:space-between;margin-top:26px}' +
    '.p{font-size:104px;font-weight:700;letter-spacing:-.05em;line-height:1}' +
    '.m{text-align:right;font-size:30px;color:#3A4250;line-height:1.35}.m s{color:#6B7280}' +
    '.save{margin-top:26px;background:#E7F6EE;color:#0F8A4F;border-radius:20px;padding:20px 26px;font-size:36px;font-weight:700}' +
    '.save small{display:block;font-size:24px;font-weight:500;color:#3A4250;margin-top:6px}</style>' +
    '<div class="bg"></div><div class="count">' + (i + 1) + '/' + n + '</div>' +
    '<div class="plat"><i></i>' + LABEL[d.platform] + (d.location ? ' · ' + esc(String(d.location).slice(0, 18)) : '') + '</div>' +
    '<div class="photo"><img src="' + esc(d.image) + '"></div>' +
    '<div class="card"><div class="t">' + esc(d.title) + '</div>' +
    '<div class="row"><div class="p">' + euro(d.price) + '</div><div class="m">gem. vraagprijs<br><s>' + euro(d.median) + '</s></div></div>' +
    '<div class="save">Potentiële marge ' + euro(Math.round(d.diff)) + ' (' + Math.round(d.pct * 100) + '% onder gemiddeld)' +
    '<small>Gemiddelde van ' + d.n + ' vergelijkbare advertenties voor "' + esc(cap(d.query)) + '", excl. kosten</small></div></div>';
}

function outroHtml() {
  return '<style>' + BASE_CSS + '.w{height:100%;display:flex;flex-direction:column;justify-content:center;padding:110px;background:#2340F5}' +
    'h1{font-size:104px;line-height:1.03;font-weight:700;letter-spacing:-.05em}p{font-size:44px;margin-top:46px;line-height:1.35;opacity:.92}' +
    '.url{margin-top:80px;background:#fff;color:#0E1116;border-radius:999px;padding:30px 46px;font-size:52px;font-weight:700;align-self:flex-start}' +
    '.s{margin-top:30px;font-size:34px;opacity:.85}</style>' +
    '<div class="w"><h1>Wil jij dit als eerste zien?</h1><p>FlipScan stuurt je binnen een minuut een Telegram melding van nieuwe advertenties die passen bij jouw zoekopdracht.</p>' +
    '<div class="url">flipscanalerts.nl</div><div class="s">2 dagen gratis proberen</div></div>';
}

function run(cmd, args) {
  return new Promise(function (resolve, reject) {
    execFile(cmd, args, { maxBuffer: 1 << 26 }, function (err, out, se) { if (err) reject(new Error(String(se || err.message).slice(-600))); else resolve(out); });
  });
}

async function renderSlides(slides, dir) {
  var puppeteer = require('puppeteer');
  var browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  try {
    var page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    var files = [];
    for (var i = 0; i < slides.length; i++) {
      await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body>' + slides[i] + '</body></html>', { waitUntil: 'domcontentloaded', timeout: 20000 });
      // Wacht max 10 sec op foto's en lettertype, ook als een externe bron niet reageert
      await page.evaluate(function () {
        var imgs = Array.prototype.map.call(document.images, function (im) {
          return im.complete ? null : new Promise(function (r) { im.onload = im.onerror = r; });
        }).filter(Boolean);
        var fonts = document.fonts ? document.fonts.ready : Promise.resolve();
        return Promise.race([Promise.all(imgs.concat([fonts])), new Promise(function (r) { setTimeout(r, 10000); })]);
      });
      var ok = await page.evaluate(function () { return Array.prototype.every.call(document.images, function (im) { return im.complete && im.naturalWidth > 0; }); });
      var f = path.join(dir, 's' + i + '.png');
      await page.screenshot({ path: f });
      files.push({ file: f, ok: ok });
    }
    return files;
  } finally {
    await browser.close();
  }
}

// Maakt de video en geeft { file, caption, deals } terug, of null als er te weinig goede deals zijn
async function make() {
  var deals = pickDeals(5);
  if (deals.length < 3) return null;
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsvid-'));
  var date = new Date().toLocaleDateString('nl-NL', { timeZone: 'Europe/Amsterdam', day: 'numeric', month: 'long' }).toUpperCase();
  var slides = [introHtml(deals.length, date)].concat(deals.map(function (d, i) { return dealHtml(d, i, deals.length); })).concat([outroHtml()]);
  var rendered = await renderSlides(slides, dir);
  // Slides waarvan de advertentiefoto niet laadde, laten we weg
  var keep = rendered.filter(function (r, i) { return i === 0 || i === rendered.length - 1 || r.ok; });
  var used = deals.filter(function (d, i) { return rendered[i + 1].ok; });
  if (used.length < 3) return null;
  keep[0].dur = 2.6; keep[keep.length - 1].dur = 3.4;
  var clips = [];
  for (var i = 0; i < keep.length; i++) {
    var dur = keep[i].dur || 3.2;
    var out = path.join(dir, 'c' + i + '.mp4');
    // Lichte zoom op het hele beeld (beeldverhouding blijft gelijk, niks vervormt) + korte fades
    await run('ffmpeg', ['-y', '-loop', '1', '-i', keep[i].file, '-t', String(dur), '-vf',
      "scale=1188:2112,zoompan=z='min(1+0.0009*on,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=" + Math.round(dur * 30) + ":s=1080x1920:fps=30," +
      'fade=t=in:st=0:d=0.25,fade=t=out:st=' + (dur - 0.25).toFixed(2) + ':d=0.25,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-an', out]);
    clips.push(out);
  }
  var list = path.join(dir, 'list.txt');
  fs.writeFileSync(list, clips.map(function (c) { return "file '" + c + "'"; }).join('\n'));
  var file = path.join(dir, 'flipscan-deals.mp4');
  await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', file]);
  var best = used[0];
  var caption = used.length + ' deals die FlipScan vandaag vond 👀 Beste: ' + best.title.slice(0, 40) + ' voor ' + euro(best.price) +
    ' (gem. ' + euro(best.median) + '). Krijg ze als eerste via de link in bio 🔔\n\n#flippen #marktplaats #vinted #ebay #tweedehands #sidehustle #resell';
  return { file: file, dir: dir, caption: caption, deals: used };
}

async function sendTo(chatId) {
  var v = await make();
  if (!v) {
    await tgText(chatId, 'Vandaag te weinig duidelijke deals voor een video (minimaal 3 nodig). Morgen weer.');
    return false;
  }
  var fd = new FormData();
  fd.append('chat_id', String(chatId));
  fd.append('caption', 'Video van vandaag. Zet er een trending sound onder en post op TikTok en Instagram Reels.\n\nCaption om te kopiëren:\n\n' + v.caption);
  fd.append('supports_streaming', 'true');
  fd.append('video', new Blob([fs.readFileSync(v.file)], { type: 'video/mp4' }), 'flipscan-deals.mp4');
  var res = await fetch('https://api.telegram.org/bot' + process.env.TELEGRAM_BOT_TOKEN + '/sendVideo', { method: 'POST', body: fd });
  var j = await res.json().catch(function () { return {}; });
  try { fs.rmSync(v.dir, { recursive: true, force: true }); } catch (e) {}
  if (!j.ok) console.error('[video] versturen mislukt:', j.description);
  return !!j.ok;
}

function tgText(chatId, text) {
  return fetch('https://api.telegram.org/bot' + process.env.TELEGRAM_BOT_TOKEN + '/sendMessage', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: text })
  }).catch(function () {});
}

// Elke ochtend om 08:30 naar de beheerder
var lastDay = '';
function start() {
  setInterval(async function () {
    var now = new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    var day = new Date().toISOString().slice(0, 10);
    if (now !== '08:30' || lastDay === day) return;
    lastDay = day;
    try {
      var a = (await db.pool.query("SELECT v FROM growth_kv WHERE k='admin_chat'")).rows[0];
      if (a) await sendTo(a.v);
    } catch (e) { console.error('[video] dagelijks:', e.message); }
  }, 30 * 1000);
}

module.exports = { make: make, sendTo: sendTo, start: start, pickDeals: pickDeals };
