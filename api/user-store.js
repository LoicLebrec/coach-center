const express = require('express');
const { authMiddleware } = require('./auth');
const { all, run } = require('./db');
const { encrypt, decrypt } = require('./crypto');

// Server-side backup of everything the app keeps in the browser (IndexedDB +
// localStorage, see src/services/cloudSync.js). One row per client key; `t` is
// the client write timestamp so the newest write wins across devices.
// Values are encrypted at rest because the credentials store holds API keys.

const router = express.Router();

const MAX_KEY_LEN = 300;

/** GET /api/user-store → { entries: { key: { v, t } } } */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const rows = await all('SELECT key, data, t FROM user_store WHERE user_id = ?', [req.userId]);
    const entries = {};
    for (const row of rows) {
      try {
        entries[row.key] = { v: row.data == null ? null : JSON.parse(decrypt(row.data)), t: Number(row.t) };
      } catch {
        // Undecryptable (key rotated) — skip rather than fail the whole restore.
      }
    }
    res.json({ entries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PUT /api/user-store  body: { entries: { key: { v, t } } } — v = null deletes. */
router.put('/', authMiddleware, async (req, res) => {
  try {
    const entries = req.body?.entries;
    if (!entries || typeof entries !== 'object') return res.status(400).json({ error: 'entries requis' });

    let saved = 0;
    for (const [key, entry] of Object.entries(entries)) {
      const t = Number(entry?.t);
      if (!key || key.length > MAX_KEY_LEN || !Number.isFinite(t)) continue;
      const data = entry.v == null ? null : encrypt(JSON.stringify(entry.v));
      await run(
        `INSERT INTO user_store (user_id, key, data, t, updated_at) VALUES (?, ?, ?, ?, NOW())
         ON CONFLICT (user_id, key) DO UPDATE SET data = EXCLUDED.data, t = EXCLUDED.t, updated_at = NOW()
         WHERE user_store.t <= EXCLUDED.t`,
        [req.userId, key, data, t]
      );
      saved++;
    }
    res.json({ success: true, saved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
