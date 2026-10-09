import React, { useMemo } from 'react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import analytics from '../services/analytics';
import { asNumber } from '../services/number';
import { formStatus } from '../services/dailyPlan';
import { weeklyTotals, Bars } from './WeeklyLoad';
import { estimateFtp, ftpSuggestion } from '../services/ftp';

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

function getAthleteFtp(athlete) {
  const explicit = asNumber(
    athlete?.icu_ftp,
    athlete?.eftp,
    athlete?.eFTP,
    athlete?.estimated_ftp,
    athlete?.estimatedFtp,
    athlete?.ftp,
    athlete?.ftp_watts,
    athlete?.critical_power,
    athlete?.zones?.ftp
  );

  if (explicit != null) return explicit;
  return findNumericByKeyPattern(athlete, /(^|_)e\s*ftp$|estimated.?ftp|(^|_)ftp$|ftp.?watts|critical.?power/i);
}

function getAthleteWeight(athlete) {
  return asNumber(athlete?.icu_weight, athlete?.weight, athlete?.athlete_weight);
}

function getWellnessDate(w) {
  return w?.id || w?.date || w?.day || null;
}

function getWellnessRestingHr(w) {
  return asNumber(w?.restingHR, w?.resting_hr, w?.rhr, w?.hrRest);
}

function getWellnessWeight(w) {
  return asNumber(w?.weight, w?.bodyWeight, w?.body_weight);
}

function estimatePMCFromActivities(activities = []) {
  if (!activities.length) return null;

  const dailyLoad = new Map();
  activities.forEach(a => {
    const day = String(a.start_date_local || '').slice(0, 10);
    if (!day) return;
    const load = Number(a.icu_training_load || a.training_load || 0);
    dailyLoad.set(day, (dailyLoad.get(day) || 0) + (Number.isFinite(load) ? load : 0));
  });

  const today = new Date();
  let ctl = 0;
  let atl = 0;
  const ctlTau = 42;
  const atlTau = 7;

  for (let d = 90; d >= 0; d--) {
    const day = new Date(today);
    day.setDate(today.getDate() - d);
    const key = day.toISOString().slice(0, 10);
    const load = dailyLoad.get(key) || 0;
    ctl = ctl + (load - ctl) * (1 / ctlTau);
    atl = atl + (load - atl) * (1 / atlTau);
  }

  return { ctl, atl, tsb: ctl - atl };
}

// ── FormGauge: horizontal gradient bar with TSB indicator ────────────────────
const PR_DURATIONS = [
  { label: '5 s',   sec: 5 },
  { label: '30 s',  sec: 30 },
  { label: '1 min', sec: 60 },
  { label: '5 min', sec: 300 },
  { label: '20 min',sec: 1200 },
  { label: '60 min',sec: 3600 },
];

// Extract watts from Intervals.icu power curve for a target duration.
// Handles two formats:
//   A) [{secs:[1,2,...], watts:[800,750,...]}] — raw ICU API response (arrays inside object)
//   B) [{secs:5, watts:800}, ...]             — already-normalized point array
function getPCWatts(rawCurve, targetSec) {
  // ICU /power-curves returns { list: [...] }; older callers pass the array directly.
  const powerCurve = Array.isArray(rawCurve) ? rawCurve : (Array.isArray(rawCurve?.list) ? rawCurve.list : null);
  if (!powerCurve?.length) return null;

  // Format A: first element has secs/watts as arrays
  const first = powerCurve[0];
  if (Array.isArray(first?.secs) && Array.isArray(first?.watts)) {
    // Find index of closest duration, pick the one with best watts within ±30%
    let bestW = 0;
    for (let i = 0; i < first.secs.length; i++) {
      const s = first.secs[i];
      const w = first.watts[i] || 0;
      if (Math.abs(s - targetSec) <= targetSec * 0.3 && w > bestW) bestW = w;
    }
    return bestW > 0 ? Math.round(bestW) : null;
  }

  // Format B: array of {secs, time, watts, power} point objects
  const sorted = [...powerCurve].sort((a, b) =>
    Math.abs((a.secs || a.time || 0) - targetSec) - Math.abs((b.secs || b.time || 0) - targetSec)
  );
  const pt = sorted[0];
  if (!pt) return null;
  const ptSec = pt.secs || pt.time || 0;
  if (Math.abs(ptSec - targetSec) > targetSec * 0.3) return null;
  return Math.round(pt.watts || pt.power || 0) || null;
}

