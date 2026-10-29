// Stuurt backend-routes (login, API, Stripe, Telegram) door naar Railway.
// Alleen de paden uit _routes.json komen hier langs; de rest is statisch.
var DEFAULT_BACKEND = 'https://flipscan-alerts-production.up.railway.app';

export async function onRequest(context) {
  var backend = (context.env && context.env.BACKEND_URL) || DEFAULT_BACKEND;
  var url = new URL(context.request.url);
  var target = backend + url.pathname + url.search;

  var headers = new Headers(context.request.headers);
  headers.delete('host');
  headers.set('x-forwarded-host', url.host);
  headers.set('x-forwarded-proto', 'https');

  var init = { method: context.request.method, headers: headers, redirect: 'manual' };
  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') init.body = context.request.body;

  var res = await fetch(target, init);
  var out = new Response(res.body, res);
  // Redirects van de backend naar het eigen domein houden
  var loc = out.headers.get('location');
  if (loc && loc.indexOf(backend) === 0) out.headers.set('location', loc.slice(backend.length) || '/');
  return out;
}
