import React, { useState, useEffect } from 'react';
import persistence from '../services/persistence';
import { stravaService } from '../services/strava';
import { garminService } from '../services/garmin';

export default function Settings({ connections, onSave, onDisconnect, onRefresh }) {
  // Intervals.icu
  const [intAthleteId, setIntAthleteId] = useState('');
  const [intApiKey, setIntApiKey] = useState('');

  // Strava
  const [stravaClientId, setStravaClientId] = useState('');
  const [stravaClientSecret, setStravaClientSecret] = useState('');

  // Claude AI
  const [claudeApiKey, setClaudeApiKey] = useState('');

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  // Load saved credentials
  useEffect(() => {
    (async () => {
      const intCreds = await persistence.getCredentials('intervals');
      if (intCreds) {
        setIntAthleteId(intCreds.athleteId || '');
        setIntApiKey(intCreds.apiKey || '');
      }
      const stravaCreds = await persistence.getCredentials('strava');
      if (stravaCreds) {
        setStravaClientId(stravaCreds.clientId || '');
        setStravaClientSecret(stravaCreds.clientSecret || '');
      }
      const claudeKey = await persistence.getClaudeApiKey();
      if (claudeKey) setClaudeApiKey(claudeKey);
    })();
  }, []);

  const showMessage = (text, isError = false) => {
    setMessage({ text, isError });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleSaveIntervals = async () => {
    if (!intAthleteId.trim() || !intApiKey.trim()) {
      showMessage('Please enter both Athlete ID and API Key.', true);
      return;
    }
    setSaving(true);
    try {
      await onSave('intervals', { athleteId: intAthleteId.trim(), apiKey: intApiKey.trim() });
      showMessage('Intervals.icu connected. Fetching data...');
      setTimeout(() => onRefresh(), 500);
    } catch (err) {
      showMessage('Failed to save: ' + err.message, true);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveStrava = async () => {
    if (!stravaClientId.trim() || !stravaClientSecret.trim()) {
      showMessage('Please enter both Client ID and Client Secret.', true);
      return;
    }
    await onSave('strava', { clientId: stravaClientId.trim(), clientSecret: stravaClientSecret.trim() });
    showMessage('Strava credentials saved. Click "Connect Strava" to authorize.');
  };

  const handleSaveClaude = async () => {
    if (!claudeApiKey.trim()) {
      showMessage('Enter a valid Anthropic API key.', true);
      return;
    }
    await persistence.saveClaudeApiKey(claudeApiKey.trim());
    onSave('claude', { apiKey: claudeApiKey.trim() });
    showMessage('Claude API key saved. APEX is ready.');
  };

  const handleRemoveClaude = async () => {
    await persistence.saveClaudeApiKey('');
    setClaudeApiKey('');
    onSave('claude', { apiKey: null });
    showMessage('Claude API key removed.');
  };

  const handleStravaAuth = () => {
    if (!stravaService.hasCredentials()) {
      showMessage('Save your Strava Client ID and Secret first.', true);
      return;
    }
    const redirectUri = window.location.origin + window.location.pathname;
    window.location.href = stravaService.getAuthUrl(redirectUri);
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Settings</div>
        <div className="page-subtitle">Manage data connections and preferences</div>
      </div>

      {message && (
        <div className={message.isError ? 'error-banner' : 'info-banner'}>
          {message.text}
        </div>
      )}

      {/* ═══ Intervals.icu ═══ */}
      <div className="settings-section">
        <div className="settings-section-title">
          Intervals.icu
          {connections.intervals && <span style={{ color: 'var(--accent-green)', fontSize: 12, marginLeft: 8 }}>● Connected</span>}
        </div>
        <div className="settings-section-desc">
          Primary data source. Provides PMC metrics (CTL/ATL/TSB), activities with power/HR data, 
          and wellness metrics. Also receives Garmin Connect data when linked.
        </div>

        <div className="info-banner">
          <strong>How to get your credentials:</strong><br />
          1. Go to <code>intervals.icu/settings</code><br />
          2. Scroll to "Developer Settings" near the bottom<br />
          3. Copy your <strong>Athlete ID</strong> (the number in your URL, e.g., <code>i12345</code>)<br />
          4. Generate an <strong>API Key</strong> and copy it
        </div>

        <div className="form-field">
          <label className="form-label">Athlete ID</label>
          <input
            className="form-input"
            type="text"
            placeholder="e.g., i12345"
            value={intAthleteId}
            onChange={e => setIntAthleteId(e.target.value)}
          />
        </div>

        <div className="form-field">
          <label className="form-label">API Key</label>
          <input
            className="form-input"
            type="password"
            placeholder="Your Intervals.icu API key"
            value={intApiKey}
            onChange={e => setIntApiKey(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={handleSaveIntervals} disabled={saving}>
            {saving ? 'Saving...' : connections.intervals ? 'Update Connection' : 'Connect'}
          </button>
          {connections.intervals && (
            <>
              <button className="btn" onClick={onRefresh}>Refresh Data</button>
              <button className="btn btn-danger" onClick={() => onDisconnect('intervals')}>Disconnect</button>
            </>
          )}
        </div>
      </div>

      {/* ═══ Strava ═══ */}
      <div className="settings-section">
        <div className="settings-section-title">
          Strava
          {connections.strava && <span style={{ color: 'var(--accent-green)', fontSize: 12, marginLeft: 8 }}>● Connected</span>}
        </div>
        <div className="settings-section-desc">
          Optional. Provides activity data including segment efforts and social features.
          Strava uses OAuth — you need to create an API application first.
        </div>

        <div className="info-banner">
          <strong>Setup (one-time):</strong><br />
          1. Go to <code>strava.com/settings/api</code><br />
          2. Create an application (any name, any website)<br />
          3. Set <strong>Authorization Callback Domain</strong> to: <code>{window.location.hostname}</code><br />
          4. Copy <strong>Client ID</strong> and <strong>Client Secret</strong><br />
          5. Save here, then click "Connect Strava" to authorize
        </div>

        <div className="form-field">
          <label className="form-label">Client ID</label>
          <input
            className="form-input"
            type="text"
            placeholder="Your Strava API Client ID"
            value={stravaClientId}
            onChange={e => setStravaClientId(e.target.value)}
          />
        </div>

        <div className="form-field">
          <label className="form-label">Client Secret</label>
          <input
            className="form-input"
            type="password"
            placeholder="Your Strava API Client Secret"
            value={stravaClientSecret}
            onChange={e => setStravaClientSecret(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={handleSaveStrava}>Save Credentials</button>
          {!connections.strava && stravaClientId && (
            <button className="btn btn-primary" onClick={handleStravaAuth}>Connect Strava →</button>
          )}
          {connections.strava && (
            <button className="btn btn-danger" onClick={() => onDisconnect('strava')}>Disconnect</button>
          )}
        </div>
      </div>

      {/* ═══ Garmin Connect ═══ */}
      <div className="settings-section">
        <div className="settings-section-title">
          Garmin Connect
          {connections.garmin && <span style={{ color: 'var(--accent-yellow)', fontSize: 12, marginLeft: 8 }}>● Via Intervals.icu</span>}
        </div>
        <div className="settings-section-desc">
          {garminService.getStatusMessage()}
        </div>

        <div className="info-banner">
          <strong>How Garmin integration works:</strong><br />
          Garmin's official API requires server-side OAuth and business approval — it's not compatible 
          with a static GitHub Pages app. Instead, Coach Center receives your Garmin data through Intervals.icu:<br /><br />
          1. In <strong>Intervals.icu Settings</strong>, link your Garmin Connect account<br />
          2. Activities, HR, sleep, steps, and wellness data sync automatically<br />
          3. Coach Center reads this data via the Intervals.icu API<br /><br />
          This is the most reliable path. All Garmin-sourced metrics (RHR, sleep, body weight, HRV) 
          appear in the Wellness and Dashboard views.
        </div>

        <div className="conn-status">
          <span className="conn-dot" style={{ background: connections.garmin ? 'var(--accent-yellow)' : 'var(--text-3)' }}></span>
          <span className="conn-label">
            {connections.garmin
              ? <><strong>Bridged</strong> — Garmin data flows through Intervals.icu</>
              : <><strong>Not available</strong> — Connect Intervals.icu first</>
            }
          </span>
        </div>
      </div>

      {/* ═══ Claude AI Coach ═══ */}
      <div className="settings-section">
        <div className="settings-section-title">
          Claude AI Coach (APEX)
          {claudeApiKey && <span style={{ color: 'var(--accent-green)', fontSize: 12, marginLeft: 8 }}>● Configured</span>}
        </div>
        <div className="settings-section-desc">
          APEX uses the Anthropic Claude API directly from your browser. Your key is stored
          only in this browser's local storage and is never sent to any server other than Anthropic's.
        </div>

        <div className="info-banner">
          <strong>Setup:</strong><br />
          1. Go to <code>console.anthropic.com</code> → API Keys → Create Key<br />
          2. Paste your key below (starts with <code>sk-ant-</code>)<br />
          3. Usage is billed to your Anthropic account at standard rates<br />
          <br />
          <strong>Privacy note:</strong> your API key is visible in browser DevTools network traffic.
          Do not use this on a shared or public device.
        </div>

        <div className="form-field">
          <label className="form-label">Anthropic API Key</label>
          <input
            className="form-input"
            type="password"
            placeholder="sk-ant-..."
            value={claudeApiKey}
            onChange={e => setClaudeApiKey(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSaveClaude()}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={handleSaveClaude}>
            {claudeApiKey ? 'Update Key' : 'Save Key'}
          </button>
          {claudeApiKey && (
            <button className="btn btn-danger" onClick={handleRemoveClaude}>
              Remove Key
            </button>
          )}
        </div>
      </div>

      {/* ═══ Data Management ═══ */}
      <div className="settings-section">
        <div className="settings-section-title">Data Management</div>
        <div className="settings-section-desc">
          All data is stored locally in your browser (IndexedDB). Nothing is sent to any server beyond the 
          API calls to Intervals.icu, Strava, and (future) Claude.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={async () => {
            await persistence.clearCache();
            showMessage('Cache cleared. Data will be re-fetched on next load.');
          }}>
            Clear Cache
          </button>
          <button className="btn btn-danger" onClick={async () => {
            if (window.confirm('This will remove all saved credentials and data. Continue?')) {
              await persistence.clearCredentials('intervals');
              await persistence.clearCredentials('strava');
              await persistence.clearCache();
              window.location.reload();
            }
          }}>
            Reset Everything
          </button>
        </div>
      </div>

      {/* ═══ Architecture Note ═══ */}
      <div className="settings-section">
        <div className="settings-section-title">Module Architecture</div>
        <div className="settings-section-desc">
          Coach Center is built with a modular service layer. Each integration is a separate module 
          in <code>src/services/</code>. To add new features:
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-2)', lineHeight: 2, background: 'var(--bg-2)', padding: 16, borderRadius: 8 }}>
          <span style={{ color: 'var(--accent-cyan)' }}>src/services/</span><br />
          &nbsp;&nbsp;├── intervals.js &nbsp;&nbsp;&nbsp;{'//'} Intervals.icu API connector<br />
          &nbsp;&nbsp;├── strava.js &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{'//'} Strava OAuth + API<br />
          &nbsp;&nbsp;├── garmin.js &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{'//'} Garmin bridge + FIT parser (future)<br />
          &nbsp;&nbsp;├── analytics.js &nbsp;&nbsp;{'//'} Pre-computed metrics engine<br />
          &nbsp;&nbsp;├── persistence.js {'//'} Local storage / IndexedDB<br />
          &nbsp;&nbsp;└── ai-coach.js &nbsp;&nbsp;&nbsp;&nbsp;{'//'} APEX Claude AI coach<br />
          <br />
          <span style={{ color: 'var(--accent-cyan)' }}>src/components/</span><br />
          &nbsp;&nbsp;├── Dashboard.js &nbsp;&nbsp;{'//'} Main overview<br />
          &nbsp;&nbsp;├── PMCChart.js &nbsp;&nbsp;&nbsp;{'//'} Performance Management Chart<br />
          &nbsp;&nbsp;├── Activities.js &nbsp;{'//'} Activity list + sort/filter<br />
          &nbsp;&nbsp;├── WeeklyLoad.js &nbsp;{'//'} Weekly volume chart<br />
          &nbsp;&nbsp;├── Settings.js &nbsp;&nbsp;&nbsp;{'//'} Connection management<br />
          &nbsp;&nbsp;└── CoachChat.js &nbsp;&nbsp;{'//'} APEX AI coach interface
        </div>
      </div>
    </div>
  );
}
