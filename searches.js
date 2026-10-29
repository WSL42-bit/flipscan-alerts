var config = require('./config');

function cleanSearch(body, tier) {
  body = body || {};
  var query = String(body.query || '').trim().slice(0, 80);
  if (query.length < 2) return { error: 'Vul een zoekterm in' };
  var platforms = [...new Set(Array.isArray(body.platforms) ? body.platforms : [])];
  if (!platforms.length || platforms.some(p => !config.ALL_PLATFORMS.includes(p))) {
    return { error: 'Kies geldige platforms' };
  }
  if (!config.TIERS[tier] || platforms.some(p => !config.TIERS[tier].platforms.includes(p))) {
    return { error: 'Platform niet beschikbaar' };
  }
  function price(value) {
    if (value === '' || value == null) return null;
    if (!['number', 'string'].includes(typeof value) || !/^\d+$/.test(String(value))) return NaN;
    var n = Number(value);
    return Number.isSafeInteger(n) && n <= 2147483647 ? n : NaN;
  }
  var min = price(body.min_price), max = price(body.max_price);
  if (Number.isNaN(min) || Number.isNaN(max)) return { error: 'Gebruik hele, positieve bedragen of 0' };
  if (min !== null && max !== null && min > max) return { error: 'Minimumprijs mag niet hoger zijn dan maximumprijs' };
  return { query: query, platforms: platforms, min: min, max: max };
}

// Serialize mutations per owner, including the active-search limit. Ownership is
// checked before any history is changed, inside the same transaction.
async function mutate(pool, chatId, id, body, method) {
  if (id != null && !/^[1-9]\d*$/.test(String(id))) return { status: 404, error: 'Zoekopdracht niet gevonden' };
  var client = await pool.connect();
  try {
    await client.query('BEGIN');
    var user = (await client.query('SELECT tier FROM alert_users WHERE chat_id=$1 FOR UPDATE', [chatId])).rows[0];
    if (!user) return { status: 404, error: 'Gebruiker niet gevonden' };
    var existing;
    if (id != null) {
      existing = (await client.query('SELECT * FROM alert_searches WHERE id=$1 AND chat_id=$2 FOR UPDATE', [id, chatId])).rows[0];
      if (!existing) return { status: 404, error: 'Zoekopdracht niet gevonden' };
    }
    if (method === 'delete') {
      await client.query('DELETE FROM alert_searches WHERE id=$1 AND chat_id=$2', [id, chatId]);
    } else {
      if (body.active != null && typeof body.active !== 'boolean') return { status: 400, error: 'Ongeldige status' };
      var activating = method === 'create' || (body.active === true && !existing.active);
      if (activating) {
        if (user.tier !== 'pro') return { status: 403, error: 'Start eerst je abonnement.' };
        var count = (await client.query('SELECT COUNT(*)::int AS n FROM alert_searches WHERE chat_id=$1 AND active=TRUE', [chatId])).rows[0].n;
        if (count >= config.TIERS.pro.maxSearches) return { status: 403, error: 'Maximum bereikt.' };
      }
      if (method !== 'create' && typeof body.active === 'boolean') {
        await client.query('UPDATE alert_searches SET active=$1 WHERE id=$2 AND chat_id=$3', [body.active, id, chatId]);
      } else {
        var c = cleanSearch(body, user.tier);
        if (c.error) return { status: 400, error: c.error };
        if (method === 'create') {
          existing = (await client.query('INSERT INTO alert_searches (chat_id, query, platforms, min_price, max_price) VALUES ($1,$2,$3,$4,$5) RETURNING *', [chatId, c.query, c.platforms, c.min, c.max])).rows[0];
        } else {
          await client.query('UPDATE alert_searches SET query=$1, platforms=$2, min_price=$3, max_price=$4, seeded=FALSE, last_checked_at=NULL WHERE id=$5 AND chat_id=$6', [c.query, c.platforms, c.min, c.max, id, chatId]);
          await client.query('DELETE FROM alert_seen WHERE search_id=$1', [id]);
          await client.query('DELETE FROM alert_platform_state WHERE search_id=$1', [id]);
        }
      }
    }
    await client.query('COMMIT');
    return { status: 200, data: method === 'create' ? existing : { ok: true } };
  } finally {
    // ROLLBACK is harmless after COMMIT and covers every early validation return.
    try { await client.query('ROLLBACK'); } finally { client.release(); }
  }
}
module.exports = { cleanSearch: cleanSearch, mutate: mutate };
