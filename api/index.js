const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const {
  generateToken,
  authMiddleware,
  registerUser,
  loginUser,
  getUserById,
  findOrCreateGoogleUser,
} = require('./auth');

const {
  handleIntervalsCallback,
  handleStravaCallback,
  handleGarminCallback,
  handleWahooCallback,
  getOAuthToken,
} = require('./oauth-handlers');

const { createOAuthSession } = require('./oauth-sessions');

const app = express();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

app.use(cors({
  origin: [FRONTEND_URL, 'http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
}));
app.use(express.json());

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

// ── Email / Password auth ─────────────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
    const userId = await registerUser(email, password, name);
    const token = generateToken(userId);
    res.json({ userId, token });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
    const user = await loginUser(email, password);
    const token = generateToken(user.id);
    res.json({ userId: user.id, token, name: user.name, avatarUrl: user.avatar_url });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await getUserById(req.userId);
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Google OAuth ──────────────────────────────────────────────────────────────

// The Google redirect URI must match exactly what's registered in Google Console
const googleCallbackUrl = () => {
  const backendBaseUrl = process.env.BACKEND_URL || `http://localhost:${PORT}`;
  return process.env.GOOGLE_CALLBACK_URL || `${backendBaseUrl}/api/auth/google/callback`;
};

app.get('/api/auth/google/start', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: 'Google OAuth non configuré (GOOGLE_CLIENT_ID manquant)' });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleCallbackUrl(),
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get('/api/auth/google/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect(`${FRONTEND_URL}?auth_error=${encodeURIComponent(error || 'No code returned')}`);
  }

  try {
    // Exchange code → tokens
    const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: googleCallbackUrl(),
      grant_type: 'authorization_code',
    });

    // Get profile
    const profileRes = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
    });
    const profile = profileRes.data;

    // Find or create user
    const user = await findOrCreateGoogleUser({
      googleId: profile.id,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.picture,
    });

    const token = generateToken(user.id);

    // Redirect back to frontend with JWT in query params (picked up by App.js)
    res.redirect(`${FRONTEND_URL}?token=${token}&userId=${user.id}&name=${encodeURIComponent(user.name || '')}`);
  } catch (err) {
    console.error('[google-oauth]', err.message);
    res.redirect(`${FRONTEND_URL}?auth_error=${encodeURIComponent('Connexion Google échouée')}`);
  }
});

// ── Sport provider OAuth initiation (protected endpoints) ──────────────────────

/**
 * POST /api/providers/:provider/start
 * 
 * Initiate OAuth flow for a provider.
 * Requires: authenticated user
 * Returns: { authUrl: string } to redirect user to
 */

