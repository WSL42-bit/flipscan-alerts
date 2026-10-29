const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const url = process.env.TEST_DATABASE_URL;
test('PostgreSQL search and notification integration', { skip: !url }, async t => {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(url).hostname), 'Tests must never use production');
  const admin = new Pool({ connectionString: url });
  const schema = 'flipscan_test_' + process.pid;
  await admin.query('CREATE SCHEMA ' + schema);
  const scoped = new URL(url);
  scoped.searchParams.set('options', '-c search_path=' + schema);
  process.env.DATABASE_URL = scoped.toString();
  const db = require('../db');
  const { mutate } = require('../searches');
  const { createWorker, matches } = require('../worker');
  try {
    await db.init();
    await db.pool.query("INSERT INTO alert_users(chat_id,tier) VALUES (101,'pro'),(202,'pro')");
    const created = await mutate(db.pool, '101', null, { query: 'Nintendo Switch', platforms: ['vinted'] }, 'create');
    const id = created.data.id;
    let items = [], response = { ok: true }, sent = [];
    const telegram = { async sendListing(chat, item) { if (response.ok) sent.push(item.id); return response; } };
    const sources = { vinted: { search: async () => items } };
    const worker = createWorker(db.pool, telegram, sources);
    const listing = n => ({ id: String(n), platform: 'vinted', title: 'Nintendo Switch console', price: 99, url: 'https://example.com/' + n });

    await t.test('empty baseline followed by new listing sends first alert', async () => {
      await worker.checkSearch({ id });
      assert.equal(sent.length, 0);
      items = [listing(1)];
      await worker.checkSearch({ id });
      assert.deepEqual(sent, ['1']);
      await worker.checkSearch({ id });
      assert.deepEqual(sent, ['1']);
    });
    await t.test('more than eight new listings remain queued for next delivery', async () => {
      items = Array.from({ length: 12 }, (_, i) => listing(i + 2));
      await worker.checkSearch({ id });
      assert.equal(sent.length, 9);
      assert.equal((await db.pool.query('SELECT COUNT(*)::int n FROM alert_seen WHERE pending')).rows[0].n, 4);
      await worker.deliver(id);
      assert.equal(sent.length, 13);
      assert.equal(new Set(sent).size, 13);
    });
    await t.test('429 preserves listing and server retry delay across worker restart', async () => {
      response = { ok: false, error_code: 429, parameters: { retry_after: 90 } };
      items = [listing(14)];
      await worker.checkSearch({ id });
      const row = (await db.pool.query("SELECT *, EXTRACT(EPOCH FROM retry_at-NOW()) AS wait FROM alert_seen WHERE item_id='14'")).rows[0];
      assert.equal(row.pending, true);
      assert.equal(row.attempts, 1);
      assert.ok(Number(row.wait) > 85);
      response = { ok: true };
      const restarted = createWorker(db.pool, telegram, sources);
      await restarted.deliver(id);
      assert.equal(sent.length, 13);
      await db.pool.query("UPDATE alert_seen SET retry_at=NOW() WHERE item_id='14'");
      await restarted.deliver(id);
      assert.equal(sent.length, 14);
    });
    await t.test('foreign edit does not touch history; owner edit resets both baseline and queue', async () => {
      const body = { query: 'Gameboy', platforms: ['vinted'] };
      assert.equal((await mutate(db.pool, '202', id, body, 'update')).status, 404);
      assert.equal((await db.pool.query('SELECT COUNT(*)::int n FROM alert_seen')).rows[0].n, 14);
      assert.equal((await mutate(db.pool, '101', id, body, 'update')).status, 200);
      assert.equal((await db.pool.query('SELECT COUNT(*)::int n FROM alert_seen')).rows[0].n, 0);
      assert.equal((await db.pool.query('SELECT COUNT(*)::int n FROM alert_platform_state')).rows[0].n, 0);
    });
    await t.test('concurrent creates never exceed 25 active searches', async () => {
      const results = await Promise.all(Array.from({ length: 30 }, () => mutate(db.pool, '202', null, { query: 'Gameboy', platforms: ['vinted'] }, 'create')));
      assert.equal(results.filter(r => r.status === 200).length, 25);
      assert.equal(results.filter(r => r.status === 403).length, 5);
    });
    await t.test('unknown prices excluded when filters set, zero maximum honored', () => {
      assert.equal(matches({ title: 'Gameboy', price: null }, { query: 'Gameboy', max_price: 100 }), false);
      assert.equal(matches({ title: 'Gameboy', price: 1 }, { query: 'Gameboy', max_price: 0 }), false);
    });
  } finally {
    await db.pool.end();
    await admin.query('DROP SCHEMA ' + schema + ' CASCADE');
    await admin.end();
  }
});
