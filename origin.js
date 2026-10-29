// One public origin for browser redirects, bot links and search metadata.
function publicOrigin(env) {
  env = env || process.env;
  var value = env.SITE_URL || env.BASE_URL || 'https://flipscanalerts.nl';
  var url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid public origin');
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error('Public origin requires HTTPS');
  }
  return url.origin;
}
module.exports = publicOrigin;