// icu_best_{sec}_watts fields returned by Intervals.icu in activity list
const ICU_BEST = { 5: 'icu_best_5_watts', 30: 'icu_best_30_watts', 60: 'icu_best_60_watts',
  300: 'icu_best_300_watts', 1200: 'icu_best_1200_watts', 3600: 'icu_best_3600_watts' };

function computePowerPRs(powerCurve, activities) {
  return PR_DURATIONS.map(({ label, sec }) => {
    const field = ICU_BEST[sec];

    // Collect per-activity MMP efforts (icu_best fields = true MMP within the activity)
    const efforts = [];
    for (const a of activities) {
      const w = field ? asNumber(a[field]) : 0;
      if (w > 0) {
        efforts.push({
          watts: Math.round(w),
          date: a.start_date_local?.slice(0, 10) ?? null,
          name: a.name ?? null,
        });
      }
    }
    efforts.sort((a, b) => b.watts - a.watts);
    const top3 = efforts.slice(0, 3);

    // Power curve best (all-time, covers beyond 120-day window)
    const pcBest = getPCWatts(powerCurve, sec);

    // If powerCurve beats top3[0], use it as reference for #1 — no date available from curve
    const best = pcBest
      ? Math.max(pcBest, top3[0]?.watts ?? 0)
      : (top3[0]?.watts ?? null);

    return { label, sec, best, top3: top3.length ? top3 : null, hasCurve: !!pcBest };
  });
}

function detectMaxHR(activities) {
  let maxHR = 0, maxDate = null, maxName = null;
  for (const a of activities) {
    const hr = asNumber(a.max_heartrate);
    if (hr > maxHR) {
      maxHR = hr;
      maxDate = a.start_date_local?.slice(0, 10) ?? null;
      maxName = a.name ?? null;
    }
  }
  return maxHR > 100 ? { hr: Math.round(maxHR), date: maxDate, name: maxName } : null;
}

function fmtDate(dateStr) {
  if (!dateStr) return null;
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  } catch { return null; }
}

