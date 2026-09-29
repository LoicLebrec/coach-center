const express = require('express');
const { randomBytes } = require('crypto');
const { authMiddleware } = require('./auth');
const { get, run } = require('./db');
const { encrypt } = require('./crypto');
const { refreshUser, refreshAllUsers } = require('./widget-refresh');

const router = express.Router();

// Snapshots are small JSON blobs computed by the app (see src/services/widgetSnapshot.js).
const MAX_BYTES = 32 * 1024;

const newToken = () => randomBytes(24).toString('base64url');

async function ensureToken(userId) {
  const row = await get('SELECT token FROM widget_snapshots WHERE user_id = ?', [userId]);
  if (row) return row.token;
  const token = newToken();
  await run('INSERT INTO widget_snapshots (user_id, token) VALUES (?, ?) ON CONFLICT (user_id) DO NOTHING', [userId, token]);
  return (await get('SELECT token FROM widget_snapshots WHERE user_id = ?', [userId]))?.token || token;
}

/**
 * POST /api/widget/snapshot  body: { data, context }
 * context = what the morning cron needs to recompute the day (season config,
 * planned sessions, declared weaknesses, today's check-in, timezone).
 */
router.post('/snapshot', authMiddleware, async (req, res) => {
  try {
    const json = JSON.stringify(req.body?.data ?? null);
    const context = req.body?.context ? JSON.stringify(req.body.context) : null;
    if (json.length > MAX_BYTES || (context && context.length > 4 * MAX_BYTES)) {
      return res.status(413).json({ error: 'Snapshot trop volumineux' });
    }
    const token = await ensureToken(req.userId);
    await run(
      'UPDATE widget_snapshots SET data = ?, context = COALESCE(?, context), source = ?, updated_at = NOW() WHERE user_id = ?',
      [json, context, 'app', req.userId]
    );
    res.json({ success: true, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/widget/token */
router.get('/token', authMiddleware, async (req, res) => {
  try {
    const token = await ensureToken(req.userId);
    const row = await get('SELECT updated_at, data IS NOT NULL AS has_data FROM widget_snapshots WHERE user_id = ?', [req.userId]);
    res.json({ token, updatedAt: row?.updated_at || null, hasData: !!row?.has_data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/widget/token/rotate — invalidates the previous widget URL. */
router.post('/token/rotate', authMiddleware, async (req, res) => {
  try {
    await ensureToken(req.userId);
    const token = newToken();
    await run('UPDATE widget_snapshots SET token = ? WHERE user_id = ?', [token, req.userId]);
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/widget/intervals — is the morning server refresh on? */
router.get('/intervals', authMiddleware, async (req, res) => {
  try {
    const row = await get('SELECT athlete_id, last_run_at, last_status, last_error FROM widget_intervals WHERE user_id = ?', [req.userId]);
    res.json(row
      ? { enabled: true, athleteId: row.athlete_id, lastRunAt: row.last_run_at, lastStatus: row.last_status, lastError: row.last_error }
      : { enabled: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/widget/intervals  body: { athleteId, apiKey } — opt in; runs a first refresh right away. */
router.post('/intervals', authMiddleware, async (req, res) => {
  try {
    const { athleteId, apiKey } = req.body || {};
    if (!athleteId || !apiKey) return res.status(400).json({ error: 'Athlete ID et clé API requis' });
    const id = /^\d+$/.test(String(athleteId).trim()) ? `i${String(athleteId).trim()}` : String(athleteId).trim();
    await ensureToken(req.userId);
    await run(
      `INSERT INTO widget_intervals (user_id, athlete_id, enc_api_key) VALUES (?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET athlete_id = EXCLUDED.athlete_id, enc_api_key = EXCLUDED.enc_api_key`,
      [req.userId, id, encrypt(String(apiKey))]
    );
    const result = await refreshUser(req.userId, { force: true });
    if (result.status === 'error') return res.status(400).json({ error: result.error });
    res.json({ enabled: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /api/widget/intervals — opt out and forget the key. */
router.delete('/intervals', authMiddleware, async (req, res) => {
  try {
    await run('DELETE FROM widget_intervals WHERE user_id = ?', [req.userId]);
    res.json({ enabled: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/widget/cron — Vercel cron, every morning. */
router.get('/cron', async (req, res) => {
  const expected = process.env.CRON_SECRET;
  if (expected && req.headers.authorization !== `Bearer ${expected}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const results = await refreshAllUsers();
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/widget/feed/:token — public, read-only. The token is the only secret,
 * so it is long, random and rotatable. Returns the last snapshot the app pushed.
 */
router.get('/feed/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '');
    if (token.length < 20) return res.status(404).json({ error: 'Not found' });
    const row = await get('SELECT data, updated_at FROM widget_snapshots WHERE token = ?', [token]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.set('Cache-Control', 'no-store');
    res.json({ updatedAt: row.updated_at, snapshot: row.data ? JSON.parse(row.data) : null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
