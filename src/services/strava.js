/**
 * Strava API Service
 * 
 * Auth: OAuth 2.0 with PKCE (suitable for SPA / GitHub Pages)
 * Docs: https://developers.strava.com/docs/reference/
 * 
 * IMPORTANT: Strava requires OAuth — you cannot use API keys from a browser.
 * For a GitHub Pages SPA, the user must:
 *   1. Create a Strava API app at https://www.strava.com/settings/api
 *   2. Set the callback URL to your GitHub Pages URL
 *   3. Enter client_id and client_secret in Coach Center settings
 *   4. Complete the OAuth flow (redirect-based)
 * 
 * Access tokens expire every 6 hours and must be refreshed.
 * Rate limit: 600 requests/15min, 30,000/day.
 */

const STRAVA_API = 'https://www.strava.com/api/v3';
const STRAVA_AUTH = 'https://www.strava.com/oauth/authorize';
const STRAVA_TOKEN = 'https://www.strava.com/oauth/token';

class StravaService {
  constructor() {
    this.clientId = null;
    this.clientSecret = null;
    this.accessToken = null;
    this.refreshToken = null;
    this.expiresAt = null;
  }

  configure(clientId, clientSecret) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  isConfigured() {
    return !!(this.clientId && this.accessToken);
  }

  hasCredentials() {
    return !!(this.clientId && this.clientSecret);
  }

  setTokens(accessToken, refreshToken, expiresAt) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.expiresAt = expiresAt;
  }

  // ─── OAuth Flow ───────────────────────────────────────────
  getAuthUrl(redirectUri) {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      approval_prompt: 'force',
      scope: 'read,activity:read_all',
    });
    return `${STRAVA_AUTH}?${params}`;
  }

  async exchangeCode(code, redirectUri) {
    const body = new URLSearchParams({
      client_id: String(this.clientId),
      client_secret: String(this.clientSecret),
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });

    const response = await fetch(STRAVA_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Strava token exchange failed (${response.status}): ${text}`);
    }

    const data = await response.json();
    this.setTokens(data.access_token, data.refresh_token, data.expires_at);
    return data;
  }

  async refreshAccessToken() {
    if (!this.refreshToken || !this.clientSecret) return false;

    const body = new URLSearchParams({
      client_id: String(this.clientId),
      client_secret: String(this.clientSecret),
      refresh_token: String(this.refreshToken),
      grant_type: 'refresh_token',
    });

    const response = await fetch(STRAVA_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) return false;
    const data = await response.json();
    this.setTokens(data.access_token, data.refresh_token, data.expires_at);
    return data;
  }

  async ensureToken() {
    if (this.expiresAt && Date.now() / 1000 >= this.expiresAt - 300) {
      await this.refreshAccessToken();
    }
  }

  async request(endpoint) {
    await this.ensureToken();
    const response = await fetch(`${STRAVA_API}${endpoint}`, {
      headers: { 'Authorization': `Bearer ${this.accessToken}` },
    });
    if (!response.ok) {
      throw new Error(`Strava API error ${response.status}`);
    }
    return response.json();
  }

  // ─── Endpoints ────────────────────────────────────────────
  async getAthlete() {
    return this.request('/athlete');
  }

  async getActivities(page = 1, perPage = 30) {
    return this.request(`/athlete/activities?page=${page}&per_page=${perPage}`);
  }

  async getActivity(id) {
    return this.request(`/activities/${id}?include_all_efforts=false`);
  }

  async getActivityStreams(id, types = ['watts', 'heartrate', 'cadence', 'velocity_smooth']) {
    const keys = types.join(',');
    return this.request(`/activities/${id}/streams?keys=${keys}&key_by_type=true`);
  }

  async getActivityZones(id) {
    return this.request(`/activities/${id}/zones`);
  }

  async getAthleteStats(athleteId) {
    return this.request(`/athletes/${athleteId}/stats`);
  }
}

export const stravaService = new StravaService();
export default StravaService;
