// Rendering van alle publieke pagina's. Gebruikt door de server (index.js) en door build-netlify.js
var fs = require('fs');
var path = require('path');
var PUB = path.join(__dirname, 'public');
function read(f) { return fs.readFileSync(path.join(PUB, f), 'utf8'); }

var SITE = require('./origin')();
var HAS_APERCU = fs.existsSync(path.join(PUB, 'assets/fonts/ApercuMonoPro-Regular.woff2'));
var BOT = process.env.TELEGRAM_BOT_USERNAME || 'FlipScanAlertsBot';

function head(title, desc, urlPath) {
  return '<!doctype html>\n<html lang="nl">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    '<title>' + title + '</title>\n<meta name="description" content="' + desc + '">\n' +
    '<link rel="canonical" href="' + SITE + urlPath + '">\n' +
    '<meta property="og:type" content="website">\n<meta property="og:title" content="' + title + '">\n<meta property="og:description" content="' + desc + '">\n' +
    '<meta property="og:url" content="' + SITE + urlPath + '">\n<meta property="og:image" content="' + SITE + '/img/og.jpg">\n<meta name="twitter:card" content="summary_large_image">\n' +
    '<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">\n<meta name="theme-color" content="#0E1116">\n' +
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    (HAS_APERCU ? '<link rel="preload" href="/assets/fonts/ApercuMonoPro-Regular.woff2" as="font" type="font/woff2" crossorigin>\n' : '') +
    '<link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@300;400;500;700&display=swap" rel="stylesheet">\n' +
    '<link rel="stylesheet" href="/assets/site.css">\n</head>\n<body>\n{{HEADER}}\n<main id="main">\n';
}

// Versie per bestand: na elke update laden browsers en Cloudflare meteen de nieuwe CSS/JS
var VERSION = {};
['css', 'js'].forEach(function (ext) {
  VERSION[ext] = require('crypto').createHash('md5').update(read('assets/site.' + ext)).digest('hex').slice(0, 8);
});

function fill(html, nav) {
  var header = read('partials/header.html');
  if (nav) header = header.replace('data-nav="' + nav + '"', 'data-nav="' + nav + '" aria-current="page"');
  return html.replace('{{HEADER}}', header).replace('{{FOOTER}}', read('partials/footer.html')).replace(/\{\{BOT\}\}/g, BOT)
    .replace(/\/assets\/site\.(css|js)"/g, function (m, ext) { return '/assets/site.' + ext + '?v=' + VERSION[ext] + '"'; });
}

// Alle pagina's: url, bronbestand, titel, omschrijving, actief menu-item
var PAGES = [
  { url: '/', file: 'home.html', title: 'FlipScan | Als eerste bij elke nieuwe advertentie', desc: 'Krijg binnen een minuut een Telegram melding van nieuwe advertenties op Marktplaats, Vinted en eBay. Sneller kopen, beter flippen. 2 dagen gratis.' },
  { url: '/hoe-het-werkt', file: 'hoe-het-werkt.html', title: 'Hoe het werkt | FlipScan', desc: 'In twee minuten ingesteld: Telegram bot, zoekopdracht, meldingen van nieuwe advertenties op Marktplaats, Vinted en eBay.', nav: 'hoe' },
  { url: '/prijzen', file: 'prijzen.html', title: 'Prijzen | FlipScan', desc: 'FlipScan kost €4,99 per week of €14,99 per maand. De eerste 2 dagen gratis, altijd opzegbaar.', nav: 'prijzen' },
  { url: '/academy', file: 'academy.html', title: 'Academy | FlipScan', desc: 'Gratis gidsen over flippen op Marktplaats, Vinted en eBay.', nav: 'academy' },
  { url: '/academy/beginnen-met-flippen', file: 'academy/beginnen-met-flippen.html', title: 'Beginnen met flippen: je eerste €100 winst | FlipScan Academy', desc: 'Wat je koopt, hoeveel je biedt en hoe je het weer verkoopt.', nav: 'academy' },
  { url: '/academy/goede-zoekopdracht', file: 'academy/goede-zoekopdracht.html', title: 'De perfecte zoekopdracht instellen | FlipScan Academy', desc: 'Zoektermen en prijsfilters die alleen echte deals doorlaten.', nav: 'academy' },
  { url: '/academy/veilig-kopen', file: 'academy/veilig-kopen.html', title: 'Veilig kopen en oplichters herkennen | FlipScan Academy', desc: 'De rode vlaggen die je bij elke tweedehands advertentie checkt.', nav: 'academy' },
  { url: '/voorwaarden', file: 'voorwaarden.html', title: 'Voorwaarden en privacy | FlipScan', desc: 'Algemene voorwaarden en privacyverklaring van FlipScan.' },
  { url: '/404', file: '404.html', title: 'Pagina niet gevonden | FlipScan', desc: 'Deze pagina bestaat niet.', noindex: true }
];

function renderPage(p) {
  var html = head(p.title, p.desc, p.url === '/' ? '' : p.url) + read(p.file) + '\n</main>\n{{FOOTER}}\n</body>\n</html>';
  if (p.noindex) html = html.replace('<head>\n', '<head>\n<meta name="robots" content="noindex">\n');
  return fill(html, p.nav);
}
function renderDashboard() { return fill(read('dashboard.html')); }

function sitemap() {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    PAGES.filter(function (p) { return !p.noindex; }).map(function (p) { return '  <url><loc>' + SITE + (p.url === '/' ? '/' : p.url) + '</loc></url>'; }).join('\n') + '\n</urlset>\n';
}
function robots() { return 'User-agent: *\nAllow: /\nDisallow: /dashboard\nSitemap: ' + SITE + '/sitemap.xml\n'; }

module.exports = { PAGES: PAGES, renderPage: renderPage, renderDashboard: renderDashboard, sitemap: sitemap, robots: robots, PUB: PUB };
