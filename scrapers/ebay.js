// eBay Browse API (officieel). Vereist EBAY_CLIENT_ID en EBAY_CLIENT_SECRET (developer.ebay.com).
var token = null;
var tokenExp = 0;

async function getToken() {
  if (token && Date.now() < tokenExp) return token;
  var auth = Buffer.from(process.env.EBAY_CLIENT_ID + ':' + process.env.EBAY_CLIENT_SECRET).toString('base64');
  var res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope')
  });
  if (!res.ok) throw new Error('eBay token HTTP ' + res.status);
  var data = await res.json();
  token = data.access_token;
  tokenExp = Date.now() + (data.expires_in - 120) * 1000;
  return token;
}

async function search(s) {
  if (!process.env.EBAY_CLIENT_ID || !process.env.EBAY_CLIENT_SECRET) throw new Error('eBay is not configured');
  var t = await getToken();
  // Alleen Europees aanbod en geen 'for parts or not working' (conditie 7000)
  var filter = 'buyingOptions:{FIXED_PRICE|AUCTION|BEST_OFFER},itemLocationRegion:EUROPEAN_UNION,conditionIds:{1000|1500|1750|2000|2010|2020|2030|2500|2750|3000|4000|5000|6000}';
  if (s.min_price || s.max_price) {
    filter += ',price:[' + (s.min_price || 0) + '..' + (s.max_price || '') + '],priceCurrency:EUR';
  }
  var url = 'https://api.ebay.com/buy/browse/v1/item_summary/search?q=' + encodeURIComponent(s.query) +
    '&sort=newlyListed&limit=30&filter=' + encodeURIComponent(filter);
  var res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { 'Authorization': 'Bearer ' + t, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_NL', 'Accept-Language': 'nl-NL' }
  });
  if (!res.ok) throw new Error('eBay HTTP ' + res.status);
  var data = await res.json();
  var EU = ['NL','BE','DE','FR','LU','AT','IT','ES','PT','IE','DK','SE','FI','PL','CZ','SK','SI','HR','HU','RO','BG','GR','EE','LV','LT','CY','MT'];
  return (data.itemSummaries || []).filter(function (i) { return i.itemLocation && EU.indexOf(i.itemLocation.country) !== -1; }).map(function (i) {
    return {
      id: String(i.itemId),
      title: i.title,
      price: i.price ? parseFloat(i.price.value) : null,
      url: i.itemWebUrl,
      image: i.image ? i.image.imageUrl : null,
      location: i.itemLocation && i.itemLocation.country ? i.itemLocation.country : null,
      createdAt: i.itemCreationDate ? Date.parse(i.itemCreationDate) : null,
      platform: 'ebay'
    };
  });
}

module.exports = { search: search };
