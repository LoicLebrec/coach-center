import React, { useState, useEffect, useCallback } from 'react';
import { intervalsService, buildIcuEventPayload } from './services/intervals';
import { buildRuleBasedWorkout, inferTrainingType } from './services/workout-rules';
import { stravaService } from './services/strava';
import { wahooService } from './services/wahoo';
import { exportToZwift } from './services/workout-exporter';
import { garminService } from './services/garmin';
import { aiCoachService } from './services/ai-coach';
import persistence from './services/persistence';
import Dashboard from './components/Dashboard';
import Activities from './components/Activities';
import PMCChart from './components/PMCChart';
import Settings from './components/Settings';
import WeeklyLoad from './components/WeeklyLoad';
import CoachChat from './components/CoachChat';
import AthleteProfile from './components/AthleteProfile';
import Calendar from './components/Calendar';
import WorkoutBuilder from './components/WorkoutBuilder';
import SmartWorkoutWizard from './components/SmartWorkoutWizard';
import GpxRouteBuilder from './components/GpxRouteBuilder';
import RaceCalendar from './components/RaceCalendar';
import WorkoutAnalysis from './components/WorkoutAnalysis';
import FormPredictor from './components/FormPredictor';
import { LIBRARY_WORKOUTS } from './data/workoutLibrary';
import './styles/app.css';

function extractJsonBlock(text) {
  if (!text) return null;

  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch?.[0]) return arrayMatch[0].trim();

  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) return objectMatch[0].trim();

  return null;
}

const VIEWS = {
  COACH: 'coach',
  ATHLETE_PROFILE: 'athlete_profile',
  WORKOUT_BUILDER: 'workout_builder',
  GPX_BUILDER: 'gpx_builder',
  RACE_CALENDAR: 'race_calendar',
  WORKOUT_ANALYSIS: 'workout_analysis',
  DASHBOARD: 'dashboard',
  PMC: 'pmc',
  ACTIVITIES: 'activities',
  WEEKLY: 'weekly',
  CALENDAR: 'calendar',
  SETTINGS: 'settings',
};

function asNumber(...values) {
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function findNumericByKeyPattern(obj, pattern, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 2) return null;
  for (const [key, value] of Object.entries(obj)) {
    if (pattern.test(String(key))) {
      const num = asNumber(value);
      if (num != null) return num;
    }
    if (value && typeof value === 'object') {
      const nested = findNumericByKeyPattern(value, pattern, depth + 1);
      if (nested != null) return nested;
    }
  }
  return null;
}

// Estimate TSS for an activity that has no icu_training_load
function estimateActivityTSS(activity, ftp) {
  const duration = activity.moving_time || activity.elapsed_time || 0;
  if (!duration) return null;

  const np = activity.weighted_average_watts || activity.icu_normalized_watts
    || activity.average_watts || activity.icu_average_watts;
  if (np && ftp && np > 0) {
    const intensityFactor = np / ftp;
    return Math.round((duration * np * intensityFactor) / (ftp * 3600) * 100);
  }

  const avgHR = activity.average_heartrate;
  if (avgHR && avgHR > 50) {
    const restHR = 50, maxHR = 190;
    const hrRatio = Math.min(1, Math.max(0, (avgHR - restHR) / (maxHR - restHR)));
    if (hrRatio > 0) {
      const trimp = (duration / 60) * hrRatio * 0.64 * Math.exp(1.92 * hrRatio);
      return Math.round(trimp * 1.5);
    }
  }

  return Math.round((duration / 3600) * 40);
}

// Build synthetic CTL/ATL/TSB wellness array from activity TSS history
function computeSyntheticWellness(activities) {
  if (!activities?.length) return [];
  const tssByDate = {};
  for (const a of activities) {
    const date = (a.start_date_local || '').slice(0, 10);
    if (!date || date === 'null') continue;
    tssByDate[date] = (tssByDate[date] || 0) + (a.icu_training_load || 0);
  }
  const dates = Object.keys(tssByDate).sort();
  if (!dates.length) return [];
  let ctl = 0, atl = 0;
  const wellness = [];
  for (let d = new Date(dates[0] + 'T00:00:00'); d <= new Date(); d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const tss = tssByDate[dateStr] || 0;
    ctl = ctl + (tss - ctl) / 42;
    atl = atl + (tss - atl) / 7;
    wellness.push({
      id: dateStr,
      icu_ctl: Math.round(ctl * 10) / 10,
      icu_atl: Math.round(atl * 10) / 10,
      _synthetic: true,
    });
  }
  return wellness;
}

function normalizeAthleteProfile(rawAthlete) {
  if (!rawAthlete || typeof rawAthlete !== 'object') return rawAthlete;

  const explicitFtp = asNumber(
    rawAthlete.icu_ftp,
    rawAthlete.eftp,
    rawAthlete.eFTP,
    rawAthlete.estimated_ftp,
    rawAthlete.estimatedFtp,
    rawAthlete.ftp,
    rawAthlete.ftp_watts,
    rawAthlete.critical_power,
    rawAthlete.zones?.ftp
  );

  const scannedEFtp = findNumericByKeyPattern(rawAthlete, /(^|_)e\s*ftp$|estimated.?ftp|^eftp$/i);
  const scannedFtp = findNumericByKeyPattern(rawAthlete, /(^|_)ftp$|ftp.?watts|critical.?power/i);
  const normalizedFtp = explicitFtp ?? scannedEFtp ?? scannedFtp ?? null;

  return {
    ...rawAthlete,
    icu_ftp: normalizedFtp ?? rawAthlete.icu_ftp ?? null,
    eftp: scannedEFtp ?? asNumber(rawAthlete.eftp, rawAthlete.eFTP) ?? null,
  };
}

