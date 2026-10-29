const test = require('node:test');
const assert = require('node:assert/strict');
process.env.SESSION_SECRET = 'local-test-secret-never-used-in-production';
const auth = require('../auth');
const { cleanSearch, mutate } = require('../searches');
const origin = require('../origin');

test('sessions require signed identity, purpose and finite future expiration', () => {
  const valid = { c: '12345', exp: Date.now() + 60000, k: 'sess' };
  assert.deepEqual(auth.verify(auth.sign(valid)), valid);
  for (const payload of [{ ...valid, exp: undefined }, { ...valid, exp: '9999999999999' }, { ...valid, exp: Date.now() - 1 }, { ...valid, c: {} }, { ...valid, c: '-123' }, { ...valid, k: 'admin' }]) {
    assert.equal(auth.verify(auth.sign(payload)), null);
  }
  assert.equal(auth.verify(auth.sessionToken('12345') + 'x'), null);
});

test('malformed cookies return 401 instead of throwing', () => {
  let code;
  auth.requireUser({ headers: { cookie: 'fsa=%E0%A4%A' } }, { status(n) { code = n; return this; }, json() {} }, () => assert.fail('must not authenticate'));
  assert.equal(code, 401);
});

test('origin normalized and restricted to safe origins', () => {
  assert.equal(origin({}), 'https://flipscanalerts.nl');
  assert.equal(origin({ SITE_URL: 'https://flipscanalerts.nl/' }), 'https://flipscanalerts.nl');
  assert.equal(origin({ SITE_URL: 'http://localhost:3000' }), 'http://localhost:3000');
  for (const url of ['javascript:alert(1)', 'https://user:pass@example.com', 'https://example.com/path', 'http://example.com', 'https://example.com?x=1']) {
    assert.throws(() => origin({ SITE_URL: url }));
  }
});

test('price filters reject coercion, inversion and integer overflow; preserve zero', () => {
  const base = { query: 'Nintendo Switch', platforms: ['vinted', 'vinted'] };
  assert.deepEqual(cleanSearch({ ...base, min_price: 0, max_price: '100' }, 'pro'), { query: base.query, platforms: ['vinted'], min: 0, max: 100 });
  for (const value of ['10abc', -1, true, [], 1.5, ' ', 2147483648]) assert.ok(cleanSearch({ ...base, min_price: value }, 'pro').error);
  assert.ok(cleanSearch({ ...base, min_price: 100, max_price: 0 }, 'pro').error);
});

function fakePool(existing, count = 0) {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT tier')) return { rows: [{ tier: 'pro' }] };
      if (sql.startsWith('SELECT *')) return { rows: existing ? [existing] : [] };
      if (sql.startsWith('SELECT COUNT')) return { rows: [{ n: count }] };
      return { rows: [], rowCount: 1 };
    },
    release() { calls.push({ sql: 'release' }); }
  };
  return { calls, connect: async () => client };
}

test('foreign/missing search cannot be edited, paused, resumed or deleted, nor lose history', async () => {
  for (const [method, body] of [['update', { query: 'Nintendo', platforms: ['vinted'] }], ['update', { active: true }], ['update', { active: false }], ['delete', {}]]) {
    const pool = fakePool(null);
    assert.equal((await mutate(pool, '123', '9', body, method)).status, 404);
    assert.ok(!pool.calls.some(c => /^(UPDATE|DELETE|INSERT)/.test(c.sql)));
    assert.ok(pool.calls.some(c => c.sql === 'ROLLBACK'));
    assert.equal(pool.calls.at(-1).sql, 'release');
  }
});

test('owner update resets history only within locked transaction', async () => {
  const pool = fakePool({ active: true });
  assert.equal((await mutate(pool, '123', '9', { query: 'Nintendo', platforms: ['vinted'] }, 'update')).status, 200);
  assert.ok(pool.calls.some(c => c.sql.endsWith('FOR UPDATE')));
  assert.ok(pool.calls.some(c => c.sql.startsWith('DELETE FROM alert_seen')));
  assert.ok(pool.calls.some(c => c.sql === 'COMMIT'));
});

test('active limit enforced but idempotent activation allowed', async () => {
  assert.equal((await mutate(fakePool({ active: false }, 25), '123', '9', { active: true }, 'update')).status, 403);
  assert.equal((await mutate(fakePool({ active: true }, 25), '123', '9', { active: true }, 'update')).status, 200);
});

test('importing app does not start database, webhooks or jobs', () => {
  const db = require('../db');
  const old = db.init;
  db.init = () => assert.fail('database startup during import');
  try { assert.equal(typeof require('../index').app, 'function'); } finally { db.init = old; }
});