app.post('/api/providers/:provider/start', authMiddleware, async (req, res) => {
  try {
    const { provider } = req.params;
    const validProviders = ['intervals', 'strava', 'garmin', 'wahoo'];

    if (!validProviders.includes(provider)) {
      return res.status(400).json({ error: `Invalid provider: ${provider}` });
    }

    // Create secure session token
    const state = await createOAuthSession(req.userId, provider);

    let authUrl;
    const backendBaseUrl = process.env.BACKEND_URL || `http://localhost:${PORT}`;

    switch (provider) {
      case 'intervals':
        authUrl = `https://intervals.icu/api/v1/oauth/authorize?client_id=${process.env.INTERVALS_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.INTERVALS_CALLBACK_URL || `${backendBaseUrl}/api/auth/intervals/callback`)}&response_type=code&scope=athlete&state=${state}`;
        break;

      case 'strava':
        authUrl = `https://www.strava.com/oauth/authorize?client_id=${process.env.STRAVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.STRAVA_CALLBACK_URL || `${backendBaseUrl}/api/auth/strava/callback`)}&response_type=code&scope=read,activity:read_all&state=${state}`;
        break;

      case 'garmin':
        authUrl = `https://connectapi.garmin.com/oauth-service/oauth/authorize?client_id=${process.env.GARMIN_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.GARMIN_CALLBACK_URL || `${backendBaseUrl}/api/auth/garmin/callback`)}&response_type=code&scope=activity:read_write&state=${state}`;
        break;

      case 'wahoo':
        authUrl = `https://api.wahooligan.com/oauth/authorize?client_id=${process.env.WAHOO_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.WAHOO_CALLBACK_URL || `${backendBaseUrl}/api/auth/wahoo/callback`)}&response_type=code&state=${state}`;
        break;
    }

    res.json({ authUrl });
  } catch (err) {
    console.error(`[providers.start] ${req.params.provider}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Sport provider OAuth callbacks ────────────────────────────────────────────

app.get('/api/auth/intervals/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code) return res.status(400).json({ error: 'No code provided' });
    await handleIntervalsCallback(code, state);
    res.redirect(`${FRONTEND_URL}?provider=intervals&success=true`);
  } catch (err) {
    res.redirect(`${FRONTEND_URL}?provider=intervals&error=${encodeURIComponent(err.message)}`);
  }
});

app.get('/api/auth/strava/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code) return res.status(400).json({ error: 'No code provided' });
    await handleStravaCallback(code, state);
    res.redirect(`${FRONTEND_URL}?provider=strava&success=true`);
  } catch (err) {
    res.redirect(`${FRONTEND_URL}?provider=strava&error=${encodeURIComponent(err.message)}`);
  }
});

app.get('/api/auth/garmin/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code) return res.status(400).json({ error: 'No code provided' });
    await handleGarminCallback(code, state);
    res.redirect(`${FRONTEND_URL}?provider=garmin&success=true`);
  } catch (err) {
    res.redirect(`${FRONTEND_URL}?provider=garmin&error=${encodeURIComponent(err.message)}`);
  }
});

app.get('/api/auth/wahoo/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code) return res.status(400).json({ error: 'No code provided' });
    await handleWahooCallback(code, state);
    res.redirect(`${FRONTEND_URL}?provider=wahoo&success=true`);
  } catch (err) {
    res.redirect(`${FRONTEND_URL}?provider=wahoo&error=${encodeURIComponent(err.message)}`);
  }
});

// ── Connections management ────────────────────────────────────────────────────

/**
 * GET /api/connections
 * List all connected providers for the authenticated user
 */
app.get('/api/connections', authMiddleware, async (req, res) => {
  try {
    const providers = ['intervals', 'strava', 'garmin', 'wahoo'];
    const results = await Promise.all(providers.map(p => getOAuthToken(req.userId, p)));
    const connections = Object.fromEntries(providers.map((p, i) => [p, !!results[i]]));
    res.json(connections);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/connections/:provider
 * Get details about a specific provider connection
 */
app.get('/api/connections/:provider', authMiddleware, async (req, res) => {
  try {
    const { provider } = req.params;
    const token = await getOAuthToken(req.userId, provider);

    if (!token) {
      return res.status(404).json({ error: `${provider} not connected` });
    }

    // Return non-sensitive info
    res.json({
      provider,
      connected: true,
      athleteId: token.athlete_id,
      expiresAt: token.expires_at,
      connectedSince: token.created_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/connections/:provider
 * Disconnect a provider
 */
app.delete('/api/connections/:provider', authMiddleware, async (req, res) => {
  try {
    const { provider } = req.params;
    const { run } = require('./db');

    await run(
      'UPDATE app_connections SET is_active = false WHERE user_id = ? AND provider = ?',
      [req.userId, provider]
    );

    res.json({ success: true, message: `${provider} disconnected` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Connections status (deprecated, use GET /api/connections above) ──────────────


// ── Start (local dev) ─────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n  Coach Center API  →  http://localhost:${PORT}`);
    console.log(`  Frontend URL      →  ${FRONTEND_URL}`);
    console.log(`  Google callback   →  ${googleCallbackUrl()}\n`);
  });
}

module.exports = app;
