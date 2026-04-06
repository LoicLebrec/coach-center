const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { run, get } = require('./db');

// ─── Intervals.icu OAuth ──────────────────────────────────────────────────

const handleIntervalsCallback = async (code, userId) => {
  try {
    // Exchange code for token
    const response = await axios.post(
      'https://intervals.icu/api/v1/oauth/token',
      {
        grant_type: 'authorization_code',
        code,
        client_id: process.env.INTERVALS_CLIENT_ID,
        client_secret: process.env.INTERVALS_CLIENT_SECRET,
        redirect_uri: process.env.INTERVALS_CALLBACK_URL,
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // Get athlete ID from token
    const athleteRes = await axios.get(
      'https://intervals.icu/api/v1/athlete',
      {
        headers: { 'Authorization': `Bearer ${access_token}` }
      }
    );
    const athleteId = athleteRes.data.id;

    // Store token
    const tokenId = uuidv4();
    await run(
      `INSERT OR REPLACE INTO oauth_tokens 
       (id, user_id, provider, access_token, refresh_token, expires_at, athlete_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tokenId, userId, 'intervals', access_token, refresh_token, expiresAt.toISOString(), athleteId]
    );

    return { success: true, athleteId };
  } catch (err) {
    console.error('Intervals.icu callback error:', err.message);
    throw err;
  }
};

// ─── Strava OAuth ─────────────────────────────────────────────────────────

const handleStravaCallback = async (code, userId) => {
  try {
    const response = await axios.post(
      'https://www.strava.com/oauth/token',
      {
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      }
    );

    const { access_token, refresh_token, expires_at, athlete } = response.data;

    // Store token
    const tokenId = uuidv4();
    await run(
      `INSERT OR REPLACE INTO oauth_tokens 
       (id, user_id, provider, access_token, refresh_token, expires_at, athlete_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tokenId, userId, 'strava', access_token, refresh_token, new Date(expires_at * 1000).toISOString(), athlete.id]
    );

    return { success: true, athleteId: athlete.id };
  } catch (err) {
    console.error('Strava callback error:', err.message);
    throw err;
  }
};

// ─── Garmin OAuth ─────────────────────────────────────────────────────────

const handleGarminCallback = async (code, userId) => {
  try {
    const response = await axios.post(
      'https://connectapi.garmin.com/oauth-service/oauth/token',
      {
        grant_type: 'authorization_code',
        code,
        client_id: process.env.GARMIN_CLIENT_ID,
        client_secret: process.env.GARMIN_CLIENT_SECRET,
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // Store token (Garmin athlete ID would come from user profile)
    const tokenId = uuidv4();
    await run(
      `INSERT OR REPLACE INTO oauth_tokens 
       (id, user_id, provider, access_token, refresh_token, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [tokenId, userId, 'garmin', access_token, refresh_token, expiresAt.toISOString()]
    );

    return { success: true };
  } catch (err) {
    console.error('Garmin callback error:', err.message);
    throw err;
  }
};

// ─── Wahoo OAuth ──────────────────────────────────────────────────────────

const handleWahooCallback = async (code, userId) => {
  try {
    const response = await axios.post(
      'https://api.wahooligan.com/oauth/token',
      {
        grant_type: 'authorization_code',
        code,
        client_id: process.env.WAHOO_CLIENT_ID,
        client_secret: process.env.WAHOO_CLIENT_SECRET,
        redirect_uri: process.env.WAHOO_CALLBACK_URL,
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // Store token
    const tokenId = uuidv4();
    await run(
      `INSERT OR REPLACE INTO oauth_tokens 
       (id, user_id, provider, access_token, refresh_token, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [tokenId, userId, 'wahoo', access_token, refresh_token, expiresAt.toISOString()]
    );

    return { success: true };
  } catch (err) {
    console.error('Wahoo callback error:', err.message);
    throw err;
  }
};

// Get OAuth token for user + provider
const getOAuthToken = async (userId, provider) => {
  return get(
    `SELECT * FROM oauth_tokens WHERE user_id = ? AND provider = ?`,
    [userId, provider]
  );
};

// Refresh token if expired
const refreshTokenIfNeeded = async (userId, provider) => {
  const token = await getOAuthToken(userId, provider);
  if (!token) return null;

  const now = new Date();
  const expiresAt = new Date(token.expires_at);

  // If expires in > 5 minutes, return as is
  if (expiresAt > new Date(now.getTime() + 5 * 60000)) {
    return token.access_token;
  }

  // Refresh logic depends on provider
  // This is simplified; expand as needed
  console.log(`Token for ${provider} needs refresh`);
  return token.access_token;
};

module.exports = {
  handleIntervalsCallback,
  handleStravaCallback,
  handleGarminCallback,
  handleWahooCallback,
  getOAuthToken,
  refreshTokenIfNeeded,
};
