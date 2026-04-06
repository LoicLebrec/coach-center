const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Use a file-based database for Vercel compatibility
// (In-memory won't persist across requests)
const DB_PATH = process.env.NODE_ENV === 'production'
    ? '/tmp/coach-center.db'
    : path.join(__dirname, 'coach-center.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error('DB connection error:', err);
    else console.log('Connected to SQLite:', DB_PATH);
});

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

// Initialize tables
const initDb = () => {
    db.serialize(() => {
        // Users table
        db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        name TEXT,
        club_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

        // OAuth tokens table
        db.run(`
      CREATE TABLE IF NOT EXISTS oauth_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        expires_at DATETIME,
        athlete_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, provider)
      )
    `);

        // Cached athlete data
        db.run(`
      CREATE TABLE IF NOT EXISTS athlete_data (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        data TEXT NOT NULL,
        cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, provider)
      )
    `);

        // Wellness data
        db.run(`
      CREATE TABLE IF NOT EXISTS wellness (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        date TEXT NOT NULL,
        icu_ctl REAL,
        icu_atl REAL,
        resting_hr INTEGER,
        weight REAL,
        data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

        // Activities
        db.run(`
      CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        date TEXT NOT NULL,
        title TEXT,
        type TEXT,
        duration_seconds INTEGER,
        distance REAL,
        average_watts INTEGER,
        average_hr INTEGER,
        icu_training_load REAL,
        data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

        console.log('✓ Database tables initialized');
    });
};

const run = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
};

const get = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const all = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
};

initDb();

module.exports = { db, run, get, all };
