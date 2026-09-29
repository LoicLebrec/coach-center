const { Pool } = require('pg');

// DATABASE_URL must be set (Neon, Supabase, or any Postgres connection string)
// Format: postgresql://user:pass@host/dbname?sslmode=require
if (!process.env.DATABASE_URL) {
  console.warn('[db] DATABASE_URL not set — database features disabled');
}

const pool = process.env.DATABASE_URL
  ? new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // required for Neon / hosted Postgres
    max: 5,
    idleTimeoutMillis: 30000,
  })
  : null;

// Convert SQLite-style ? placeholders to Postgres $1, $2, ...
function pgSql(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

const run = async (sql, params = []) => {
  if (!pool) return { changes: 0 };
  const result = await pool.query(pgSql(sql), params);
  return { changes: result.rowCount };
};

const get = async (sql, params = []) => {
  if (!pool) return null;
  const result = await pool.query(pgSql(sql), params);
  return result.rows[0] || null;
};

const all = async (sql, params = []) => {
  if (!pool) return [];
  const result = await pool.query(pgSql(sql), params);
  return result.rows;
};

// ── Schema init ───────────────────────────────────────────────────────────────

const initDb = async () => {
  if (!pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id          TEXT PRIMARY KEY,
        email       TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        name        TEXT,
        google_id   TEXT UNIQUE,
        avatar_url  TEXT,
        club_id     TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS oauth_tokens (
        id            TEXT PRIMARY KEY,
        user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider      TEXT NOT NULL,
        access_token  TEXT NOT NULL,
        refresh_token TEXT,
        expires_at    TIMESTAMPTZ,
        athlete_id    TEXT,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, provider)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS athlete_data (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider   TEXT NOT NULL,
        data       TEXT NOT NULL,
        cached_at  TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, provider)
      )
    `);

    // Temporary OAuth sessions for security (CSRF protection)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS oauth_sessions (
        state       TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider    TEXT NOT NULL,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        expires_at  TIMESTAMPTZ DEFAULT NOW() + INTERVAL '15 minutes'
      )
    `);

    // Connection metadata (cache for UI display)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_connections (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider    TEXT NOT NULL,
        athlete_id  TEXT,
        display_name TEXT,
        is_active   BOOLEAN DEFAULT true,
        connected_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, provider)
      )
    `);

    // Cross-sync: unofficial Garmin/Coros credentials (email + encrypted password)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS device_credentials (
        id               TEXT PRIMARY KEY,
        user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider         TEXT NOT NULL,
        email            TEXT NOT NULL,
        enc_password     TEXT NOT NULL,
        last_sync_at     TIMESTAMPTZ,
        last_sync_status TEXT,
        last_sync_error  TEXT,
        created_at       TIMESTAMPTZ DEFAULT NOW(),
        updated_at       TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, provider)
      )
    `);

    // Cross-sync: dedupe log so a pushed activity doesn't get re-imported back on the next poll
    await pool.query(`
      CREATE TABLE IF NOT EXISTS synced_activities (
        id                  TEXT PRIMARY KEY,
        user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        source_provider     TEXT NOT NULL,
        source_activity_id  TEXT NOT NULL,
        target_provider     TEXT NOT NULL,
        target_activity_id  TEXT,
        status              TEXT NOT NULL,
        error               TEXT,
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, source_provider, source_activity_id, target_provider)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS widget_snapshots (
        user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        token       TEXT UNIQUE NOT NULL,
        data        TEXT,
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`ALTER TABLE widget_snapshots ADD COLUMN IF NOT EXISTS context TEXT`);
    await pool.query(`ALTER TABLE widget_snapshots ADD COLUMN IF NOT EXISTS source TEXT`);

    // Opt-in: Intervals.icu API key kept server-side (encrypted) so the morning
    // cron can refresh the widget without the app being opened.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS widget_intervals (
        user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        athlete_id   TEXT NOT NULL,
        enc_api_key  TEXT NOT NULL,
        last_run_at  TIMESTAMPTZ,
        last_status  TEXT,
        last_error   TEXT
      )
    `);

    // Backup of the browser-side stores (see api/user-store.js)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_store (
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        key         TEXT NOT NULL,
        data        TEXT,
        t           BIGINT NOT NULL,
        updated_at  TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (user_id, key)
      )
    `);

    console.log('[db] Tables ready');
  } catch (err) {
    console.error('[db] Init error:', err.message);
  }
};

initDb();

module.exports = { pool, run, get, all };
