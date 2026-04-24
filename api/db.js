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

    console.log('[db] Tables ready');
  } catch (err) {
    console.error('[db] Init error:', err.message);
  }
};

initDb();

module.exports = { pool, run, get, all };
