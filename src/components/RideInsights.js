import React, { useMemo, useState } from 'react';
import { rideMetrics, rollingMean } from '../services/rideMetrics';
import { parsePowerCurve } from '../services/coachEngine';
import Picto from './Pictos';

const fmtTime = (secs) => {
  const h = Math.floor(secs / 3600); const m = Math.floor((secs % 3600) / 60); const s = Math.round(secs % 60);
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};
const fmtDur = (secs) => (secs >= 3600 ? `${Math.floor(secs / 3600)} h ${String(Math.floor((secs % 3600) / 60)).padStart(2, '0')}`
  : secs >= 60 ? `${Math.round(secs / 60)} min` : `${secs} s`);
const PEAK_LABEL = { 5: '5 s', 60: '1 min', 300: '5 min', 1200: '20 min' };

/** Ride settings from an Intervals.icu athlete (sportSettings) or plain fields. */
export function rideSettings(athlete) {
  const ride = (athlete?.sportSettings || []).find(s => (s.types || []).some(t => /ride/i.test(t))) || {};
  return {
    ftp: Number(athlete?.icu_ftp || athlete?.ftp || ride.ftp) || null,
    lthr: Number(ride.lthr || athlete?.lthr || athlete?.icu_lthr) || null,
    maxHr: Number(ride.max_hr || athlete?.max_hr || athlete?.icu_max_hr) || null,
    wPrime: Number(ride.w_prime || athlete?.icu_w_prime || athlete?.w_prime) || null,
    weight: Number(athlete?.icu_weight || athlete?.weight) || null,
  };
}

/* ── Chart: altitude (area), power 30 s, heart rate, intervals as bands ── */
function RideChart({ streams, intervals = [], ftp }) {
  const [hover, setHover] = useState(null);
  const W = 1000; const H = 240; const PAD = 6;
  const data = useMemo(() => {
    const n = Math.max(streams.watts?.length || 0, streams.heartrate?.length || 0, streams.altitude?.length || 0);
    if (n < 60) return null;
    const step = Math.max(1, Math.floor(n / 600));
    const p30 = streams.watts ? rollingMean(streams.watts, 30) : null;
    const pts = [];
    for (let i = 0; i < n; i += step) {
      pts.push({ i, p: p30?.[i] ?? null, h: streams.heartrate?.[i] ?? null, a: streams.altitude?.[i] ?? null });
    }
    const max = (k) => Math.max(...pts.map(x => x[k] ?? 0));
    const minA = Math.min(...pts.map(x => x.a ?? Infinity));
    return { n, pts, pMax: Math.max(max('p'), ftp ? ftp * 1.3 : 0) || 1, hMax: max('h') || 1, aMin: minA === Infinity ? 0 : minA, aMax: max('a') || 1 };
  }, [streams, ftp]);
  if (!data) return null;
  const { n, pts, pMax, hMax, aMin, aMax } = data;
  const x = (i) => (i / (n - 1)) * W;
  const yP = (v) => H - PAD - (v / pMax) * (H - 2 * PAD);
  const yH = (v) => H - PAD - ((v - hMax * 0.45) / (hMax * 0.6)) * (H - 2 * PAD);
  const yA = (v) => H - (aMax > aMin ? ((v - aMin) / (aMax - aMin)) : 0) * H * 0.55;
  const path = (k, y) => pts.filter(q => q[k] != null && q[k] > 0).map((q, j) => `${j ? 'L' : 'M'}${x(q.i).toFixed(1)} ${y(q[k]).toFixed(1)}`).join('');
  const hasAlt = pts.some(q => q.a != null);
  const area = hasAlt ? `M0 ${H} ${pts.filter(q => q.a != null).map(q => `L${x(q.i).toFixed(1)} ${yA(q.a).toFixed(1)}`).join(' ')} L${W} ${H}Z` : null;
  const hv = hover != null ? pts[Math.min(pts.length - 1, Math.round(hover * (pts.length - 1)))] : null;
  return (
    <div className="ride-chart">
      <div className="ride-chart-legend">
        {streams.watts && <span><i className="lg-power" />Puissance (30 s)</span>}
        {streams.heartrate && <span><i className="lg-hr" />Fréquence cardiaque</span>}
        {hasAlt && <span><i className="lg-alt" />Altitude</span>}
        {intervals.some(iv => iv.type === 'WORK' && iv.endIndex > iv.startIndex) && <span><i className="lg-int" />Intervalles</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Graphique de la sortie"
        onPointerMove={e => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))); }}
        onPointerLeave={() => setHover(null)}>
        {area && <path d={area} className="ride-alt" />}
        {intervals.filter(iv => iv.type === 'WORK' && iv.endIndex > iv.startIndex).map((iv, k) => (
          <rect key={k} x={x(iv.startIndex)} y={0} width={Math.max(1, x(iv.endIndex) - x(iv.startIndex))} height={H} className="ride-int" />
        ))}
        {ftp && <line x1="0" x2={W} y1={yP(ftp)} y2={yP(ftp)} className="ride-ftp" />}
        {streams.heartrate && <path d={path('h', yH)} className="ride-hr" />}
        {streams.watts && <path d={path('p', yP)} className="ride-power" />}
        {hv && <line x1={x(hv.i)} x2={x(hv.i)} y1="0" y2={H} className="ride-cursor" />}
      </svg>
      <div className="ride-readout" aria-live="polite">
        {hv ? (
          <>
            <strong>{fmtTime(hv.i)}</strong>
            {hv.p != null && <span>{Math.round(hv.p)} W</span>}
            {hv.h != null && <span>{Math.round(hv.h)} bpm</span>}
            {hv.a != null && <span>{Math.round(hv.a)} m</span>}
          </>
        ) : <span className="ride-hint">Survole le graphique pour lire les valeurs{ftp ? ' · trait pointillé = FTP' : ''}</span>}
      </div>
    </div>
  );
}

