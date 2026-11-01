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

function attr(l, key) {
  var a = (l.attributes || []).filter(function (x) { return x.key === key; })[0];
  return a ? String(a.value || '') : null;
}
// Marktplaats staat: Nieuw / Zo goed als nieuw / Refurbished / Gebruikt / Gedragen
function cond(v) {
  if (!v) return null;
  if (/^nieuw/i.test(v)) return 'nieuw';
  if (/zo goed als nieuw|refurbished/i.test(v)) return 'zgan';
  if (/gebruikt|gedragen/i.test(v)) return 'gebruikt';
  return null;
}
function deliv(v) {
  if (!v) return null;
  if (/ophalen of verzenden/i.test(v)) return 'beide';
  if (/ophalen/i.test(v)) return 'ophalen';
  if (/verzenden/i.test(v)) return 'verzenden';
  return null;
}

async function search(s) {
  var url = 'https://www.marktplaats.nl/lrp/api/search?query=' + encodeURIComponent(s.query) +
    '&limit=30&offset=0&sortBy=SORT_INDEX&sortOrder=DECREASING&viewOptions=list-view' +
    (s.postcode && s.distance_km ? '&postcode=' + encodeURIComponent(s.postcode) + '&distanceMeters=' + (s.distance_km * 1000) : '');
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
        distanceKm: s.postcode && l.location && l.location.distanceMeters != null ? Math.round(l.location.distanceMeters / 1000) : null,
        condition: cond(attr(l, 'condition')),
        delivery: deliv(attr(l, 'delivery')),
        fixed: !!(l.priceInfo && l.priceInfo.priceType === 'FIXED' && cents),
        createdAt: parseDate(l.date),
        platform: 'marktplaats'
      };
    });
}

module.exports = { search: search };
