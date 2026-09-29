const express = require('express');
const { authMiddleware } = require('./auth');
const garminClient = require('./cross-sync/garmin-client');
const corosClient = require('./cross-sync/coros-client');
const store = require('./cross-sync/store');
const engine = require('./cross-sync/engine');

const router = express.Router();

/**
 * POST /api/cross-sync/credentials
 * body: { provider: 'garmin' | 'coros', email, password }
 * Validates the login before storing — fails fast on a typo'd password.
 */
router.post('/credentials', authMiddleware, async (req, res) => {
  try {
    const { provider, email, password } = req.body;
    if (!store.PROVIDERS.includes(provider)) {
      return res.status(400).json({ error: `Invalid provider: ${provider}` });
    }
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    if (provider === 'garmin') {
      await garminClient.login(email, password);
    } else {
      await corosClient.login(email, password);
    }

    await store.saveCredentials(req.userId, provider, email, password);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: `Connexion ${req.body.provider} échouée : ${err.message}` });
  }
});

/**
 * DELETE /api/cross-sync/credentials/:provider
 */
router.delete('/credentials/:provider', authMiddleware, async (req, res) => {
  try {
    await store.deleteCredentials(req.userId, req.params.provider);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/cross-sync/status
 * Per-provider configured/last-sync status + recent sync log for the UI.
 */
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const providers = await store.getStatusForUser(req.userId);
    const log = await store.getRecentSyncLog(req.userId);
    res.json({ providers, log });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/cross-sync/run
 * Trigger a sync cycle now for the authenticated user.
 */
router.post('/run', authMiddleware, async (req, res) => {
  try {
    const result = await engine.syncUser(req.userId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/cross-sync/cron
 * Called by Vercel Cron (see vercel.json). Vercel sends
 * `Authorization: Bearer $CRON_SECRET` automatically when CRON_SECRET is set.
 */
router.get('/cron', async (req, res) => {
  const expected = process.env.CRON_SECRET;
  if (expected && req.headers.authorization !== `Bearer ${expected}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const results = await engine.syncAllUsers();
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
