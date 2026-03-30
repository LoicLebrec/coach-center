/**
 * Wahoo Fitness Cloud API Service
 *
 * Auth: OAuth 2.0
 * Docs: https://developers.wahooligan.com/cloud
 *
 * Setup:
 *   1. Register at https://developers.wahooligan.com
 *   2. Create an application, set Redirect URI to your app URL
 *   3. Copy Client ID and Client Secret into Coach Center settings
 *   4. Click "Connect Wahoo" to authorize
 *
 * Scopes used: workouts_write user_read
 */

const WAHOO_API   = 'https://api.wahooligan.com';
const WAHOO_AUTH  = 'https://api.wahooligan.com/oauth/authorize';
const WAHOO_TOKEN = 'https://api.wahooligan.com/oauth/token';

// Zone → FTP percentage range (same as WorkoutBuilder zones)
const ZONE_POWER = {
  Z1: { lo: 0.45, hi: 0.55 },
  Z2: { lo: 0.56, hi: 0.75 },
  Z3: { lo: 0.76, hi: 0.90 },
  Z4: { lo: 0.91, hi: 1.05 },
  Z5: { lo: 1.06, hi: 1.20 },
  Z6: { lo: 1.21, hi: 1.50 },
  Z7: { lo: 1.51, hi: 2.00 },
};

class WahooService {
  constructor() {
    this.clientId     = null;
    this.clientSecret = null;
    this.accessToken  = null;
    this.refreshToken = null;
    this.expiresAt    = null;
  }

  configure(clientId, clientSecret) {
    this.clientId     = clientId;
    this.clientSecret = clientSecret;
  }

  isConfigured() {
    return !!(this.clientId && this.accessToken);
  }

  hasCredentials() {
    return !!(this.clientId && this.clientSecret);
  }

  setTokens(accessToken, refreshToken, expiresAt) {
    this.accessToken  = accessToken;
    this.refreshToken = refreshToken;
    this.expiresAt    = expiresAt;
  }

  // ─── OAuth Flow ───────────────────────────────────────────
  getAuthUrl(redirectUri) {
    const params = new URLSearchParams({
      client_id:     this.clientId,
      response_type: 'code',
      redirect_uri:  redirectUri,
      scope:         'workouts_write user_read',
      state:         'wahoo',
    });
    return `${WAHOO_AUTH}?${params}`;
  }

  async exchangeCode(code, redirectUri) {
    const body = new URLSearchParams({
      client_id:     String(this.clientId),
      client_secret: String(this.clientSecret),
      code,
      grant_type:    'authorization_code',
      redirect_uri:  redirectUri,
    });
    const res = await fetch(WAHOO_TOKEN, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Wahoo token exchange failed (${res.status}): ${text}`);
    }
    const data = await res.json();
    const expiresAt = data.expires_in
      ? Math.floor(Date.now() / 1000) + data.expires_in
      : null;
    this.setTokens(data.access_token, data.refresh_token, expiresAt);
    return data;
  }

  async refreshAccessToken() {
    if (!this.refreshToken || !this.clientSecret) return false;
    const body = new URLSearchParams({
      client_id:     String(this.clientId),
      client_secret: String(this.clientSecret),
      refresh_token: String(this.refreshToken),
      grant_type:    'refresh_token',
    });
    const res = await fetch(WAHOO_TOKEN, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) return false;
    const data = await res.json();
    const expiresAt = data.expires_in
      ? Math.floor(Date.now() / 1000) + data.expires_in
      : null;
    this.setTokens(data.access_token, data.refresh_token, expiresAt);
    return data;
  }

  async ensureToken() {
    if (this.expiresAt && Date.now() / 1000 >= this.expiresAt - 300) {
      await this.refreshAccessToken();
    }
  }

  async request(endpoint, options = {}) {
    await this.ensureToken();
    const res = await fetch(`${WAHOO_API}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type':  'application/json',
        ...(options.headers || {}),
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Wahoo API ${res.status}: ${text}`);
    }
    return res.json();
  }

  // ─── Endpoints ────────────────────────────────────────────
  async getUser() {
    return this.request('/v1/user');
  }

  async createWorkout(workoutPayload) {
    return this.request('/v1/workouts', {
      method: 'POST',
      body:   JSON.stringify({ workout: workoutPayload }),
    });
  }

  // ─── Build Wahoo workout payload from APEX blocks ─────────
  buildWorkoutPayload(workout) {
    const blocks = workout.blocks || workout.workoutBlocks || [];
    const name   = workout.title || workout.name || 'Coach Center Workout';

    const segments = blocks.map((b, i) => {
      const durationSec = Math.round((Number(b.durationMin) || 10) * 60);
      const zone        = b.zone || 'Z2';
      const { lo, hi }  = ZONE_POWER[zone] || ZONE_POWER.Z2;
      const lbl         = (b.label || '').toLowerCase();
      const isFirst     = i === 0;
      const isLast      = i === blocks.length - 1;

      let segmentTypeId = 2; // interval
      if (/warm.?up/.test(lbl) || (isFirst && lo < 0.65))  segmentTypeId = 3; // warmup
      else if (/cool.?down/.test(lbl) && isLast)            segmentTypeId = 1; // cooldown
      else if (/recovery/.test(lbl))                        segmentTypeId = 4; // active recovery

      const targets = [];
      if (b.targetWatts && Number(b.targetWatts) > 0) {
        // Manual watt override: use absolute target (Wahoo target_type_id 3 = watts)
        targets.push({ target_type_id: 3, min_value: Number(b.targetWatts) * 0.95, max_value: Number(b.targetWatts) * 1.05 });
      } else {
        targets.push({ target_type_id: 1, min_value: lo, max_value: hi }); // power % FTP
      }

      return {
        name:            b.label || `Segment ${i + 1}`,
        segment_type_id: segmentTypeId,
        order:           i,
        duration:        durationSec,
        targets,
      };
    });

    return {
      workout_token:            `apex_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      workout_type_location_id: 1, // indoor cycling
      name,
      segments,
    };
  }
}

export const wahooService = new WahooService();
export default WahooService;
