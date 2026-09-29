import React, { useEffect, useState } from 'react';
import { backendService } from '../services/backend-api';
import persistence from '../services/persistence';
import { widgetFeedUrl } from '../services/widgetSnapshot';
import { buildScriptableWidget } from '../data/scriptableWidget';

const box = {
  background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10,
  padding: '12px 14px', fontSize: 13, color: 'var(--text-1)', lineHeight: 1.7, marginBottom: 12,
};

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function WidgetSettings() {
  const signedIn = backendService.isAuthenticated();
  const [info, setInfo] = useState(null);
  const [status, setStatus] = useState(null);
  const [server, setServer] = useState(null);
  const [serverBusy, setServerBusy] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
    backendService.getWidgetToken().then(setInfo).catch(err => setStatus(`Erreur : ${err.message}`));
    backendService.getServerRefresh().then(setServer).catch(() => setServer({ enabled: false }));
  }, [signedIn]);

  const toggleServer = async () => {
    setServerBusy(true);
    try {
      if (server?.enabled) {
        setServer(await backendService.disableServerRefresh());
        flash('Mise à jour serveur désactivée, clé supprimée du serveur.');
      } else {
        const creds = await persistence.getCredentials('intervals');
        if (!creds?.athleteId || !creds?.apiKey) throw new Error('Configure Intervals.icu plus haut d’abord.');
        await backendService.enableServerRefresh(creds.athleteId, creds.apiKey);
        setServer(await backendService.getServerRefresh());
        setInfo(await backendService.getWidgetToken());
        flash('Activé — widget recalculé à l’instant.');
      }
    } catch (err) {
      flash(`Erreur : ${err.message}`);
    } finally {
      setServerBusy(false);
    }
  };

  const feed = info?.token ? widgetFeedUrl(info.token) : null;
  const script = feed ? buildScriptableWidget(feed, window.location.origin) : '';
  const gnomeCmd = feed ? `bash widgets/gnome-shell/install.sh '${feed}' '${window.location.origin}'` : '';

  const flash = (text) => { setStatus(text); setTimeout(() => setStatus(null), 3000); };

  const rotate = async () => {
    if (!window.confirm('Générer un nouveau lien ? Le widget actuel cessera de fonctionner jusqu’à ce que tu recolles le script.')) return;
    try {
      const { token } = await backendService.rotateWidgetToken();
      setInfo(i => ({ ...i, token }));
      try { localStorage.removeItem('coach_widget_last'); } catch { /* ignore */ }
      flash('Nouveau lien généré — recopie le script dans Scriptable.');
    } catch (err) {
      flash(`Erreur : ${err.message}`);
    }
  };

  return (
    <div className="settings-section">
      <div className="settings-section-title">Widget iPhone &amp; app installée</div>
      <div className="settings-section-desc">
        La séance du jour (adaptée à tes données) sur l’écran d’accueil, l’écran verrouillé ou la barre GNOME.
        L’app envoie un résumé à chaque ouverture, le serveur le recalcule chaque matin ; les widgets le relisent toutes les ~30 min.
      </div>

      <div style={box}>
        <strong>1. Installer l’app</strong><br />
        iPhone : ouvre ce site dans Safari → Partager → <em>Sur l’écran d’accueil</em>.<br />
        Ordinateur : Chrome/Edge → icône d’installation dans la barre d’adresse.
      </div>

      {!signedIn ? (
        <div style={box}>Connecte-toi à ton compte Coach Center pour activer le widget.</div>
      ) : !info ? (
        <div style={box}>{status || 'Chargement…'}</div>
      ) : (
        <>
          <div style={box}>
            <strong>2. Widget écran d’accueil (app gratuite Scriptable)</strong><br />
            a. Installe <em>Scriptable</em> depuis l’App Store.<br />
            b. Copie le script ci-dessous → Scriptable → <em>+</em> → colle → nomme-le « Coach Center ».<br />
            c. Appui long sur l’écran d’accueil → <em>+</em> → Scriptable → taille petite, moyenne ou grande →
            touche le widget → <em>Script</em> : Coach Center.<br />
            d. Écran verrouillé : même chose avec un widget Scriptable rectangulaire, rond ou en ligne.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <button className="btn btn-primary" onClick={async () => flash(await copy(script) ? 'Script copié' : 'Copie impossible — sélectionne le texte')}>
              Copier le script
            </button>
            <button className="btn" onClick={async () => flash(await copy(feed) ? 'Lien copié' : 'Copie impossible')}>
              Copier le lien du flux
            </button>
            <button className="btn btn-danger" onClick={rotate}>Nouveau lien</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {info.hasData && info.updatedAt
              ? `Dernier envoi : ${new Date(info.updatedAt).toLocaleString('fr-FR')}`
              : 'Aucun envoi encore — ouvre la page Aujourd’hui.'}
            {' · '}Le lien donne accès en lecture à ta séance du jour : ne le partage pas.
          </div>
          <div style={{ ...box, marginTop: 12 }}>
            <strong>Linux (GNOME)</strong> — séance du jour dans la barre du haut. Depuis le dossier du projet :
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 11, margin: '6px 0', fontFamily: 'var(--font-mono)' }}>{gnomeCmd}</pre>
            <button className="btn" onClick={async () => flash(await copy(gnomeCmd) ? 'Commande copiée' : 'Copie impossible')}>Copier la commande</button>
          </div>
          <div style={{ ...box, marginTop: 12 }}>
            <strong>3. Mise à jour chaque matin (sans ouvrir l’app)</strong><br />
            Le serveur relit Intervals.icu tôt le matin (deux passages, ~6 h 30 et ~8 h 30 l’été) et recalcule ta séance (forme, VFC, charge, cycle).
            Ça demande de garder ta clé API Intervals.icu sur le serveur, chiffrée (AES-256-GCM). Tu peux la retirer à tout moment.
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
              <button className={server?.enabled ? 'btn btn-danger' : 'btn btn-primary'} onClick={toggleServer} disabled={serverBusy || !server}>
                {serverBusy ? '…' : server?.enabled ? 'Désactiver' : 'Activer'}
              </button>
              {server?.enabled && (
                <span style={{ fontSize: 12, color: server.lastStatus === 'error' ? 'var(--accent-red)' : 'var(--text-3)' }}>
                  {server.lastRunAt ? `Dernier calcul : ${new Date(server.lastRunAt).toLocaleString('fr-FR')}` : 'Pas encore lancé'}
                  {server.lastStatus === 'error' && server.lastError ? ` — ${server.lastError}` : ''}
                </span>
              )}
            </div>
          </div>
          {status && <div style={{ fontSize: 12, color: 'var(--accent-orange)', marginTop: 6 }}>{status}</div>}
        </>
      )}
    </div>
  );
}
