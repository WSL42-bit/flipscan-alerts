// Maakt de dagelijkse deal-video los van de server (voor automatisch posten naar TikTok).
// Gebruik: node scripts/tiktok-video.js [uitmap]  -> schrijft video.mp4 + caption.txt
var fs = require('fs');
var path = require('path');
var livefeed = require('../livefeed');
var video = require('../video');

(async function () {
  var outDir = process.argv[2] || process.cwd();
  // Alle zoektermen een keer langs, zodat er genoeg prijzen zijn voor de mediaan
  for (var i = 0; i < 12 && video.pickDeals(5).length < 5; i++) await livefeed.refresh();
  var v = await video.make();
  if (!v) { console.error('Te weinig duidelijke deals vandaag'); process.exit(2); }
  fs.mkdirSync(outDir, { recursive: true });
  fs.copyFileSync(v.file, path.join(outDir, 'video.mp4'));
  var caption = v.caption.replace('#resell', '#resell #flipscan').replace('link in bio', 'link in bio, 2 dagen gratis');
  fs.writeFileSync(path.join(outDir, 'caption.txt'), caption);
  console.log(caption);
  process.exit(0);
})().catch(function (e) { console.error(e); process.exit(1); });