export default function App() {
  const INCREMENTAL_SYNC_DAYS = 120;
  const REPAIR_SYNC_DAYS = 730;

  const [view, setView] = useState(VIEWS.DASHBOARD);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Data state
  const [wellness, setWellness] = useState([]);
  const [activities, setActivities] = useState([]);
  const [athlete, setAthlete] = useState(null);
  const [events, setEvents] = useState([]);
  const [plannedEvents, setPlannedEvents] = useState([]);
  const [customWorkoutLibrary, setCustomWorkoutLibrary] = useState([]);
  const [powerCurve, setPowerCurve] = useState(null);

  // LLM config
  const [claudeApiKey, setClaudeApiKey] = useState(null);
  const [groqApiKey, setGroqApiKey] = useState(null);
  const [llmProvider, setLlmProvider] = useState('groq');
  const [mapTilerKey, setMapTilerKey] = useState('');

  // Connection state
  const [connections, setConnections] = useState({
    intervals: false,
    strava: false,
    garmin: false,
    wahoo: false,
  });

  // Load saved credentials on mount
  useEffect(() => {
    (async () => {
      try {
        const intCreds = await persistence.getCredentials('intervals');
        if (intCreds?.athleteId && intCreds?.apiKey) {
          intervalsService.configure(intCreds.athleteId, intCreds.apiKey);
          setConnections(c => ({ ...c, intervals: true }));
        }

        const wahooCreds = await persistence.getCredentials('wahoo');
        if (wahooCreds?.clientId && wahooCreds?.clientSecret) {
          wahooService.configure(wahooCreds.clientId, wahooCreds.clientSecret);
          if (wahooCreds.accessToken) {
            wahooService.setTokens(wahooCreds.accessToken, wahooCreds.refreshToken, wahooCreds.expiresAt);
            setConnections(c => ({ ...c, wahoo: true }));
          }
        }

        const stravaCreds = await persistence.getCredentials('strava');
        if (stravaCreds?.clientId && stravaCreds?.clientSecret) {
          stravaService.configure(stravaCreds.clientId, stravaCreds.clientSecret);
          if (stravaCreds.accessToken) {
            stravaService.setTokens(
              stravaCreds.accessToken,
              stravaCreds.refreshToken,
              stravaCreds.expiresAt
            );
            setConnections(c => ({ ...c, strava: true }));
          }
        }

        garminService.configure('intervals');
        setConnections(c => ({ ...c, garmin: intervalsService.isConfigured() }));

        const claudeKey = await persistence.getClaudeApiKey();
        if (claudeKey) {
          aiCoachService.configure(claudeKey);
          setClaudeApiKey(claudeKey);
        }

        const groqKey = await persistence.getGroqApiKey();
        if (groqKey) {
          aiCoachService.configureGroq(groqKey);
          setGroqApiKey(groqKey);
        }

        const provider = await persistence.getLlmProvider();
        aiCoachService.setProvider(provider);
        setLlmProvider(provider);

        const mtKey = await persistence.getPref('maptiler-key', '');
        if (mtKey) setMapTilerKey(mtKey);

        const localPlanned = await persistence.getPlannedEvents();
        setPlannedEvents(localPlanned || []);

        const customLibrary = await persistence.getWorkoutLibrary();
        setCustomWorkoutLibrary(customLibrary || []);

      } catch (err) {
        console.error('Failed to load credentials:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Handle OAuth callbacks (Strava + Wahoo) — differentiated by `state` param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const authError = params.get('error');
    const state = params.get('state'); // 'strava' | 'wahoo'

    if (authError) {
      setError(`OAuth was not completed: ${authError}`);
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    if (!code) return;

    (async () => {
      try {
        const redirectUri = window.location.origin + window.location.pathname;

        if (state === 'wahoo') {
          const data = await wahooService.exchangeCode(code, redirectUri);
          await persistence.saveCredentials('wahoo', {
            ...(await persistence.getCredentials('wahoo')),
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: wahooService.expiresAt,
          });
          setConnections(c => ({ ...c, wahoo: true }));
        } else {
          // Default: Strava (legacy callbacks without state also go here)
          const data = await stravaService.exchangeCode(code, redirectUri);
          await persistence.saveCredentials('strava', {
            ...(await persistence.getCredentials('strava')),
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: data.expires_at,
            athleteId: data.athlete?.id,
          });
          setConnections(c => ({ ...c, strava: true }));
        }
        window.history.replaceState({}, '', window.location.pathname);
      } catch (err) {
        setError('OAuth failed: ' + err.message);
      }
    })();
  }, []);

  // Dedup activities: same start_date_local (to minute) + type → keep richest entry
  const deduplicateActivities = useCallback((acts) => {
    if (!acts?.length) return acts;
    const richness = (a) => {
      const fields = [
        a.icu_training_load, a.icu_average_watts, a.average_watts,
        a.average_heartrate, a.moving_time, a.distance,
        a.icu_ctl_change, a.max_heartrate, a.total_elevation_gain,
      ];
      return fields.filter(v => v != null && v !== 0).length;
    };
    const groups = new Map();
    for (const a of acts) {
      const key = `${(a.start_date_local || '').slice(0, 16)}_${a.type || ''}`;
      const existing = groups.get(key);
      if (!existing || richness(a) > richness(existing)) {
        groups.set(key, a);
      }
    }
    return Array.from(groups.values());
  }, []);

  // Normalize payload variants from Intervals endpoints into one canonical shape.
  const normalizeActivities = useCallback((acts) => {
    if (!Array.isArray(acts)) return [];

    return acts.map((a, idx) => {
      const rawDate = a.start_date_local || a.startDateLocal || a.start_date || a.startDate || a.date || null;
      const normalizedDate = rawDate && String(rawDate).includes('T')
        ? rawDate
        : (rawDate ? `${rawDate}T00:00:00` : null);

      const syntheticId = `__local_${normalizedDate || 'unknown'}_${a.type || a.sport || idx}`;

      return {
        ...a,
        id: a.id ?? a.activity_id ?? a.activityId ?? syntheticId,
        name: a.name || a.activity_name || a.title || a.workout_name || a.description || '',
        type: a.type || a.sport_type || a.sport || a.activity_type || a.activityType || '',
        start_date_local: normalizedDate,
        moving_time: a.moving_time ?? a.movingTime ?? a.duration ?? a.elapsed_time ?? a.elapsedTime ?? 0,
        elapsed_time: a.elapsed_time ?? a.elapsedTime ?? a.duration ?? a.moving_time ?? a.movingTime ?? 0,
        distance: a.distance ?? a.total_distance ?? a.dist ?? null,
        total_elevation_gain: a.total_elevation_gain ?? a.elevation_gain ?? a.elev_gain ?? null,
        icu_training_load: a.icu_training_load ?? a.training_load ?? a.tss ?? a.load ?? null,
        icu_average_watts: a.icu_average_watts ?? a.average_watts ?? a.avg_power ?? a.power ?? null,
        icu_normalized_watts: a.icu_normalized_watts ?? a.weighted_average_watts ?? a.normalizedWatts ?? null,
        average_watts: a.average_watts ?? a.avg_power ?? a.icu_average_watts ?? null,
        weighted_average_watts: a.weighted_average_watts ?? a.icu_normalized_watts ?? null,
        average_heartrate: a.average_heartrate ?? a.avg_hr ?? a.heart_rate ?? null,
        max_heartrate: a.max_heartrate ?? a.max_hr ?? null,
        _source: a._source ?? (a.icu_training_load != null ? 'intervals' : a.weighted_average_watts != null ? 'strava' : 'unknown'),
      };
    });
  }, []);

  // Build weekly journal snapshots from wellness + activities data
  const buildJournal = useCallback(async (wellnessData, activitiesData) => {
    if (!wellnessData?.length) return;
    // Group activities by ISO week (Monday start)
    const getWeekStart = (dateStr) => {
      const d = new Date(dateStr);
      const day = d.getDay();
      const diff = (day === 0 ? -6 : 1 - day);
      d.setDate(d.getDate() + diff);
      return d.toISOString().split('T')[0];
    };
    const actsByWeek = {};
    for (const a of (activitiesData || [])) {
      if (!a.start_date_local) continue;
      const w = getWeekStart(a.start_date_local);
      if (!actsByWeek[w]) actsByWeek[w] = [];
      actsByWeek[w].push(a);
    }
    // For each week found in wellness, save a snapshot
    const weeksSeen = new Set();
    for (const w of wellnessData) {
      if (!w.id) continue;
      const ws = getWeekStart(w.id);
      if (weeksSeen.has(ws)) continue;
      weeksSeen.add(ws);
      const acts = actsByWeek[ws] || [];
      const wellnessEntries = wellnessData.filter(x => x.id && getWeekStart(x.id) === ws);
      const lastEntry = wellnessEntries[wellnessEntries.length - 1] || {};
      const snapshot = {
        ctl: lastEntry.icu_ctl ? Math.round(lastEntry.icu_ctl * 10) / 10 : null,
        atl: lastEntry.icu_atl ? Math.round(lastEntry.icu_atl * 10) / 10 : null,
        tsb: lastEntry.icu_ctl && lastEntry.icu_atl
          ? Math.round((lastEntry.icu_ctl - lastEntry.icu_atl) * 10) / 10 : null,
        totalTSS: acts.reduce((s, a) => s + (a.icu_training_load || 0), 0),
        rides: acts.filter(a => a.type === 'Ride' || a.type === 'VirtualRide').length,
        runs: acts.filter(a => a.type === 'Run').length,
        notes: [],
      };
      await persistence.saveWeeklySnapshot(ws, snapshot);
    }
  }, []);

  // Data completeness score used to prioritize enrichment for sparse activities.
  const computeActivityCompleteness = useCallback((a) => {
    const signals = [
      a.name,
      a.type || a.sport_type,
      a.start_date_local,
      a.moving_time || a.elapsed_time,
      a.distance,
      a.icu_training_load || a.training_load,
      a.icu_average_watts || a.average_watts,
      a.average_heartrate,
      a.total_elevation_gain,
    ];
    return signals.filter(v => v != null && v !== 0 && v !== '').length;
  }, []);

  const enrichActivitiesProgressive = useCallback(async (activities, maxToEnrich) => {
    if (!activities?.length) return [];

    const prioritized = [...activities]
      .sort((a, b) => {
        // First enrich sparse records, then most recent.
        const scoreDelta = computeActivityCompleteness(a) - computeActivityCompleteness(b);
        if (scoreDelta !== 0) return scoreDelta;
        return (b.start_date_local || '').localeCompare(a.start_date_local || '');
      })
      .slice(0, maxToEnrich);

    const enrichedMap = {};
    const batchSize = 10;

    for (let i = 0; i < prioritized.length; i += batchSize) {
      const batch = prioritized
        .slice(i, i + batchSize)
        .filter(a => a.id && !String(a.id).startsWith('__local_'));
      if (batch.length === 0) continue;
      const results = await Promise.allSettled(
        batch.map(a => intervalsService.getActivity(a.id))
      );

      results.forEach(r => {
        if (r.status === 'fulfilled' && r.value?.id) {
          enrichedMap[r.value.id] = r.value;
        }
      });
    }

    return activities.map(a => {
      const enriched = enrichedMap[a.id];
      if (!enriched) return a;

      const merged = { ...a };
      for (const [key, val] of Object.entries(enriched)) {
        // Merge only useful values to avoid degrading a previously complete record.
        if (val !== null && val !== undefined && val !== '') {
          merged[key] = val;
        }
      }
      return merged;
    });
  }, [computeActivityCompleteness]);

  // Fetch data from Intervals.icu and/or Strava — whichever is connected
  const fetchData = useCallback(async (options = {}) => {
    const hasIcu = intervalsService.isConfigured();
    const hasStrava = stravaService.isConfigured();
    if (!hasIcu && !hasStrava) return;

    const mode = options.mode || 'incremental';
    const syncDays = mode === 'repair' ? REPAIR_SYNC_DAYS : INCREMENTAL_SYNC_DAYS;

    setLoading(true);
    setError(null);

    try {
      const now = new Date();
      const oldestDate = new Date(now);
      oldestDate.setDate(oldestDate.getDate() - syncDays);
      const oldest = oldestDate.toISOString().split('T')[0];
      const newest = now.toISOString().split('T')[0];

      let icuWellness = [], icuActivities = [], icuAthlete = null, icuEvents = [], icuPowerCurve = null;
      let stravaActivities = [], stravaAthlete = null;

      // Fetch from Intervals.icu if configured
      if (hasIcu) {
        const [wellnessData, activitiesData, athleteData, eventsData, powerCurveData] = await Promise.allSettled([
          intervalsService.getWellness(oldest, newest),
          intervalsService.getActivities(oldest, newest),
          intervalsService.getAthlete(),
          intervalsService.getEvents(oldest, newest),
          intervalsService.getPowerCurve('Ride'),
        ]);
        icuWellness = wellnessData.status === 'fulfilled' ? (wellnessData.value || []) : [];
        icuActivities = activitiesData.status === 'fulfilled' ? (activitiesData.value || []) : [];
        icuAthlete = athleteData.status === 'fulfilled' ? normalizeAthleteProfile(athleteData.value || null) : null;
        icuEvents = eventsData.status === 'fulfilled' ? (eventsData.value || []) : [];
        icuPowerCurve = powerCurveData.status === 'fulfilled' ? (powerCurveData.value || null) : null;
      }

      // Fetch from Strava if configured
      if (hasStrava) {
        const [stravaActData, stravaAthleteData] = await Promise.allSettled([
          stravaService.getActivitiesDateRange(oldest, newest),
          stravaService.getAthlete(),
        ]);
        stravaActivities = stravaActData.status === 'fulfilled' ? (stravaActData.value || []) : [];
        stravaAthlete = stravaAthleteData.status === 'fulfilled'
          ? normalizeAthleteProfile(stravaAthleteData.value || null) : null;
      }

      // Merge and normalize — ICU activities take precedence over Strava duplicates
      const allRaw = [...icuActivities, ...stravaActivities];
      const normalized = normalizeActivities(allRaw);
      let dedupedActivities = deduplicateActivities(normalized);

      // Determine FTP for TSS estimation (ICU wins over Strava)
      const resolvedAthlete = icuAthlete || stravaAthlete;
      const ftp = resolvedAthlete?.icu_ftp || resolvedAthlete?.ftp || null;

      // Estimate TSS for activities that have none (common with Strava-only)
      dedupedActivities = dedupedActivities.map(a => {
        if (a.icu_training_load != null) return a;
        const estimated = estimateActivityTSS(a, ftp);
        return estimated != null ? { ...a, icu_training_load: estimated, _tssEstimated: true } : a;
      });

      // Progressive enrichment from ICU per-activity endpoint
      if (hasIcu && dedupedActivities.length > 0) {
        const maxToEnrich = mode === 'repair'
          ? dedupedActivities.length
          : Math.min(dedupedActivities.length, 180);
        dedupedActivities = await enrichActivitiesProgressive(dedupedActivities, maxToEnrich);
      }

      // Wellness: use ICU if available, else compute synthetic from activity TSS
      const finalWellness = icuWellness.length > 0
        ? icuWellness
        : computeSyntheticWellness(dedupedActivities);

      setWellness(finalWellness);
      setActivities(dedupedActivities);
      setAthlete(resolvedAthlete);
      setEvents(icuEvents);
      setPowerCurve(icuPowerCurve);

      // Build training journal for LLM memory
      await buildJournal(finalWellness, dedupedActivities);

      // Cache for offline use
      if (finalWellness.length) await persistence.cacheData('wellness', finalWellness, 30);
      if (dedupedActivities.length) await persistence.cacheData('activities', dedupedActivities, 30);
      await persistence.savePref('last-sync-meta', {
        mode,
        syncDays,
        syncedAt: new Date().toISOString(),
        activityCount: dedupedActivities.length,
        sources: [hasIcu && 'intervals', hasStrava && 'strava'].filter(Boolean),
      });

    } catch (err) {
      setError(err.message);
      const cachedWellness = await persistence.getCachedData('wellness');
      const cachedActivities = await persistence.getCachedData('activities');
      if (cachedWellness) setWellness(cachedWellness);
      if (cachedActivities) setActivities(cachedActivities);
    } finally {
      setLoading(false);
    }
  }, [deduplicateActivities, normalizeActivities, buildJournal, enrichActivitiesProgressive]);

  useEffect(() => {
    if (!connections.intervals && !connections.strava) return;

    fetchData({ mode: 'incremental' });

    const pollId = setInterval(() => {
      fetchData({ mode: 'incremental' });
    }, 120000);

    const onFocus = () => fetchData({ mode: 'incremental' });
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(pollId);
      window.removeEventListener('focus', onFocus);
    };
  }, [connections.intervals, connections.strava, fetchData]);

  const handleRepairHistory = useCallback(async () => {
    await fetchData({ mode: 'repair' });
  }, [fetchData]);

  const handleAddPlannedEvent = useCallback(async (event) => {
    if (!event) return;

    const safeId = event.id || `local_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const normalized = {
      ...event,
      id: safeId,
      source: event.source || 'manual',
      planned: true,
    };

    // Auto-sync to Intervals.icu if configured (best-effort, never blocks the local save)
    if (intervalsService.isConfigured()) {
      try {
        const icuPayload = buildIcuEventPayload(normalized);
        await intervalsService.createEvent(icuPayload);
        normalized.icuSynced = true;
      } catch (err) {
        console.warn('[ICU sync] single event failed:', err.message);
      }
    }

    const next = await persistence.addPlannedEvent(normalized);
    setPlannedEvents(next);
  }, []);

  const handleRemovePlannedEvent = useCallback(async (eventId) => {
    if (!eventId) return;
    const next = await persistence.removePlannedEvent(eventId);
    setPlannedEvents(next);
  }, []);

  const handleGenerateAiWorkouts = useCallback(async ({ objective = '', days = 7 } = {}) => {
    const hasProviderKey = llmProvider === 'groq' ? !!groqApiKey : !!claudeApiKey;
    if (!hasProviderKey) {
      throw new Error('AI provider not configured. Add your API key in Settings first.');
    }

    const athleteProfile = await persistence.getAthleteProfile();
    const racingWeeks = athleteProfile?.racingWeeks || {};
    const ftp = Number(athleteProfile?.ftp || athleteProfile?.icu_ftp || 200);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);
    const startDay = startDate.toISOString().split('T')[0];

    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + Math.max(0, Number(days) - 1));

    const raceSundays = Object.entries(racingWeeks)
      .filter(([, enabled]) => !!enabled)
      .map(([saturdayKey]) => {
        const sunday = new Date(`${saturdayKey}T00:00:00`);
        sunday.setDate(sunday.getDate() + 1);
        return sunday;
      })
      .filter((d) => !Number.isNaN(d.getTime()) && d >= startDate && d <= endDate)
      .map((d) => d.toISOString().split('T')[0]);

    const sundayRaceDirective = raceSundays.length
      ? `Race weeks are ON for: ${raceSundays.join(', ')}. These dates are race day (Sunday). Create race entries with kind="race" on each of those Sundays, and taper/load accordingly before them.`
      : 'No race-week toggles are ON in the current planning window.';

    const prompt = [
      'Build a realistic training micro-cycle as strict JSON array only.',
      `Generate ${days} planned sessions starting ${startDay}.`,
      'Return ONLY valid JSON array. No markdown, no explanation.',
      'Each item MUST have these keys:',
      '  date (YYYY-MM-DD), title (string), type (Ride|Run|Swim|Workout), kind (training|race|rest),',
      '  trainingType (one of: vo2|threshold|sweetspot|endurance|recovery|openers|rest),',
      '  durationMin (integer minutes, e.g. 60 for 1h, 0 for rest days),',
      '  notes (short description of the session intent).',
      sundayRaceDirective,
      objective ? `Primary objective: ${objective}.` : 'Primary objective: improve aerobic fitness and consistency.',
      'Vary intensity across the week (not every day is hard). Include recovery and endurance days.',
    ].join('\n');

    const aiResponse = await aiCoachService.chat(prompt, null, [], null, []);
    const jsonPayload = extractJsonBlock(aiResponse);

    if (!jsonPayload) {
      throw new Error('AI response could not be parsed as JSON workouts.');
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonPayload);
    } catch (err) {
      throw new Error('AI returned invalid JSON format for workout plan.');
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('AI returned an empty workout list.');
    }

    const generated = parsed.map((item, idx) => {
      const fallbackDate = new Date(startDate);
      fallbackDate.setDate(startDate.getDate() + idx);
      const dateKey = typeof item?.date === 'string' ? item.date : fallbackDate.toISOString().split('T')[0];
      const kind = String(item?.kind || 'training').toLowerCase();
      const isTraining = kind === 'training' || kind === 'workout';

      // Resolve training type — use AI-provided or infer from title/notes
      const trainingType = item?.trainingType
        || inferTrainingType(item?.title || '', item?.notes || '');
      const durationMin = Number(item?.durationMin) || 60;

      // Build structured blocks for training sessions
      let workoutBlocks = [];
      if (isTraining && trainingType !== 'rest' && durationMin >= 20) {
        try {
          const built = buildRuleBasedWorkout(trainingType, durationMin, 'good', ftp, null);
          workoutBlocks = built.blocks || [];
        } catch (_) { }
      }

      return {
        id: `local_ai_${Date.now()}_${idx}`,
        source: 'ai',
        planned: true,
        name: item?.title || `AI Session ${idx + 1}`,
        title: item?.title || `AI Session ${idx + 1}`,
        type: item?.type || 'Ride',
        event_type: item?.type || 'Ride',
        kind,
        start_date_local: `${dateKey}T07:00:00`,
        notes: item?.notes || '',
        workoutBlocks,
      };
    });

    // Enforce Sunday race defaults for toggled race weeks, even if model misses them.
    if (raceSundays.length) {
      raceSundays.forEach((dateKey) => {
        const sameDay = generated.find((g) => String(g.start_date_local || '').slice(0, 10) === dateKey);
        if (sameDay) {
          sameDay.kind = 'race';
          sameDay.type = sameDay.type || 'Race';
          sameDay.event_type = sameDay.event_type || 'Race';
          sameDay.name = sameDay.name || 'Race Day';
          sameDay.title = sameDay.title || 'Race Day';
          sameDay.notes = `${sameDay.notes ? `${sameDay.notes} | ` : ''}Auto-marked as Sunday race from race-week toggle.`;
        } else {
          generated.push({
            id: `local_ai_race_${Date.now()}_${dateKey}`,
            source: 'ai',
            planned: true,
            name: 'Race Day',
            title: 'Race Day',
            type: 'Race',
            event_type: 'Race',
            kind: 'race',
            start_date_local: `${dateKey}T09:00:00`,
            notes: 'Auto-inserted Sunday race from race-week toggle.',
          });
        }
      });

      generated.sort((a, b) => (a.start_date_local || '').localeCompare(b.start_date_local || ''));
    }

    const current = await persistence.getPlannedEvents();
    const next = [...(current || []), ...generated];
    await persistence.savePlannedEvents(next);
    setPlannedEvents(next);

    // Batch-sync to Intervals.icu if configured (best-effort)
    if (intervalsService.isConfigured()) {
      try {
        const icuPayloads = generated
          .filter(e => (e.kind || '') !== 'note')
          .map(e => buildIcuEventPayload(e));
        if (icuPayloads.length) await intervalsService.createEvent(icuPayloads);
        generated.forEach(e => { e.icuSynced = true; });
      } catch (err) {
        console.warn('[ICU sync] batch plan failed:', err.message);
      }
    }

    return generated;
  }, [llmProvider, groqApiKey, claudeApiKey]);

  const handleSendToWahoo = useCallback(async (workout) => {
    if (!wahooService.isConfigured()) throw new Error('Wahoo not connected. Add credentials in Settings.');
    const payload = wahooService.buildWorkoutPayload(workout);
    await wahooService.createWorkout(payload);
  }, []);

  const handleExportToZwift = useCallback((workout) => {
    exportToZwift(workout);
  }, []);

  const handleOpenRouteBuilder = useCallback((event) => {
    if (event) {
      persistence.savePref('route-builder-last-session', {
        id: event.id,
        title: event.title,
        type: event.type,
        date: event.date ? new Date(event.date).toISOString() : null,
      }).catch(() => null);
    }
    setView(VIEWS.GPX_BUILDER);
  }, []);

  const handleSaveWorkoutToLibrary = useCallback(async (workout) => {
    if (!workout) return [];
    const next = await persistence.addWorkoutToLibrary(workout);
    setCustomWorkoutLibrary(next);
    return next;
  }, []);

  const handleGenerateAiWorkoutTemplate = useCallback(async ({ description = '', sport = 'Ride' } = {}) => {
    const hasProviderKey = llmProvider === 'groq' ? !!groqApiKey : !!claudeApiKey;
    if (!hasProviderKey) {
      throw new Error('AI provider not configured. Add your API key in Settings first.');
    }

    const prompt = [
      'Build ONE structured workout from the short day description.',
      'Return ONLY valid JSON object (no markdown) with keys:',
      'title, objective, type, notes, blocks.',
      'blocks must be an array of objects: {"label": string, "durationMin": number, "zone": "Z1"|"Z2"|"Z3"|"Z4"|"Z5"|"Z6"|"Z7"}.',
      `Preferred sport: ${sport}.`,
      `Day description: ${description || 'Build aerobic session with one quality block.'}`,
      'Keep total duration between 45 and 150 minutes.',
    ].join('\n');

    const aiResponse = await aiCoachService.chat(prompt, null, [], null, []);
    const jsonPayload = extractJsonBlock(aiResponse);
    if (!jsonPayload) {
      throw new Error('AI response could not be parsed as workout JSON.');
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonPayload);
    } catch (_) {
      throw new Error('AI returned invalid JSON workout format.');
    }

    const safeBlocks = Array.isArray(parsed?.blocks)
      ? parsed.blocks
        .map((b, idx) => ({
          id: `ai_b_${Date.now()}_${idx}`,
          label: String(b?.label || `Block ${idx + 1}`).slice(0, 60),
          durationMin: Math.max(1, Number(b?.durationMin) || 10),
          zone: /^Z[1-7]$/i.test(String(b?.zone || '')) ? String(b.zone).toUpperCase() : 'Z2',
        }))
      : [];

    if (!safeBlocks.length) {
      throw new Error('AI workout has no valid blocks. Try a more specific day description.');
    }

    const typeText = String(parsed?.type || sport || 'Ride');
    return {
      title: String(parsed?.title || 'AI Workout'),
      objective: String(parsed?.objective || description || 'Day objective'),
      type: /run/i.test(typeText) ? 'Run' : 'Ride',
      notes: String(parsed?.notes || description || ''),
      blocks: safeBlocks,
    };
  }, [llmProvider, groqApiKey, claudeApiKey]);

  const handleSaveSettings = async (provider, creds) => {
    if (provider === 'intervals') {
      intervalsService.configure(creds.athleteId, creds.apiKey);
      await persistence.saveCredentials('intervals', creds);
      garminService.configure('intervals');
      setConnections(c => ({ ...c, intervals: true, garmin: true }));
    } else if (provider === 'strava') {
      stravaService.configure(creds.clientId, creds.clientSecret);
      if (creds.accessToken) {
        stravaService.setTokens(creds.accessToken, creds.refreshToken, creds.expiresAt);
        setConnections(c => ({ ...c, strava: true }));
      }
      await persistence.saveCredentials('strava', creds);
    } else if (provider === 'wahoo') {
      wahooService.configure(creds.clientId, creds.clientSecret);
      if (creds.accessToken) {
        wahooService.setTokens(creds.accessToken, creds.refreshToken, creds.expiresAt);
        setConnections(c => ({ ...c, wahoo: true }));
      }
      await persistence.saveCredentials('wahoo', creds);
    } else if (provider === 'claude') {
      aiCoachService.configure(creds.apiKey || null);
      setClaudeApiKey(creds.apiKey || null);
      await persistence.saveClaudeApiKey(creds.apiKey || null);
    } else if (provider === 'groq') {
      aiCoachService.configureGroq(creds.apiKey || null);
      setGroqApiKey(creds.apiKey || null);
      await persistence.saveGroqApiKey(creds.apiKey || null);
    } else if (provider === 'llm-provider') {
      aiCoachService.setProvider(creds.provider);
      setLlmProvider(creds.provider);
      await persistence.saveLlmProvider(creds.provider);
    } else if (provider === 'maptiler') {
      setMapTilerKey(creds.key || '');
    }
  };

  const handleDisconnect = async (provider) => {
    await persistence.clearCredentials(provider);
    if (provider === 'intervals') {
      intervalsService.configure(null, null);
      setConnections(c => ({ ...c, intervals: false, garmin: false }));
      setWellness([]);
      setActivities([]);
      setAthlete(null);
    } else if (provider === 'strava') {
      stravaService.setTokens(null, null, null);
      setConnections(c => ({ ...c, strava: false }));
      if (!intervalsService.isConfigured()) {
        setWellness([]);
        setActivities([]);
        setAthlete(null);
      }
    } else if (provider === 'wahoo') {
      wahooService.setTokens(null, null, null);
      setConnections(c => ({ ...c, wahoo: false }));
    }
  };

  const renderView = () => {
    if (!connections.intervals && !connections.strava && view !== VIEWS.SETTINGS) {
      return (
        <div className="loading-state">
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: 'var(--accent-cyan)', letterSpacing: '0.1em', marginBottom: 16 }}>&gt;&gt;</div>
          <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>Connect a data source to get started</p>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 8, maxWidth: 420, textAlign: 'center' }}>
            Connect <strong>Intervals.icu</strong> for full PMC analytics, power curves, wellness tracking, and Garmin sync.
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20, maxWidth: 420, textAlign: 'center' }}>
            Connect <strong>Strava</strong> for activity import with estimated TSS and form tracking.
          </p>
          <button className="btn btn-primary" onClick={() => setView(VIEWS.SETTINGS)}>
            Open Settings
          </button>
        </div>
      );
    }

    switch (view) {
      case VIEWS.COACH:
        return (
          <CoachChat
            wellness={wellness}
            activities={activities}
            athlete={athlete}
            events={events}
            plannedEvents={plannedEvents}
            claudeApiKey={claudeApiKey}
            groqApiKey={groqApiKey}
            llmProvider={llmProvider}
            onNeedApiKey={() => setView(VIEWS.SETTINGS)}
          />
        );
      case VIEWS.WORKOUT_BUILDER:
        return (
          <SmartWorkoutWizard
            athlete={athlete}
            events={events}
            plannedEvents={plannedEvents}
            onAddToCalendar={handleAddPlannedEvent}
            onGenerateWithAi={handleGenerateAiWorkoutTemplate}
          />
        );
      case VIEWS.ATHLETE_PROFILE:
        return <AthleteProfile wellness={wellness} athlete={athlete} events={events} activities={activities} loading={loading} powerCurve={powerCurve} />;
      case VIEWS.GPX_BUILDER:
        return (
          <div>
            <div className="page-header">
              <div className="page-title">GPX Route Builder</div>
              <div className="page-subtitle">Generate road-following routes and export GPX for Garmin and COROS</div>
            </div>
            <GpxRouteBuilder
              athlete={athlete}
              events={events}
              plannedEvents={plannedEvents}
              workoutLibrary={[...LIBRARY_WORKOUTS, ...customWorkoutLibrary]}
              mapTilerKey={mapTilerKey}
            />
          </div>
        );
      case VIEWS.RACE_CALENDAR:
        return (
          <div>
            <div className="page-header">
              <div className="page-title">Calendrier des courses</div>
              <div className="page-subtitle">Recherchez des courses FFC · FSGT · UFOLEP · FFCT et ajoutez-les à votre calendrier</div>
            </div>
            <RaceCalendar onAddToCalendar={handleAddPlannedEvent} />
          </div>
        );
      case VIEWS.WORKOUT_ANALYSIS:
        return <WorkoutAnalysis activities={activities} athlete={athlete} plannedEvents={plannedEvents} />;
      case VIEWS.DASHBOARD:
        return <Dashboard wellness={wellness} activities={activities} athlete={athlete} loading={loading} error={error} />;
      case VIEWS.PMC:
        return (
          <>
            <PMCChart wellness={wellness} activities={activities} athlete={athlete} loading={loading} />
            <FormPredictor wellness={wellness} plannedEvents={plannedEvents} />
          </>
        );
      case VIEWS.ACTIVITIES:
        return <Activities activities={activities} athlete={athlete} loading={loading} />;
      case VIEWS.WEEKLY:
        return <WeeklyLoad activities={activities} loading={loading} />;
      case VIEWS.CALENDAR:
        return (
          <Calendar
            events={events}
            plannedEvents={plannedEvents}
            activities={activities}
            wellness={wellness}
            athlete={athlete}
            loading={loading}
            onAddPlannedEvent={handleAddPlannedEvent}
            onRemovePlannedEvent={handleRemovePlannedEvent}
            onGenerateAiWorkouts={handleGenerateAiWorkouts}
            onSaveWorkoutToLibrary={handleSaveWorkoutToLibrary}
            onGenerateAiWorkoutTemplate={handleGenerateAiWorkoutTemplate}
            onSendToWahoo={connections.wahoo ? handleSendToWahoo : null}
            onExportToZwift={handleExportToZwift}
            workoutLibrary={[...LIBRARY_WORKOUTS, ...customWorkoutLibrary]}
            onOpenRouteBuilder={handleOpenRouteBuilder}
            onOpenWorkoutBuilder={() => setView(VIEWS.WORKOUT_BUILDER)}
          />
        );
      case VIEWS.SETTINGS:
        return (
          <Settings
            connections={connections}
            onSave={handleSaveSettings}
            onDisconnect={handleDisconnect}
            onRefresh={fetchData}
            onRepairHistory={handleRepairHistory}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <span className="sidebar-logo-mark">CC</span>
            <span className="sidebar-logo-wordmark">
              <span className="sidebar-logo-title">Coach Center</span>
              <span className="sidebar-logo-sub">Performance Studio</span>
            </span>
          </div>
          <div className="sidebar-version">APEX v0.2.0</div>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-section-label">Coach</div>
          <button className={`nav-item${view === VIEWS.COACH ? ' active coach-nav-active' : ''}`} onClick={() => setView(VIEWS.COACH)}>
            <span className="nav-icon nav-icon-text">AI</span><span>APEX Coach</span>
          </button>
          <button className={`nav-item ${view === VIEWS.ATHLETE_PROFILE ? 'active' : ''}`} onClick={() => setView(VIEWS.ATHLETE_PROFILE)}>
            <span className="nav-icon nav-icon-text">AP</span><span>Athlete Profile</span>
          </button>
          <button className={`nav-item ${view === VIEWS.WORKOUT_BUILDER ? 'active' : ''}`} onClick={() => setView(VIEWS.WORKOUT_BUILDER)}>
            <span className="nav-icon nav-icon-text">WB</span><span>Workout Builder</span>
          </button>
          <button className={`nav-item ${view === VIEWS.GPX_BUILDER ? 'active' : ''}`} onClick={() => setView(VIEWS.GPX_BUILDER)}>
            <span className="nav-icon nav-icon-text">RB</span><span>Route Builder</span>
          </button>
          <button className={`nav-item ${view === VIEWS.RACE_CALENDAR ? 'active' : ''}`} onClick={() => setView(VIEWS.RACE_CALENDAR)}>
            <span className="nav-icon nav-icon-text">RC</span><span>Calendrier courses</span>
          </button>

          <div className="nav-section-label">Analysis</div>
          <button className={`nav-item ${view === VIEWS.WORKOUT_ANALYSIS ? 'active' : ''}`} onClick={() => setView(VIEWS.WORKOUT_ANALYSIS)}>
            <span className="nav-icon nav-icon-text">WA</span><span>Workout Analysis</span>
          </button>
          <button className={`nav-item ${view === VIEWS.DASHBOARD ? 'active' : ''}`} onClick={() => setView(VIEWS.DASHBOARD)}>
            <span className="nav-icon nav-icon-text">DB</span><span>Dashboard</span>
          </button>
          <button className={`nav-item ${view === VIEWS.PMC ? 'active' : ''}`} onClick={() => setView(VIEWS.PMC)}>
            <span className="nav-icon nav-icon-text">PM</span><span>PMC / Form</span>
          </button>
          <button className={`nav-item ${view === VIEWS.ACTIVITIES ? 'active' : ''}`} onClick={() => setView(VIEWS.ACTIVITIES)}>
            <span className="nav-icon nav-icon-text">AC</span><span>Activities</span>
          </button>
          <button className={`nav-item ${view === VIEWS.WEEKLY ? 'active' : ''}`} onClick={() => setView(VIEWS.WEEKLY)}>
            <span className="nav-icon nav-icon-text">WL</span><span>Weekly Load</span>
          </button>
          <button className={`nav-item ${view === VIEWS.CALENDAR ? 'active' : ''}`} onClick={() => setView(VIEWS.CALENDAR)}>
            <span className="nav-icon nav-icon-text">CA</span><span>Calendar</span>
          </button>

          <div className="nav-section-label">System</div>
          <button className={`nav-item ${view === VIEWS.SETTINGS ? 'active' : ''}`} onClick={() => setView(VIEWS.SETTINGS)}>
            <span className="nav-icon nav-icon-text">ST</span><span>Settings</span>
          </button>

          <div className="nav-section-label">Connections</div>
          <div className="nav-item" style={{ cursor: 'default' }}>
            <span className="conn-dot" style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', flexShrink: 0, background: connections.intervals ? 'var(--accent-green)' : 'var(--text-3)' }}></span>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Intervals.icu</span>
          </div>
          <div className="nav-item" style={{ cursor: 'default' }}>
            <span className="conn-dot" style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', flexShrink: 0, background: connections.strava ? 'var(--accent-green)' : 'var(--text-3)' }}></span>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Strava</span>
          </div>
          <div className="nav-item" style={{ cursor: 'default' }}>
            <span className="conn-dot" style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', flexShrink: 0, background: connections.wahoo ? 'var(--accent-green)' : 'var(--text-3)' }}></span>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Wahoo</span>
          </div>
          <div className="nav-item" style={{ cursor: 'default' }}>
            <span className="conn-dot" style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', flexShrink: 0, background: connections.garmin ? 'var(--accent-yellow)' : 'var(--text-3)' }}></span>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Garmin (via I.icu)</span>
          </div>
        </nav>
      </aside>

      <main className={`main-content${view === VIEWS.COACH ? ' coach-active' : ''}${view === VIEWS.GPX_BUILDER ? ' gpx-active' : ''}`}>
        {error && view !== VIEWS.COACH && <div className="error-banner"><span className="error-tag">[ERR]</span> {error}</div>}
        {renderView()}
      </main>
    </div>
  );
}
