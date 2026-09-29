/**
 * Morning refresh of the widget snapshot, server-side.
 * Fetches Intervals.icu with the user's (encrypted) API key, then runs the same
 * pipeline as the Today view (bundled from src/services/dailyPlan.js).
 */
const axios = require('axios');
const { get, run, all } = require('./db');
const { decrypt } = require('./crypto');
const { computeDay, buildSnapshot } = require('./_lib/daily-plan');

const ICU = 'https://intervals.icu/api/v1';

function dayInZone(tz, offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function normalizeAthlete(raw, fallback = {}) {
  if (!raw) return fallback;
  const ride = (raw.sportSettings || []).find(s => (s.types || []).some(t => /Ride/.test(t)));
  return {
    ...raw,
    icu_ftp: raw.icu_ftp ?? ride?.ftp ?? fallback.icu_ftp ?? null,
    icu_weight: raw.icu_weight ?? raw.weight ?? fallback.icu_weight ?? null,
  };
}

async function fetchIntervals(athleteId, apiKey, today) {
  const auth = { username: 'API_KEY', password: apiKey };
  const q = (path, params) => axios.get(`${ICU}${path}`, { auth, params, timeout: 20000 }).then(r => r.data);
  const shift = (n) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const [wellness, activities, athlete, events, powerCurve] = await Promise.allSettled([
    q(`/athlete/${athleteId}/wellness`, { oldest: shift(-90), newest: today }),
    q(`/athlete/${athleteId}/activities`, { oldest: shift(-60), newest: today }),
    q(`/athlete/${athleteId}`),
    q(`/athlete/${athleteId}/events`, { oldest: shift(-7), newest: shift(30) }),
    q(`/athlete/${athleteId}/power-curves`, { type: 'Ride', start: '2010-01-01', end: today }),
  ]);
  if (wellness.status === 'rejected' && activities.status === 'rejected') {
    throw new Error(`Intervals.icu: ${wellness.reason?.response?.status || wellness.reason?.message}`);
  }
  const val = (r, d) => (r.status === 'fulfilled' ? r.value ?? d : d);
  return {
    wellness: val(wellness, []),
    activities: val(activities, []),
    athlete: val(athlete, null),
    events: val(events, []),
    powerCurve: val(powerCurve, null),
  };
}

/**
 * Recompute and store one user's snapshot.
 * Skips when the app already pushed a snapshot today (it has the check-in answers).
 */
async function refreshUser(userId, { force = false } = {}) {
  const creds = await get('SELECT athlete_id, enc_api_key FROM widget_intervals WHERE user_id = ?', [userId]);
  if (!creds) return { userId, status: 'no-credentials' };
  const row = await get('SELECT data, context, source FROM widget_snapshots WHERE user_id = ?', [userId]);
  const context = row?.context ? JSON.parse(row.context) : {};
  const today = dayInZone(context.tz);

  if (!force && row?.data && row.source === 'app') {
    const prev = JSON.parse(row.data);
    if (prev?.date === today) return { userId, status: 'skipped-app-fresh' };
  }

  try {
    const data = await fetchIntervals(creds.athlete_id, decrypt(creds.enc_api_key), today);
    const athlete = normalizeAthlete(data.athlete, context.athlete || {});
    const checkin = context.checkin?.date === today ? context.checkin : undefined;
    const day = computeDay({
      ...data,
      athlete,
      plannedEvents: context.plannedEvents || [],
      season: context.season || {},
      profileWeaknesses: context.profileWeaknesses || [],
      checkin,
      today,
    });
    const snapshot = buildSnapshot(day, { ftp: athlete.icu_ftp, source: 'server' });
    await run('UPDATE widget_snapshots SET data = ?, source = ?, updated_at = NOW() WHERE user_id = ?', [JSON.stringify(snapshot), 'server', userId]);
    await run('UPDATE widget_intervals SET last_run_at = NOW(), last_status = ?, last_error = NULL WHERE user_id = ?', ['ok', userId]);
    return { userId, status: 'ok', date: today };
  } catch (err) {
    await run('UPDATE widget_intervals SET last_run_at = NOW(), last_status = ?, last_error = ? WHERE user_id = ?', ['error', String(err.message).slice(0, 500), userId]);
    return { userId, status: 'error', error: err.message };
  }
}

async function refreshAllUsers() {
  // Only users that already have a widget row (token + context from the app).
  const users = await all('SELECT i.user_id FROM widget_intervals i JOIN widget_snapshots s ON s.user_id = i.user_id');
  const results = [];
  for (const u of users) results.push(await refreshUser(u.user_id)); // sequential: gentle on Intervals.icu
  return results;
}

module.exports = { refreshUser, refreshAllUsers };
