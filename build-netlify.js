(function(){
// Bouwt de statische site: node build-netlify.js [map] [netlify|cloudflare]
// Standaard ./netlify-site voor Netlify. Cloudflare: node build-netlify.js cloudflare/public cloudflare
// Zet SITE_URL=https://jouwdomein.nl voor juiste canonical, og en sitemap links.
var fs = require('fs');
var path = require('path');
var render = require('./render');
var OUT = path.resolve(process.argv[2] || 'netlify-site');
var BACKEND = process.env.BACKEND_URL || 'https://flipscan-alerts-production.up.railway.app';
var TARGET = process.argv[3] || 'netlify';

function write(rel, content) {
  var file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  fs.readdirSync(src).forEach(function (n) {
    var s = path.join(src, n), d = path.join(dst, n);
    if (fs.statSync(s).isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  });
}

fs.rmSync(OUT, { recursive: true, force: true });
render.PAGES.forEach(function (p) {
  var rel = p.url === '/' ? 'index.html' : p.url === '/404' ? '404.html' : (TARGET === 'cloudflare' ? p.url.slice(1) + '.html' : p.url.slice(1) + '/index.html');
  write(rel, render.renderPage(p));
});
write(TARGET === 'cloudflare' ? 'dashboard.html' : 'dashboard/index.html', render.renderDashboard());
write('sitemap.xml', render.sitemap());
write('robots.txt', render.robots());
copyDir(path.join(render.PUB, 'assets'), path.join(OUT, 'assets'));
copyDir(path.join(render.PUB, 'img'), path.join(OUT, 'img'));
if (TARGET === 'cloudflare') {
  // Cloudflare Pages: proxy zit in cloudflare/functions/_middleware.js
  write('_routes.json', fs.readFileSync(path.join(__dirname, 'cloudflare', 'routes.json'), 'utf8'));
  write('_headers', fs.readFileSync(path.join(__dirname, 'cloudflare', 'headers.txt'), 'utf8'));
  console.log('Cloudflare site gebouwd in ' + OUT);
  return;
}
write('_redirects', [
  '# Backend (bot, Stripe, login, API) draait 24/7 op Railway',
  '/api/*      ' + BACKEND + '/api/:splat      200',
  '/login      ' + BACKEND + '/login           200',
  '/logout     ' + BACKEND + '/logout          200',
  '/stripe/*   ' + BACKEND + '/stripe/:splat   200',
  '/tg/*       ' + BACKEND + '/tg/:splat       200',
  '/health     ' + BACKEND + '/health          200', ''
].join('\n'));
write('netlify.toml', '[build]\n  publish = "."\n\n[[headers]]\n  for = "/assets/*"\n  [headers.values]\n    Cache-Control = "public, max-age=3600"\n\n[[headers]]\n  for = "/*"\n  [headers.values]\n    X-Frame-Options = "DENY"\n    X-Content-Type-Options = "nosniff"\n    Referrer-Policy = "strict-origin-when-cross-origin"\n');
console.log('Netlify map gebouwd in ' + OUT);

})();
