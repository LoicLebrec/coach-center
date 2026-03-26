/**
 * Intervals.icu API Service
 * 
 * Verified endpoints from: https://intervals.icu/api-docs.html
 * Auth: Basic auth with API key (for personal use) or OAuth token
 * 
 * IMPORTANT: Intervals.icu API allows CORS from browser for personal API keys.
 * For OAuth-based apps, you'd need a proxy. Personal API key works for SPA.
 */

const BASE_URL = 'https://intervals.icu/api/v1';

class IntervalsService {
  constructor() {
    this.athleteId = null;
    this.apiKey = null;
  }

  configure(athleteId, apiKey) {
    this.athleteId = athleteId;
    this.apiKey = apiKey;
  }

  isConfigured() {
    return !!(this.athleteId && this.apiKey);
  }

  getHeaders() {
    // Intervals.icu uses Basic auth: API_KEY as username, api key as password
    const encoded = btoa(`API_KEY:${this.apiKey}`);
    return {
      'Authorization': `Basic ${encoded}`,
      'Accept': 'application/json',
    };
  }

  async request(endpoint, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('Intervals.icu not configured. Set Athlete ID and API Key in Settings.');
    }

    const url = `${BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Intervals.icu API error ${response.status}: ${text}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return response.json();
    }
    return response.text();
  }

  // ─── PMC / Wellness ──────────────────────────────────────
  // GET /api/v1/athlete/{id}/wellness
  // Returns: icu_ctl (Fitness/CTL), icu_atl (Fatigue/ATL), computed TSB = CTL - ATL
  // Also: restingHR, weight, sleepSecs, sleepScore, etc.
  async getWellness(oldest, newest) {
    const params = new URLSearchParams();
    if (oldest) params.set('oldest', oldest);
    if (newest) params.set('newest', newest);
    return this.request(`/athlete/${this.athleteId}/wellness?${params}`);
  }

  async getWellnessToday() {
    const today = new Date().toISOString().split('T')[0];
    return this.request(`/athlete/${this.athleteId}/wellness/${today}`);
  }

  // ─── Activities ───────────────────────────────────────────
  // GET /api/v1/athlete/{id}/activities
  // Returns: icu_training_load, efficiency_factor, icu_intensity, 
  //          average_speed, calories, moving_time, etc.
  async getActivities(oldest, newest) {
    const params = new URLSearchParams();
    if (oldest) params.set('oldest', oldest);
    if (newest) params.set('newest', newest);
    return this.request(`/athlete/${this.athleteId}/activities?${params}`);
  }

  // GET /api/v1/activity/{id}
  async getActivity(activityId) {
    return this.request(`/activity/${activityId}`);
  }

  // ─── Activity Streams ─────────────────────────────────────
  // GET /api/v1/activity/{id}/streams.json
  // Available types: watts, heartrate, cadence, velocity_smooth, altitude, etc.
  // Note: endpoint requires .json suffix (confirmed via forum)
  async getActivityStreams(activityId, types = null) {
    let endpoint = `/activity/${activityId}/streams.json`;
    if (types && types.length > 0) {
      endpoint += `?types=${types.join(',')}`;
    }
    return this.request(endpoint);
  }

  // ─── Activity Intervals / Laps ────────────────────────────
  async getActivityIntervals(activityId) {
    return this.request(`/activity/${activityId}/intervals`);
  }

  // ─── Athlete Profile ──────────────────────────────────────
  // GET /api/v1/athlete/{id}
  // Returns: FTP, weight, zones, sport settings, etc.
  async getAthlete() {
    return this.request(`/athlete/${this.athleteId}`);
  }

  // ─── Events / Planned Workouts ────────────────────────────
  // GET /api/v1/athlete/{id}/events
  async getEvents(oldest, newest) {
    const params = new URLSearchParams();
    if (oldest) params.set('oldest', oldest);
    if (newest) params.set('newest', newest);
    return this.request(`/athlete/${this.athleteId}/events?${params}`);
  }

  // ─── Power Curve ──────────────────────────────────────────
  async getPowerCurve(type = 'Ride') {
    return this.request(`/athlete/${this.athleteId}/power-curves?type=${type}`);
  }

  // ─── Computed Metrics ─────────────────────────────────────
  // These are NOT from the API — they are calculated client-side
  // from the raw data, following the "zero-inference" principle.

  static computeTSB(ctl, atl) {
    return ctl - atl;
  }

  static computeDecoupling(firstHalfEF, secondHalfEF) {
    // Pwr:HR decoupling = (EF_first_half - EF_second_half) / EF_first_half * 100
    if (!firstHalfEF || firstHalfEF === 0) return null;
    return ((firstHalfEF - secondHalfEF) / firstHalfEF) * 100;
  }

  static computeEfficiencyFactor(normalizedPower, avgHR) {
    // EF = NP / avg HR
    if (!avgHR || avgHR === 0) return null;
    return normalizedPower / avgHR;
  }

  static assessFormState(tsb) {
    if (tsb > 25) return { state: 'transition', label: 'Detraining Risk', color: '#94a3b8' };
    if (tsb > 15) return { state: 'fresh', label: 'Race Ready', color: '#22c55e' };
    if (tsb > 5) return { state: 'optimal', label: 'Fresh', color: '#4ade80' };
    if (tsb > -10) return { state: 'neutral', label: 'Neutral', color: '#facc15' };
    if (tsb > -25) return { state: 'tired', label: 'Fatigued', color: '#fb923c' };
    return { state: 'overreaching', label: 'Overreaching', color: '#ef4444' };
  }
}

export const intervalsService = new IntervalsService();
export default IntervalsService;
