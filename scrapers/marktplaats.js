var UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

function img(l) {
  var u = '';
  if (l.pictures && l.pictures[0]) u = l.pictures[0].extraExtraLargeUrl || l.pictures[0].largeUrl || l.pictures[0].mediumUrl || '';
  if (!u && l.imageUrls && l.imageUrls[0]) u = l.imageUrls[0];
  if (u && u.indexOf('//') === 0) u = 'https:' + u;
  return u || null;
}

// lrp geeft een ISO datum, of soms 'Vandaag' / 'Gisteren' / '28 okt 26'
function parseDate(d) {
  if (!d) return null;
  var t = Date.parse(d);
  if (!isNaN(t)) return t;
  if (/^vandaag$/i.test(d)) return null; // vandaag zonder tijd: onbekend, worker beslist via eerst-gezien
  return 0; // gisteren of ouder
}

async function search(s) {
  var url = 'https://www.marktplaats.nl/lrp/api/search?query=' + encodeURIComponent(s.query) +
    '&limit=30&offset=0&sortBy=SORT_INDEX&sortOrder=DECREASING&viewOptions=list-view';
  var res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  if (!res.ok) throw new Error('Marktplaats HTTP ' + res.status);
  var data = await res.json();
  var listings = data.listings || [];
  return listings
    // Geen betaalde Topadvertenties / Admarkt: die staan bovenaan maar zijn vaak oud
    .filter(function (l) { return l.priceInfo && l.priceInfo.priceType !== 'RESERVED' && /^m/.test(String(l.itemId)) && (!l.priorityProduct || l.priorityProduct === 'NONE'); })
    .map(function (l) {
      var cents = l.priceInfo ? l.priceInfo.priceCents : null;
      return {
        id: String(l.itemId),
        title: l.title,
        price: cents != null ? cents / 100 : null,
        priceLabel: cents ? null : (l.priceInfo && l.priceInfo.priceType === 'FAST_BID' ? 'Bieden' : 'Zie advertentie'),
        url: 'https://www.marktplaats.nl' + l.vipUrl,
        image: img(l),
        location: l.location && l.location.cityName ? l.location.cityName : null,
        createdAt: parseDate(l.date),
        platform: 'marktplaats'
      };
    });
}

module.exports = { search: search };
