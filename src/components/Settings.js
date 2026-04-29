import React, { useState, useEffect } from 'react';
import persistence from '../services/persistence';
import { garminService } from '../services/garmin';
import { backendService } from '../services/backend-api';

export default function Settings({ connections, onSave, onDisconnect, onRefresh, onRepairHistory }) {
  const [intAthleteId, setIntAthleteId] = useState('');
  const [intApiKey, setIntApiKey]       = useState('');
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [groqApiKey, setGroqApiKey]     = useState('');
  const [llmProvider, setLlmProvider]   = useState('claude');
  const [mapTilerKey, setMapTilerKey]   = useState('');
  const [saving, setSaving]             = useState(false);
  const [message, setMessage]           = useState(null);

  useEffect(() => {
    (async () => {
      const intCreds = await persistence.getCredentials('intervals');
      if (intCreds) {
        setIntAthleteId(intCreds.athleteId || '');
        setIntApiKey(intCreds.apiKey || '');
      } else {
        setIntAthleteId(process.env.REACT_APP_ICU_ATHLETE_ID || '');
        setIntApiKey(process.env.REACT_APP_ICU_API_KEY || '');
      }
      const claudeKey = await persistence.getClaudeApiKey();
      if (claudeKey) setClaudeApiKey(claudeKey);
      const groqKey = await persistence.getGroqApiKey();
      if (groqKey) setGroqApiKey(groqKey);
      const provider = await persistence.getLlmProvider();
      setLlmProvider(provider || 'claude');
      const mtKey = await persistence.getPref('maptiler-key', '');
      if (mtKey) setMapTilerKey(mtKey);
    })();
  }, []);

  const showMessage = (text, isError = false) => {
    setMessage({ text, isError });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleSaveIntervals = async () => {
    if (!intAthleteId.trim() || !intApiKey.trim()) {
      showMessage('Athlete ID et clé API requis.', true);
      return;
    }
    setSaving(true);
    try {
      await onSave('intervals', { athleteId: intAthleteId.trim(), apiKey: intApiKey.trim() });
      showMessage('Intervals.icu connecté. Récupération des données…');
      setTimeout(() => onRefresh({ mode: 'incremental' }), 500);
    } catch (err) {
      showMessage('Erreur : ' + err.message, true);
    } finally {
      setSaving(false);
    }
  };

  const handleStravaAuth = async () => {
    try {
      await backendService.startOAuthFlow('strava');
    } catch (err) {
      showMessage('Impossible de démarrer Strava OAuth : ' + err.message, true);
    }
  };

  const handleSaveClaude = async () => {
    if (!claudeApiKey.trim()) { showMessage('Clé API invalide.', true); return; }
    await persistence.saveClaudeApiKey(claudeApiKey.trim());
    onSave('claude', { apiKey: claudeApiKey.trim() });
    showMessage('Clé Claude sauvegardée. APEX est prêt.');
  };

  const handleRemoveClaude = async () => {
    await persistence.saveClaudeApiKey('');
    setClaudeApiKey('');
    onSave('claude', { apiKey: null });
    showMessage('Clé Claude supprimée.');
  };

  const handleSaveGroq = async () => {
    if (!groqApiKey.trim()) { showMessage('Clé API invalide.', true); return; }
    await persistence.saveGroqApiKey(groqApiKey.trim());
    onSave('groq', { apiKey: groqApiKey.trim() });
    showMessage('Clé Groq sauvegardée. APEX prêt (gratuit).');
  };

  const handleRemoveGroq = async () => {
    await persistence.saveGroqApiKey('');
    setGroqApiKey('');
    onSave('groq', { apiKey: null });
    showMessage('Clé Groq supprimée.');
  };

  const handleSetProvider = async (provider) => {
    setLlmProvider(provider);
    onSave('llm-provider', { provider });
    showMessage(`Fournisseur IA : ${provider === 'groq' ? 'Groq (gratuit)' : 'Claude (Anthropic)'}`);
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Paramètres</div>
        <div className="page-subtitle">Connectez vos sources de données et gérez vos préférences</div>
      </div>

      {message && (
        <div className={message.isError ? 'error-banner' : 'info-banner'}>
          {message.text}
        </div>
      )}

      {/* ═══ Intervals.icu ═══ */}
      <div className="settings-section">
        <div className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          Intervals.icu
          {connections.intervals
            ? <span style={{ color: 'var(--accent-green)', fontSize: 12, fontWeight: 500 }}>● Connecté</span>
            : <span style={{ color: 'var(--text-3)', fontSize: 12 }}>● Non connecté</span>}
        </div>
        <div className="settings-section-desc">
          Source principale de données : PMC (CTL/ATL/TSB), activités, puissance, FC et métriques wellness.
        </div>

        <div style={{
          background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.2)',
          borderRadius: 10, padding: '14px 16px', marginBottom: 16, fontSize: 13, color: 'var(--text-1)', lineHeight: 1.7,
        }}>
          <strong style={{ color: 'var(--accent-orange)' }}>Comment obtenir vos identifiants :</strong><br />
          1. Allez sur <code style={{ background: 'var(--bg-3)', padding: '1px 5px', borderRadius: 4 }}>intervals.icu/settings/api</code><br />
          2. Copiez votre <strong>Athlete ID</strong> (format <code style={{ background: 'var(--bg-3)', padding: '1px 5px', borderRadius: 4 }}>i12345</code>)<br />
          3. Cliquez sur <strong>"(view)"</strong> à côté de "Clé API" et copiez-la
        </div>

        <div className="form-field">
          <label className="form-label">Athlete ID</label>
          <input
            className="form-input"
            type="text"
            placeholder="ex : i448057"
            value={intAthleteId}
            onChange={e => setIntAthleteId(e.target.value)}
          />
        </div>

        <div className="form-field">
          <label className="form-label">Clé API</label>
          <input
            className="form-input"
            type="password"
            placeholder="Votre clé API Intervals.icu"
            value={intApiKey}
            onChange={e => setIntApiKey(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSaveIntervals()}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={handleSaveIntervals} disabled={saving}>
            {saving ? 'Connexion…' : connections.intervals ? 'Mettre à jour' : 'Connecter'}
          </button>
          {connections.intervals && (
            <>
              <button className="btn" onClick={() => onRefresh({ mode: 'incremental' })}>Actualiser</button>
              <button className="btn btn-danger" onClick={() => onDisconnect('intervals')}>Déconnecter</button>
            </>
          )}
        </div>
      </div>

      {/* ═══ Strava ═══ */}
      <div className="settings-section">
        <div className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          Strava
          {connections.strava
            ? <span style={{ color: 'var(--accent-green)', fontSize: 12, fontWeight: 500 }}>● Connecté</span>
            : <span style={{ color: 'var(--text-3)', fontSize: 12 }}>● Non connecté</span>}
        </div>
        <div className="settings-section-desc">
          Optionnel. Activités, segments et efforts. Connexion via OAuth — cliquez le bouton ci-dessous.
        </div>

        {!connections.strava ? (
          <button
            className="btn btn-primary"
            onClick={handleStravaAuth}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/>
            </svg>
            Se connecter avec Strava
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
              background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
              borderRadius: 8, fontSize: 13, color: 'var(--accent-green)',
            }}>
              ✓ Compte Strava connecté
            </div>
            <button className="btn btn-danger" onClick={() => onDisconnect('strava')}>Déconnecter</button>
          </div>
        )}
      </div>

      {/* ═══ Garmin ═══ */}
      <div className="settings-section">
        <div className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          Garmin Connect
          {connections.garmin && <span style={{ color: 'var(--accent-yellow)', fontSize: 12 }}>● Via Intervals.icu</span>}
        </div>
        <div className="settings-section-desc">
          {garminService.getStatusMessage()}
        </div>
        <div style={{
          background: 'var(--bg-2)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '14px 16px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7,
        }}>
          <strong style={{ color: 'var(--text-1)' }}>Intégration via Intervals.icu :</strong><br />
          1. Dans <strong>Intervals.icu → Paramètres</strong>, liez votre compte Garmin Connect<br />
          2. Les activités, FC, sommeil et HRV se synchronisent automatiquement<br />
          3. Coach Center lit ces données via l'API Intervals.icu
        </div>
      </div>

      {/* ═══ AI Coach ═══ */}
      <div className="settings-section">
        <div className="settings-section-title">Coach IA — APEX</div>
        <div className="settings-section-desc">
          Choisissez votre fournisseur IA. Groq est gratuit. Claude offre une meilleure qualité de coaching.
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <button className={`btn ${llmProvider === 'groq' ? 'btn-primary' : ''}`} onClick={() => handleSetProvider('groq')}>
            Groq — Gratuit
          </button>
          <button className={`btn ${llmProvider === 'claude' ? 'btn-primary' : ''}`} onClick={() => handleSetProvider('claude')}>
            Claude — Payant
          </button>
        </div>

        {llmProvider === 'groq' && (
          <>
            <div className="info-banner">
              <strong>Groq (gratuit)</strong> — modèle llama-3.3-70b, 14 400 requêtes/jour.<br />
              1. Inscrivez-vous sur <code>console.groq.com</code> → API Keys<br />
              2. Copiez votre clé (commence par <code>gsk_</code>)
            </div>
            <div className="form-field">
              <label className="form-label">
                Clé API Groq
                {groqApiKey && <span style={{ color: 'var(--accent-green)', marginLeft: 8 }}>● Configurée</span>}
              </label>
              <input className="form-input" type="password" placeholder="gsk_..."
                value={groqApiKey} onChange={e => setGroqApiKey(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveGroq()} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={handleSaveGroq}>{groqApiKey ? 'Mettre à jour' : 'Sauvegarder'}</button>
              {groqApiKey && <button className="btn btn-danger" onClick={handleRemoveGroq}>Supprimer</button>}
            </div>
          </>
        )}

        {llmProvider === 'claude' && (
          <>
            <div className="info-banner">
              <strong>Anthropic Claude</strong> — claude-sonnet-4, meilleure qualité de coaching.<br />
              1. Allez sur <code>console.anthropic.com</code> → API Keys<br />
              2. Copiez votre clé (commence par <code>sk-ant-</code>)
            </div>
            <div className="form-field">
              <label className="form-label">
                Clé API Anthropic
                {claudeApiKey && <span style={{ color: 'var(--accent-green)', marginLeft: 8 }}>● Configurée</span>}
              </label>
              <input className="form-input" type="password" placeholder="sk-ant-..."
                value={claudeApiKey} onChange={e => setClaudeApiKey(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveClaude()} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={handleSaveClaude}>{claudeApiKey ? 'Mettre à jour' : 'Sauvegarder'}</button>
              {claudeApiKey && <button className="btn btn-danger" onClick={handleRemoveClaude}>Supprimer</button>}
            </div>
          </>
        )}
      </div>

      {/* ═══ Map Tiles ═══ */}
      <div className="settings-section">
        <div className="settings-section-title">Tuiles cartographiques</div>
        <div className="settings-section-desc">
          Sans clé, les routes utilisent Esri World Topo (gratuit). Ajoutez une clé MapTiler pour le style Komoot/Strava.
          Gratuit jusqu'à 100 000 tuiles/mois sur <code>cloud.maptiler.com</code>.
        </div>
        <div className="form-field">
          <label className="form-label">
            Clé API MapTiler
            {mapTilerKey && <span style={{ color: 'var(--accent-green)', marginLeft: 8 }}>● Configurée</span>}
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input" type="password" placeholder="Collez votre clé MapTiler…"
              value={mapTilerKey} onChange={e => setMapTilerKey(e.target.value)} style={{ flex: 1 }} />
            <button className="btn btn-primary" onClick={async () => {
              await persistence.savePref('maptiler-key', mapTilerKey.trim());
              onSave('maptiler', { key: mapTilerKey.trim() });
              showMessage('Clé sauvegardée. Rechargez le constructeur de routes.');
            }}>{mapTilerKey ? 'Mettre à jour' : 'Sauvegarder'}</button>
            {mapTilerKey && (
              <button className="btn" onClick={async () => {
                await persistence.savePref('maptiler-key', '');
                setMapTilerKey('');
                onSave('maptiler', { key: '' });
                showMessage('Clé supprimée.');
              }}>Effacer</button>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Gestion des données ═══ */}
      <div className="settings-section">
        <div className="settings-section-title">Gestion des données</div>
        <div className="settings-section-desc">
          Toutes les données sont stockées localement dans votre navigateur (IndexedDB).
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {connections.intervals && (
            <button className="btn btn-primary" onClick={onRepairHistory}>Réparer l'historique</button>
          )}
          <button className="btn" onClick={async () => {
            await persistence.clearCache();
            showMessage('Cache vidé. Les données seront rechargées.');
          }}>Vider le cache</button>
          <button className="btn btn-danger" onClick={async () => {
            if (window.confirm('Supprimer tous les identifiants et données ? Cette action est irréversible.')) {
              await persistence.clearCredentials('intervals');
              await persistence.clearCredentials('strava');
              await persistence.clearCache();
              window.location.reload();
            }
          }}>Réinitialiser</button>
        </div>
      </div>
    </div>
  );
}