function Insight({ label, value, sub, tone }) {
  return (
    <div className={`ride-insight tone-${tone || 'default'}`}>
      <div className="ride-insight-label">{label}</div>
      <div className="ride-insight-value">{value}</div>
      {sub && <div className="ride-insight-sub">{sub}</div>}
    </div>
  );
}

function bestFromCurve(curve, secs) {
  if (!curve.length) return null;
  const near = curve.reduce((b, p) => (Math.abs(p.secs - secs) < Math.abs(b.secs - secs) ? p : b));
  return Math.abs(near.secs - secs) <= secs * 0.2 ? near.watts : null;
}

/** Everything Intervals.icu shows on an activity page that the summary above doesn't. */
export default function RideInsights({ rawStreams, intervals, athlete, activity, powerCurve }) {
  const settings = rideSettings(athlete);
  const m = useMemo(() => rideMetrics(rawStreams, {
    ...settings,
    maxHr: settings.maxHr || Number(activity?.max_heartrate) || null,
    icuHrZoneTimes: activity?.icu_hr_zone_times || null,
  }), [rawStreams, settings.ftp, settings.lthr, settings.maxHr, settings.wPrime, settings.weight, activity]);
  const season = useMemo(() => parsePowerCurve(powerCurve), [powerCurve]);
  if (!m.streams || (!m.streams.watts && !m.streams.heartrate)) return null;

  const dec = m.decoupling;
  const decTone = dec == null ? null : dec.pct < 5 ? 'green' : dec.pct < 8 ? 'yellow' : 'orange';
  const w = m.wbal;
  const wTone = w == null ? null : w.minPct < 15 ? 'orange' : w.minPct < 40 ? 'yellow' : 'green';

  return (
    <>
      <section className="ride-card">
        <h3>La sortie</h3>
        <RideChart streams={m.streams} intervals={intervals} ftp={settings.ftp} />
      </section>

      <section className="ride-card">
        <h3>Ce que dit la séance</h3>
        <div className="ride-insights">
          {dec && (
            <Insight label="Dérive cardiaque (Pw:HR)" value={`${dec.pct.toFixed(1)} %`} tone={decTone}
              sub={dec.pct < 5 ? 'Endurance solide : le cœur suit la puissance jusqu’au bout.'
                : dec.pct < 8 ? 'Légère dérive en 2e partie : chaleur, hydratation ou fond à consolider.'
                : 'Le cœur s’emballe en 2e partie à puissance égale : fond aérobie encore court sur cette durée.'} />
          )}
          {w && (
            <Insight label="Réserve anaérobie (W′)" value={`${Math.round(w.minPct)} % au plus bas`} tone={wTone}
              sub={`${(w.min / 1000).toFixed(1)} kJ sur ${(w.wPrime / 1000).toFixed(0)} kJ, à ${fmtTime(w.minAt)}${settings.wPrime ? '' : ' (W′ estimé à 20 kJ)'}.`} />
          )}
          {m.vi && (
            <Insight label="Régularité (VI)" value={m.vi.toFixed(2)}
              tone={m.vi > 1.15 ? 'yellow' : 'default'}
              sub={m.vi <= 1.05 ? 'Effort très régulier.' : m.vi <= 1.15 ? 'Quelques variations.' : 'Effort haché : relances, groupe ou terrain.'} />
          )}
          {m.aboveFtp && m.aboveFtp.total > 0 && (
            <Insight label="Au-dessus de la FTP" value={fmtDur(m.aboveFtp.total)} sub={`Plus long bloc : ${fmtDur(m.aboveFtp.longest)}`} />
          )}
          {m.energy && (
            <Insight label="Énergie" value={`${m.energy.kj} kJ`} sub={`~${m.energy.kcal} kcal, dont ~${m.energy.carbs} g de glucides à reprendre.`} />
          )}
        </div>
      </section>

      {(m.peaks.length > 0 || m.hrZones) && (
        <section className="ride-card ride-two">
          {m.peaks.length > 0 && (
            <div>
              <h3>Pics de puissance</h3>
              <ul className="ride-peaks">
                {m.peaks.map(p => {
                  const best = bestFromCurve(season, p.secs);
                  const pct = best ? Math.round((p.watts / best) * 100) : null;
                  return (
                    <li key={p.secs}>
                      <span className="ride-peak-dur">{PEAK_LABEL[p.secs]}</span>
                      <strong>{Math.round(p.watts)} W</strong>
                      {settings.weight && <span className="ride-peak-wkg">{(p.watts / settings.weight).toFixed(1)} W/kg</span>}
                      {pct != null && (pct >= 100
                        ? <span className="ride-record"><Picto name="sparkle" size={14} /> record</span>
                        : <span className="ride-peak-pct">{pct} % du record</span>)}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {m.hrZones && (
            <div>
              <h3>Temps par zone cardiaque</h3>
              <ul className="ride-hrz">
                {m.hrZones.map(z => (
                  <li key={z.key}>
                    <span className="ride-hrz-name">{z.key} {z.label}</span>
                    <span className="ride-hrz-bar"><i className={`hrz-${z.key}`} style={{ width: `${z.pct}%` }} /></span>
                    <span className="ride-hrz-time">{z.secs ? fmtDur(z.secs) : '—'}</span>
                  </li>
                ))}
              </ul>
              {!settings.lthr && !activity?.icu_hr_zone_times && <p className="ride-note">Zones estimées depuis ta FC max. Renseigne ta FC au seuil dans Intervals.icu pour plus de justesse.</p>}
            </div>
          )}
        </section>
      )}

      {m.climbs.length > 0 && (
        <section className="ride-card">
          <h3>Montées</h3>
          <table className="ride-climbs">
            <thead><tr><th>Montée</th><th>Distance</th><th>D+</th><th>Pente</th><th>Temps</th><th>VAM</th><th>Puissance</th></tr></thead>
            <tbody>
              {m.climbs.map((c, i) => (
                <tr key={c.start}>
                  <td><Picto name="mountain" size={16} className="picto-inline" /> {i + 1}</td>
                  <td>{c.lengthKm} km</td><td>{c.gain} m</td><td>{c.grade} %</td><td>{fmtTime(c.secs)}</td>
                  <td>{c.vam} m/h</td>
                  <td>{c.watts ? `${c.watts} W${settings.weight ? ` · ${(c.watts / settings.weight).toFixed(1)} W/kg` : ''}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