export default function Dashboard({ wellness, activities, athlete, loading, powerCurve, onUpdateFtp }) {
  const [ftpMsg, setFtpMsg] = React.useState(null);
  const latest = wellness?.[wellness.length - 1];
  // Today's row is often empty until the watch syncs: use the latest measured value.
  const restingHr = getWellnessRestingHr([...(wellness || [])].reverse().find(w => getWellnessRestingHr(w) != null));
  const estimatedPMC = useMemo(() => estimatePMCFromActivities(activities), [activities]);
  const ctl = latest?.icu_ctl ?? estimatedPMC?.ctl ?? null;
  const atl = latest?.icu_atl ?? estimatedPMC?.atl ?? null;
  const tsb = ctl != null && atl != null ? ctl - atl : null;


  const ftpValue = getAthleteFtp(athlete);
  const weightValue = getAthleteWeight(athlete) ?? getWellnessWeight(latest);
  const wkgValue = (ftpValue && weightValue) ? (ftpValue / weightValue) : null;

  const powerPRs = useMemo(() => computePowerPRs(powerCurve, activities || []), [powerCurve, activities]);
  const maxHRDetection = useMemo(() => detectMaxHR(activities || []), [activities]);

  const efTrend = useMemo(() => analytics.computeEFTrend(activities, 14), [activities]);

  const evolutionData = useMemo(() => {
    const wellnessByDay = new Map();
    (wellness || []).forEach(w => {
      const day = String(getWellnessDate(w) || '').slice(0, 10);
      if (!day) return;
      wellnessByDay.set(day, w);
    });

    const activityByDay = new Map();
    (activities || []).forEach(a => {
      const day = String(a.start_date_local || '').slice(0, 10);
      if (!day) return;

      const load = asNumber(a.icu_training_load, a.training_load, a.tss, a.load) || 0;
      const watts = Number(a.icu_average_watts || a.average_watts || 0);
      const hr = Number(a.average_heartrate || 0);

      const curr = activityByDay.get(day) || { load: 0, efSum: 0, efCount: 0 };
      curr.load += load;
      if (watts > 0 && hr > 0) {
        curr.efSum += watts / hr;
        curr.efCount += 1;
      }
      activityByDay.set(day, curr);
    });

    if (wellnessByDay.size === 0 && activityByDay.size === 0) return [];

    const today = new Date();
    let ctlEst = 0;
    let atlEst = 0;
    const ctlTau = 42;
    const atlTau = 7;
    const output = [];

    for (let d = 180; d >= 0; d--) {
      const day = new Date(today);
      day.setDate(today.getDate() - d);
      const key = day.toISOString().slice(0, 10);

      const activity = activityByDay.get(key);
      const load = activity?.load || 0;
      ctlEst = ctlEst + (load - ctlEst) * (1 / ctlTau);
      atlEst = atlEst + (load - atlEst) * (1 / atlTau);

      if (d > 60) continue;

      const w = wellnessByDay.get(key);
      const ctlValue = asNumber(w?.icu_ctl, w?.ctl, ctlEst);
      const atlValue = asNumber(w?.icu_atl, w?.atl, atlEst);
      output.push({
        date: key,
        ctl: ctlValue != null ? Number(ctlValue.toFixed(1)) : null,
        atl: atlValue != null ? Number(atlValue.toFixed(1)) : null,
        tsb: (ctlValue != null && atlValue != null) ? Number((ctlValue - atlValue).toFixed(1)) : null,
        rhr: getWellnessRestingHr(w),
        weight: getWellnessWeight(w),
        ef: activity?.efCount ? Number((activity.efSum / activity.efCount).toFixed(3)) : null,
      });
    }

    return output;
  }, [wellness, activities]);

  // Recent activities (last 7)
  const recentActivities = useMemo(() => {
    if (!activities) return [];
    return [...activities]
      .sort((a, b) => new Date(b.start_date_local) - new Date(a.start_date_local))
      .slice(0, 7);
  }, [activities]);

  if (loading && wellness.length === 0) {
    return (
      <div className="loading-state">
        <div className="loading-spinner"></div>
        <span>Chargement…</span>
      </div>
    );
  }

  const formatDuration = (seconds) => {
    if (!seconds) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m}m`;
  };

  const form = formStatus(tsb);
  const recentFtp = estimateFtp({ athlete, activities: activities || [] });
  const ftpChange = ftpSuggestion(ftpValue, recentFtp);
  const ago14 = evolutionData[evolutionData.length - 15] || null;
  const delta = (k) => (ago14 && evolutionData.length ? (evolutionData[evolutionData.length - 1][k] ?? 0) - (ago14[k] ?? 0) : null);
  const weeks = weeklyTotals(activities || [], 8);
  const doneWeeks = weeks.slice(0, -1);
  const weekAvg = doneWeeks.length ? doneWeeks.reduce((x, w) => x + w.tss, 0) / doneWeeks.length : 0;
  const shortDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const efText = efTrend?.assessment
    ? efTrend.assessment.startsWith('IMPROVING') ? 'Ton efficacité (puissance par battement) progresse : la base aérobie se construit.'
      : efTrend.assessment.startsWith('DECLINING') ? 'Ton efficacité baisse : fatigue, chaleur ou manque de volume facile.'
      : 'Ton efficacité est stable.'
    : null;
  const ChartTip = ({ active, payload, label }) => (active && payload?.length ? (
    <div className="db-tip">
      <div className="db-tip-date">{shortDate(label)}</div>
      {payload.map(p => <div key={p.dataKey} style={{ color: p.color }}>{p.name} : {p.value?.toFixed ? p.value.toFixed(p.dataKey === 'ef' ? 2 : 0) : p.value}</div>)}
    </div>
  ) : null);
  const axis = { tick: { fill: '#7b8b74', fontSize: 11, fontFamily: 'var(--font-sans)' }, tickLine: false, axisLine: false };

  return (
    <div className="db">
      <div className="page-header">
        <div className="page-title">Tableau de bord</div>
        <div className="page-subtitle">Ta condition en un coup d’œil · {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      </div>

      <div className="wl-tiles db-tiles">
        <div className="wl-tile">
          <div className="wl-tile-label">Forme (TSB)</div>
          <div className={`wl-tile-value tone-${form.tone}`}>{tsb != null ? `${tsb > 0 ? '+' : ''}${Math.round(tsb)}` : '—'}</div>
          <div className="wl-tile-sub">{form.label}</div>
        </div>
        <div className="wl-tile">
          <div className="wl-tile-label">Condition (CTL)</div>
          <div className="wl-tile-value">{ctl != null ? Math.round(ctl) : '—'}</div>
          <div className="wl-tile-sub">{delta('ctl') != null ? `${delta('ctl') >= 0 ? '+' : ''}${delta('ctl').toFixed(1)} en 14 jours` : 'Moyenne de charge sur 6 semaines'}</div>
        </div>
        <div className="wl-tile">
          <div className="wl-tile-label">Fatigue (ATL)</div>
          <div className="wl-tile-value">{atl != null ? Math.round(atl) : '—'}</div>
          <div className="wl-tile-sub">Charge des 7 derniers jours</div>
        </div>
        <div className="wl-tile">
          <div className="wl-tile-label">FTP</div>
          <div className="wl-tile-value">{ftpValue ?? '—'} <small>W</small></div>
          <div className="wl-tile-sub">{wkgValue ? `${wkgValue.toFixed(2)} W/kg` : 'Poids non renseigné'}</div>
        </div>
        <div className="wl-tile">
          <div className="wl-tile-label">FC repos</div>
          <div className="wl-tile-value">{restingHr ?? '—'} <small>bpm</small></div>
          <div className="wl-tile-sub">{weightValue ? `${Number(weightValue).toFixed(1)} kg` : '—'}</div>
        </div>
      </div>

      <section className="ride-card">
        <h3>Condition et fatigue · 60 jours</h3>
        <p className="db-help">La condition (vert) monte avec l’entraînement régulier ; quand la fatigue (orange) passe au-dessus, la forme baisse.</p>
        <div className="db-chart">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={evolutionData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={40} {...axis} />
              <YAxis {...axis} />
              <Tooltip content={<ChartTip />} />
              <ReferenceLine y={0} stroke="#bcc98c" />
              <Area type="monotone" dataKey="tsb" name="Forme" stroke="none" fill="#c9e08f" fillOpacity={0.55} isAnimationActive={false} />
              <Area type="monotone" dataKey="ctl" name="Condition" stroke="#24402e" strokeWidth={2.2} fill="none" isAnimationActive={false} />
              <Area type="monotone" dataKey="atl" name="Fatigue" stroke="#f0663a" strokeWidth={1.6} fill="none" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="ride-chart-legend">
          <span><i style={{ background: 'var(--pine)' }} />Condition</span>
          <span><i style={{ background: 'var(--sun)' }} />Fatigue</span>
          <span><i style={{ background: '#c9e08f', height: 10 }} />Forme</span>
        </div>
      </section>

      <section className="ride-card">
        <h3>Charge par semaine</h3>
        <Bars data={weeks} avg={weekAvg} />
      </section>

      <section className="ride-card">
        <h3>Physiologie · 60 jours</h3>
        {efText && <p className="db-help">{efText}</p>}
        <div className="db-chart">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={evolutionData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={40} {...axis} />
              <YAxis yAxisId="left" {...axis} />
              <YAxis yAxisId="right" orientation="right" {...axis} hide />
              <Tooltip content={<ChartTip />} />
              <Line yAxisId="left" type="monotone" dataKey="rhr" name="FC repos" stroke="#c8372d" strokeWidth={1.8} dot={false} connectNulls isAnimationActive={false} />
              <Line yAxisId="left" type="monotone" dataKey="weight" name="Poids" stroke="#24402e" strokeWidth={1.6} dot={false} connectNulls isAnimationActive={false} />
              <Line yAxisId="right" type="monotone" dataKey="ef" name="Efficacité" stroke="#2f6fb0" strokeWidth={0} dot={{ r: 2.5, fill: '#2f6fb0' }} connectNulls={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="ride-chart-legend">
          <span><i style={{ background: 'var(--accent-red)' }} />FC repos</span>
          <span><i style={{ background: 'var(--pine)' }} />Poids</span>
          <span><i style={{ background: 'var(--accent-blue)' }} />Efficacité (puissance / FC)</span>
        </div>
      </section>

      <section className="ride-card">
        <h3>Records</h3>
        <div className="db-records">
          <div className="wl-tile">
            <div className="wl-tile-label">FTP estimée (6 dernières semaines)</div>
            <div className="wl-tile-value">{recentFtp?.watts ?? '—'} <small>W</small></div>
            <div className="wl-tile-sub">
              {ftpValue ? `Réglée : ${ftpValue} W` : 'FTP non réglée'}{recentFtp?.source ? ` · ${recentFtp.source}` : ''}
            </div>
            {ftpChange && onUpdateFtp && !ftpMsg && (
              <button type="button" className="btn btn-primary db-ftp-btn" onClick={async () => {
                const r = await onUpdateFtp(ftpChange.watts);
                setFtpMsg(r.synced ? 'Mise à jour ici et sur Intervals.icu.' : 'Mise à jour dans l’app.');
              }}>Passer à {ftpChange.watts} W</button>
            )}
            {ftpMsg && <div className="wl-tile-sub">{ftpMsg}</div>}
          </div>
          <div className="wl-tile">
            <div className="wl-tile-label">FC max relevée</div>
            <div className="wl-tile-value">{maxHRDetection?.hr ?? '—'} <small>bpm</small></div>
            <div className="wl-tile-sub">{maxHRDetection?.date ? fmtDate(maxHRDetection.date) : '—'}</div>
          </div>
        </div>
        <ul className="ride-peaks db-prs">
          {powerPRs.map(({ label, best, top3 }) => (
            <li key={label}>
              <span className="ride-peak-dur">{label}</span>
              <strong>{best ? `${best} W` : '—'}</strong>
              {best && weightValue && <span className="ride-peak-wkg">{(best / weightValue).toFixed(1)} W/kg</span>}
              {top3?.[0]?.date && <span className="ride-peak-pct">{fmtDate(top3[0].date)}</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="ride-card">
        <h3>Dernières sorties</h3>
        {recentActivities.length === 0 ? <p className="db-help">Aucune sortie sur les 90 derniers jours.</p> : (
          <table className="ride-climbs">
            <thead><tr><th>Date</th><th>Sortie</th><th>Durée</th><th>TSS</th><th>Puissance</th></tr></thead>
            <tbody>
              {recentActivities.map(a => (
                <tr key={a.id}>
                  <td>{shortDate(String(a.start_date_local).slice(0, 10))}</td>
                  <td className="db-name">{a.name || a.type}</td>
                  <td>{formatDuration(a.moving_time)}</td>
                  <td>{a.icu_training_load ? Math.round(a.icu_training_load) : '—'}</td>
                  <td>{a.icu_average_watts || a.average_watts ? `${Math.round(a.icu_average_watts || a.average_watts)} W` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
