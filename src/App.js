import React, { useState, useEffect, useCallback } from 'react';
import { intervalsService } from './services/intervals';
import { stravaService } from './services/strava';
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
import GpxRouteBuilder from './components/GpxRouteBuilder';
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

  // LLM config
  const [claudeApiKey, setClaudeApiKey] = useState(null);
  const [groqApiKey, setGroqApiKey] = useState(null);
  const [llmProvider, setLlmProvider] = useState('groq');

  // Connection state
  const [connections, setConnections] = useState({
    intervals: false,
    strava: false,
    garmin: false,
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

  // Handle Strava OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const authError = params.get('error');

    if (authError) {
      setError(`Strava OAuth was not completed: ${authError}`);
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    if (code) {
      (async () => {
        try {
          const redirectUri = window.location.origin + window.location.pathname;
          const data = await stravaService.exchangeCode(code, redirectUri);
          await persistence.saveCredentials('strava', {
            ...(await persistence.getCredentials('strava')),
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: data.expires_at,
            athleteId: data.athlete?.id,
          });
          setConnections(c => ({ ...c, strava: true }));
          window.history.replaceState({}, '', window.location.pathname);
        } catch (err) {
          setError('Strava OAuth failed: ' + err.message);
        }
      })();
    }
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
        average_watts: a.average_watts ?? a.avg_power ?? a.icu_average_watts ?? null,
        average_heartrate: a.average_heartrate ?? a.avg_hr ?? a.heart_rate ?? null,
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

  // Fetch data when Intervals.icu is connected
  const fetchData = useCallback(async (options = {}) => {
    if (!intervalsService.isConfigured()) return;

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

      const [wellnessData, activitiesData, athleteData, eventsData] = await Promise.allSettled([
        intervalsService.getWellness(oldest, newest),
        intervalsService.getActivities(oldest, newest),
        intervalsService.getAthlete(),
        intervalsService.getEvents(oldest, newest),
      ]);

      const wellness = wellnessData.status === 'fulfilled' ? (wellnessData.value || []) : [];
      const rawActivities = activitiesData.status === 'fulfilled' ? (activitiesData.value || []) : [];
      const normalizedActivities = normalizeActivities(rawActivities);
      let dedupedActivities = deduplicateActivities(normalizedActivities);

      // Progressive enrichment from per-activity endpoint:
      // - incremental mode: enrich top sparse records while staying fast.
      // - repair mode: deep enrichment of full fetched history.
      if (dedupedActivities.length > 0) {
        const maxToEnrich = mode === 'repair'
          ? dedupedActivities.length
          : Math.min(dedupedActivities.length, 180);
        dedupedActivities = await enrichActivitiesProgressive(dedupedActivities, maxToEnrich);
      }

      if (wellnessData.status === 'fulfilled') setWellness(wellness);
      if (activitiesData.status === 'fulfilled') setActivities(dedupedActivities);
      if (athleteData.status === 'fulfilled') setAthlete(normalizeAthleteProfile(athleteData.value || null));
      if (eventsData.status === 'fulfilled') setEvents(eventsData.value || []);

      // Build training journal for LLM memory
      await buildJournal(wellness, dedupedActivities);

      // Cache for offline use
      if (wellness.length) await persistence.cacheData('wellness', wellness, 30);
      if (dedupedActivities.length) await persistence.cacheData('activities', dedupedActivities, 30);
      await persistence.savePref('last-sync-meta', {
        mode,
        syncDays,
        syncedAt: new Date().toISOString(),
        activityCount: dedupedActivities.length,
      });

    } catch (err) {
      setError(err.message);
      // Try loading from cache
      const cachedWellness = await persistence.getCachedData('wellness');
      const cachedActivities = await persistence.getCachedData('activities');
      if (cachedWellness) setWellness(cachedWellness);
      if (cachedActivities) setActivities(cachedActivities);
    } finally {
      setLoading(false);
    }
  }, [deduplicateActivities, normalizeActivities, buildJournal, enrichActivitiesProgressive]);

  useEffect(() => {
    if (!connections.intervals) return;

    fetchData({ mode: 'incremental' });

    // Keep dashboard and activities in sync with newly uploaded rides in Intervals.
    const pollId = setInterval(() => {
      fetchData({ mode: 'incremental' });
    }, 120000);

    const onFocus = () => fetchData({ mode: 'incremental' });
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(pollId);
      window.removeEventListener('focus', onFocus);
    };
  }, [connections.intervals, fetchData]);

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

    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);
    const startDay = startDate.toISOString().split('T')[0];

    const prompt = [
      'Build a realistic training micro-cycle as strict JSON array only.',
      `Generate ${days} planned sessions starting ${startDay}.`,
      'Return ONLY valid JSON. No markdown.',
      'Each item keys: date (YYYY-MM-DD), title, type, kind (training|objective|race), notes.',
      objective ? `Primary objective: ${objective}.` : 'Primary objective: improve aerobic fitness and consistency.',
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

      return {
        id: `local_ai_${Date.now()}_${idx}`,
        source: 'ai',
        planned: true,
        name: item?.title || `AI Session ${idx + 1}`,
        title: item?.title || `AI Session ${idx + 1}`,
        type: item?.type || 'Workout',
        event_type: item?.type || 'Workout',
        kind,
        start_date_local: `${dateKey}T07:00:00`,
        notes: item?.notes || '',
      };
    });

    const current = await persistence.getPlannedEvents();
    const next = [...(current || []), ...generated];
    await persistence.savePlannedEvents(next);
    setPlannedEvents(next);
    return generated;
  }, [llmProvider, groqApiKey, claudeApiKey]);

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
      await persistence.saveCredentials('strava', creds);
    } else if (provider === 'claude') {
      aiCoachService.configure(creds.apiKey || null);
      setClaudeApiKey(creds.apiKey || null);
    } else if (provider === 'groq') {
      aiCoachService.configureGroq(creds.apiKey || null);
      setGroqApiKey(creds.apiKey || null);
    } else if (provider === 'llm-provider') {
      aiCoachService.setProvider(creds.provider);
      setLlmProvider(creds.provider);
      await persistence.saveLlmProvider(creds.provider);
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
    }
  };

  const renderView = () => {
    if (!connections.intervals && view !== VIEWS.SETTINGS) {
      return (
        <div className="loading-state">
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: 'var(--accent-cyan)', letterSpacing: '0.1em', marginBottom: 16 }}>&gt;&gt;</div>
          <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>Connect to Intervals.icu to get started</p>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20, maxWidth: 400, textAlign: 'center' }}>
            Coach Center uses Intervals.icu as the primary data source.
            Your Garmin Connect data also flows through this connection.
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
          <div>
            <div className="page-header">
              <div className="page-title">Workout Builder</div>
              <div className="page-subtitle">Build structured sessions with zones, blocks, and save directly to calendar</div>
            </div>
            <WorkoutBuilder
              onCreate={handleAddPlannedEvent}
              onSaveToLibrary={handleSaveWorkoutToLibrary}
              onGenerateWithAi={handleGenerateAiWorkoutTemplate}
              ftp={athlete?.icu_ftp || athlete?.ftp || athlete?.ftp_watts || athlete?.critical_power || athlete?.zones?.ftp || null}
            />
          </div>
        );
      case VIEWS.ATHLETE_PROFILE:
        return <AthleteProfile wellness={wellness} athlete={athlete} events={events} activities={activities} />;
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
            />
          </div>
        );
      case VIEWS.DASHBOARD:
        return <Dashboard wellness={wellness} activities={activities} athlete={athlete} loading={loading} error={error} />;
      case VIEWS.PMC:
        return <PMCChart wellness={wellness} loading={loading} />;
      case VIEWS.ACTIVITIES:
        return <Activities activities={activities} loading={loading} />;
      case VIEWS.WEEKLY:
        return <WeeklyLoad activities={activities} loading={loading} />;
      case VIEWS.CALENDAR:
        return (
          <Calendar
            events={events}
            plannedEvents={plannedEvents}
            athlete={athlete}
            loading={loading}
            onAddPlannedEvent={handleAddPlannedEvent}
            onRemovePlannedEvent={handleRemovePlannedEvent}
            onGenerateAiWorkouts={handleGenerateAiWorkouts}
            onSaveWorkoutToLibrary={handleSaveWorkoutToLibrary}
            onGenerateAiWorkoutTemplate={handleGenerateAiWorkoutTemplate}
            workoutLibrary={[...LIBRARY_WORKOUTS, ...customWorkoutLibrary]}
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
          <div className="sidebar-logo">Coach<span>Center</span></div>
          <div className="sidebar-version">v0.2.0 — APEX coach</div>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-section-label">Coach</div>
          <button className={`nav-item${view === VIEWS.COACH ? ' active coach-nav-active' : ''}`} onClick={() => setView(VIEWS.COACH)}>
            <span className="nav-icon nav-icon-text">&gt;&gt;</span><span>APEX Coach</span>
          </button>
          <button className={`nav-item ${view === VIEWS.ATHLETE_PROFILE ? 'active' : ''}`} onClick={() => setView(VIEWS.ATHLETE_PROFILE)}>
            <span className="nav-icon nav-icon-text">◌</span><span>Athlete Profile</span>
          </button>
          <button className={`nav-item ${view === VIEWS.WORKOUT_BUILDER ? 'active' : ''}`} onClick={() => setView(VIEWS.WORKOUT_BUILDER)}>
            <span className="nav-icon nav-icon-text">▣</span><span>Workout Builder</span>
          </button>
          <button className={`nav-item ${view === VIEWS.GPX_BUILDER ? 'active' : ''}`} onClick={() => setView(VIEWS.GPX_BUILDER)}>
            <span className="nav-icon nav-icon-text">◉</span><span>GPX Route Builder</span>
          </button>

          <div className="nav-section-label">Analysis</div>
          <button className={`nav-item ${view === VIEWS.DASHBOARD ? 'active' : ''}`} onClick={() => setView(VIEWS.DASHBOARD)}>
            <span className="nav-icon nav-icon-text">◈</span><span>Dashboard</span>
          </button>
          <button className={`nav-item ${view === VIEWS.PMC ? 'active' : ''}`} onClick={() => setView(VIEWS.PMC)}>
            <span className="nav-icon nav-icon-text">△</span><span>PMC / Form</span>
          </button>
          <button className={`nav-item ${view === VIEWS.ACTIVITIES ? 'active' : ''}`} onClick={() => setView(VIEWS.ACTIVITIES)}>
            <span className="nav-icon nav-icon-text">≡</span><span>Activities</span>
          </button>
          <button className={`nav-item ${view === VIEWS.WEEKLY ? 'active' : ''}`} onClick={() => setView(VIEWS.WEEKLY)}>
            <span className="nav-icon nav-icon-text">▦</span><span>Weekly Load</span>
          </button>
          <button className={`nav-item ${view === VIEWS.CALENDAR ? 'active' : ''}`} onClick={() => setView(VIEWS.CALENDAR)}>
            <span className="nav-icon nav-icon-text">◷</span><span>Calendar</span>
          </button>

          <div className="nav-section-label">System</div>
          <button className={`nav-item ${view === VIEWS.SETTINGS ? 'active' : ''}`} onClick={() => setView(VIEWS.SETTINGS)}>
            <span className="nav-icon nav-icon-text">◎</span><span>Settings</span>
          </button>

          <div className="nav-section-label">Connections</div>
          <div className="nav-item" style={{ cursor: 'default', opacity: 0.7 }}>
            <span className="conn-dot" style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', background: connections.intervals ? 'var(--accent-green)' : 'var(--text-3)' }}></span>
            <span style={{ fontSize: 11 }}>Intervals.icu</span>
          </div>
          <div className="nav-item" style={{ cursor: 'default', opacity: 0.7 }}>
            <span className="conn-dot" style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', background: connections.strava ? 'var(--accent-green)' : 'var(--text-3)' }}></span>
            <span style={{ fontSize: 11 }}>Strava</span>
          </div>
          <div className="nav-item" style={{ cursor: 'default', opacity: 0.7 }}>
            <span className="conn-dot" style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', background: connections.garmin ? 'var(--accent-yellow)' : 'var(--text-3)' }}></span>
            <span style={{ fontSize: 11 }}>Garmin (via I.icu)</span>
          </div>
        </nav>
      </aside>

      <main className={`main-content${view === VIEWS.COACH ? ' coach-active' : ''}`}>
        {error && view !== VIEWS.COACH && <div className="error-banner"><span className="error-tag">[ERR]</span> {error}</div>}
        {renderView()}
      </main>
    </div>
  );
}
