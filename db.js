var Pool = require('pg').Pool;
var localDatabase = process.env.DATABASE_URL && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname);

var pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !localDatabase ? { rejectUnauthorized: false } : false
});

async function init() {
  await pool.query(
    'CREATE TABLE IF NOT EXISTS alert_users (' +
    ' chat_id BIGINT PRIMARY KEY,' +
    ' username TEXT,' +
    ' first_name TEXT,' +
    ' tier TEXT NOT NULL DEFAULT \'free\',' +
    ' stripe_customer_id TEXT,' +
    ' stripe_subscription_id TEXT,' +
    ' paused BOOLEAN NOT NULL DEFAULT FALSE,' +
    ' created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());' +
    'CREATE TABLE IF NOT EXISTS alert_searches (' +
    ' id SERIAL PRIMARY KEY,' +
    ' chat_id BIGINT NOT NULL REFERENCES alert_users(chat_id) ON DELETE CASCADE,' +
    ' query TEXT NOT NULL,' +
    ' platforms TEXT[] NOT NULL,' +
    ' min_price INTEGER,' +
    ' max_price INTEGER,' +
    ' active BOOLEAN NOT NULL DEFAULT TRUE,' +
    ' seeded BOOLEAN NOT NULL DEFAULT FALSE,' +
    ' last_checked_at TIMESTAMPTZ,' +
    ' created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());' +
    'CREATE TABLE IF NOT EXISTS alert_seen (' +
    ' search_id INTEGER NOT NULL REFERENCES alert_searches(id) ON DELETE CASCADE,' +
    ' platform TEXT NOT NULL,' +
    ' item_id TEXT NOT NULL,' +
    ' created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),' +
    ' PRIMARY KEY (search_id, platform, item_id));' +
    'ALTER TABLE alert_users ADD COLUMN IF NOT EXISTS plan_interval TEXT;' +
    'ALTER TABLE alert_seen ADD COLUMN IF NOT EXISTS payload JSONB;' +
    'ALTER TABLE alert_seen ADD COLUMN IF NOT EXISTS pending BOOLEAN NOT NULL DEFAULT FALSE;' +
    'ALTER TABLE alert_seen ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;' +
    'ALTER TABLE alert_seen ADD COLUMN IF NOT EXISTS retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW();' +
    'CREATE INDEX IF NOT EXISTS alert_seen_pending ON alert_seen(search_id, retry_at) WHERE pending;' +
    'CREATE TABLE IF NOT EXISTS alert_platform_state (' +
    ' search_id INTEGER NOT NULL REFERENCES alert_searches(id) ON DELETE CASCADE,' +
    ' platform TEXT NOT NULL, PRIMARY KEY(search_id, platform));' +
    'INSERT INTO alert_platform_state(search_id, platform) ' +
    'SELECT id, unnest(platforms) FROM alert_searches WHERE seeded=TRUE ON CONFLICT DO NOTHING;'
  );
}

module.exports = { pool: pool, init: init };
