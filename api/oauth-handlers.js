const axios = require('axios');
const { randomUUID } = require('crypto');
const { run, get } = require('./db');
const { validateOAuthSession } = require('./oauth-sessions');

// Upsert helper — works for all provider token saves
const upsertToken = (userId, provider, accessToken, refreshToken, expiresAt, athleteId = null) =>
  run(
    `INSERT INTO oauth_tokens (id, user_id, provider, access_token, refresh_token, expires_at, athlete_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, provider) DO UPDATE SET
       access_token  = EXCLUDED.access_token,
       refresh_token = COALESCE(EXCLUDED.refresh_token, oauth_tokens.refresh_token),
       expires_at    = EXCLUDED.expires_at,
       athlete_id    = COALESCE(EXCLUDED.athlete_id, oauth_tokens.athlete_id),
       updated_at    = NOW()`,
    [randomUUID(), userId, provider, accessToken, refreshToken, expiresAt, athleteId]
  );

// Upsert app connection metadata (for UI display and quick lookup)
const upsertConnection = (userId, provider, athleteId = null, displayName = '') =>
  run(
    `INSERT INTO app_connections (id, user_id, provider, athlete_id, display_name, is_active)
     VALUES (?, ?, ?, ?, ?, true)
     ON CONFLICT (user_id, provider) DO UPDATE SET
       athlete_id = COALESCE(?, app_connections.athlete_id),
       display_name = COALESCE(?, app_connections.display_name),
       is_active = true,
       connected_at = NOW()`,
    [randomUUID(), userId, provider, athleteId, displayName, athleteId, displayName]
  );

// ── Intervals.icu OAuth ───────────────────────────────────────────────────────

const handleIntervalsCallback = async (code, state) => {
  // Validate session and get userId
  const session = await validateOAuthSession(state, 'intervals');
  const userId = session.user_id;

  const { data } = await axios.post('https://intervals.icu/api/v1/oauth/token', {
    grant_type: 'authorization_code',
    code,
    client_id: process.env.INTERVALS_CLIENT_ID,
    client_secret: process.env.INTERVALS_CLIENT_SECRET,
    redirect_uri: process.env.INTERVALS_CALLBACK_URL,
  });

  const { access_token, refresh_token, expires_in } = data;
  const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

  const athleteRes = await axios.get('https://intervals.icu/api/v1/athlete', {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  await upsertToken(userId, 'intervals', access_token, refresh_token, expiresAt, athleteRes.data.id);
  await upsertConnection(userId, 'intervals', athleteRes.data.id, athleteRes.data?.name || 'Intervals Athlete');
  return { success: true, athleteId: athleteRes.data.id };
};

// ── Strava OAuth ──────────────────────────────────────────────────────────────

const handleStravaCallback = async (code, state) => {
  // Validate session and get userId
  const session = await validateOAuthSession(state, 'strava');
  const userId = session.user_id;

  const { data } = await axios.post('https://www.strava.com/oauth/token', {
    client_id: process.env.STRAVA_CLIENT_ID,
    client_secret: process.env.STRAVA_CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
  });

  const { access_token, refresh_token, expires_at, athlete } = data;
  await upsertToken(userId, 'strava', access_token, refresh_token,
    new Date(expires_at * 1000).toISOString(), athlete.id);
  await upsertConnection(userId, 'strava', athlete.id, `${athlete.firstname} ${athlete.lastname}`.trim());
  return { success: true, athleteId: athlete.id };
};

// ── Garmin OAuth ──────────────────────────────────────────────────────────────

const handleGarminCallback = async (code, state) => {
  // Validate session and get userId
  const session = await validateOAuthSession(state, 'garmin');
  const userId = session.user_id;

  const { data } = await axios.post('https://connectapi.garmin.com/oauth-service/oauth/token', {
    grant_type: 'authorization_code',
    code,
    client_id: process.env.GARMIN_CLIENT_ID,
    client_secret: process.env.GARMIN_CLIENT_SECRET,
  });

  const { access_token, refresh_token, expires_in } = data;
  await upsertToken(userId, 'garmin', access_token, refresh_token,
    new Date(Date.now() + expires_in * 1000).toISOString());
  await upsertConnection(userId, 'garmin', null, 'Garmin Connect');
  return { success: true };
};

// ── Wahoo OAuth ───────────────────────────────────────────────────────────────

const handleWahooCallback = async (code, state) => {
  // Validate session and get userId
  const session = await validateOAuthSession(state, 'wahoo');
  const userId = session.user_id;

  const { data } = await axios.post('https://api.wahooligan.com/oauth/token', {
    grant_type: 'authorization_code',
    code,
    client_id: process.env.WAHOO_CLIENT_ID,
    client_secret: process.env.WAHOO_CLIENT_SECRET,
    redirect_uri: process.env.WAHOO_CALLBACK_URL,
  });

  const { access_token, refresh_token, expires_in } = data;
  await upsertToken(userId, 'wahoo', access_token, refresh_token,
    new Date(Date.now() + expires_in * 1000).toISOString());
  await upsertConnection(userId, 'wahoo', null, 'Wahoo');
  return { success: true };
};

// ── Token retrieval ───────────────────────────────────────────────────────────

const getOAuthToken = (userId, provider) =>
  get('SELECT * FROM oauth_tokens WHERE user_id = ? AND provider = ?', [userId, provider]);

module.exports = {
  handleIntervalsCallback,
  handleStravaCallback,
  handleGarminCallback,
  handleWahooCallback,
  getOAuthToken,
  upsertToken,
  upsertConnection,
};
