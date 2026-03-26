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
import './styles/app.css';

const VIEWS = {
  COACH: 'coach',
  DASHBOARD: 'dashboard',
  PMC: 'pmc',
  ACTIVITIES: 'activities',
  WEEKLY: 'weekly',
  SETTINGS: 'settings',
};

export default function App() {
  const [view, setView] = useState(VIEWS.COACH);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Data state
  const [wellness, setWellness] = useState([]);
  const [activities, setActivities] = useState([]);
  const [athlete, setAthlete] = useState(null);
  const [events, setEvents] = useState([]);

  // Claude API key
  const [claudeApiKey, setClaudeApiKey] = useState(null);

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
    const scope = params.get('scope');
    if (code && scope?.includes('activity:read')) {
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

  // Fetch data when Intervals.icu is connected
  const fetchData = useCallback(async () => {
    if (!intervalsService.isConfigured()) return;

    setLoading(true);
    setError(null);

    try {
      const now = new Date();
      const ninetyDaysAgo = new Date(now);
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const oldest = ninetyDaysAgo.toISOString().split('T')[0];
      const newest = now.toISOString().split('T')[0];

      const [wellnessData, activitiesData, athleteData, eventsData] = await Promise.allSettled([
        intervalsService.getWellness(oldest, newest),
        intervalsService.getActivities(oldest, newest),
        intervalsService.getAthlete(),
        intervalsService.getEvents(oldest, newest),
      ]);

      if (wellnessData.status === 'fulfilled') setWellness(wellnessData.value || []);
      if (activitiesData.status === 'fulfilled') setActivities(activitiesData.value || []);
      if (athleteData.status === 'fulfilled') setAthlete(athleteData.value || null);
      if (eventsData.status === 'fulfilled') setEvents(eventsData.value || []);

      // Cache for offline use
      if (wellnessData.status === 'fulfilled') {
        await persistence.cacheData('wellness', wellnessData.value, 30);
      }
      if (activitiesData.status === 'fulfilled') {
        await persistence.cacheData('activities', activitiesData.value, 30);
      }

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
  }, []);

  useEffect(() => {
    if (connections.intervals) {
      fetchData();
    }
  }, [connections.intervals, fetchData]);

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
          <div style={{ fontSize: 32, marginBottom: 16 }}>⚡</div>
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
            claudeApiKey={claudeApiKey}
            onNeedApiKey={() => setView(VIEWS.SETTINGS)}
          />
        );
      case VIEWS.DASHBOARD:
        return <Dashboard wellness={wellness} activities={activities} athlete={athlete} loading={loading} error={error} />;
      case VIEWS.PMC:
        return <PMCChart wellness={wellness} loading={loading} />;
      case VIEWS.ACTIVITIES:
        return <Activities activities={activities} loading={loading} />;
      case VIEWS.WEEKLY:
        return <WeeklyLoad activities={activities} loading={loading} />;
      case VIEWS.SETTINGS:
        return (
          <Settings
            connections={connections}
            onSave={handleSaveSettings}
            onDisconnect={handleDisconnect}
            onRefresh={fetchData}
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
            <span className="nav-icon">⚡</span><span>APEX Coach</span>
          </button>

          <div className="nav-section-label">Analysis</div>
          <button className={`nav-item ${view === VIEWS.DASHBOARD ? 'active' : ''}`} onClick={() => setView(VIEWS.DASHBOARD)}>
            <span className="nav-icon">◈</span><span>Dashboard</span>
          </button>
          <button className={`nav-item ${view === VIEWS.PMC ? 'active' : ''}`} onClick={() => setView(VIEWS.PMC)}>
            <span className="nav-icon">📈</span><span>PMC / Form</span>
          </button>
          <button className={`nav-item ${view === VIEWS.ACTIVITIES ? 'active' : ''}`} onClick={() => setView(VIEWS.ACTIVITIES)}>
            <span className="nav-icon">🚴</span><span>Activities</span>
          </button>
          <button className={`nav-item ${view === VIEWS.WEEKLY ? 'active' : ''}`} onClick={() => setView(VIEWS.WEEKLY)}>
            <span className="nav-icon">📊</span><span>Weekly Load</span>
          </button>

          <div className="nav-section-label">System</div>
          <button className={`nav-item ${view === VIEWS.SETTINGS ? 'active' : ''}`} onClick={() => setView(VIEWS.SETTINGS)}>
            <span className="nav-icon">⚙</span><span>Settings</span>
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
        {error && view !== VIEWS.COACH && <div className="error-banner">⚠ {error}</div>}
        {renderView()}
      </main>
    </div>
  );
}
