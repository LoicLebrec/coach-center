/**
 * FTP: what the athlete's recent rides say vs what the app uses.
 * The all-time power curve is useless here (it holds years-old bests), so the
 * estimate only looks at the last 6 weeks.
 */
import persistence from './persistence';
import { num } from './number';

const DAY = 86400000;

/**
 * Recent FTP estimate, best source first:
 *  1. Intervals.icu eFTP on the rides of the last `windowDays` (icu_pm_ftp…)
 *  2. 95 % of the best 20-min power of those rides, or the best 60-min power
 *  3. the athlete's own eFTP field
 */
export function estimateFtp({ athlete = null, activities = [], today = new Date(), windowDays = 42 } = {}) {
  const since = new Date(today.getTime() - windowDays * DAY).toISOString().slice(0, 10);
  const recent = activities.filter(a => String(a.start_date_local || '').slice(0, 10) >= since);
  let best = null;
  const take = (watts, source, date) => {
    if (watts && watts > 80 && (!best || watts > best.watts)) best = { watts: Math.round(watts), source, date };
  };
  for (const a of recent) {
    const d = String(a.start_date_local).slice(0, 10);
    take(num(a.icu_pm_ftp_watts) ?? num(a.icu_pm_ftp) ?? num(a.icu_eftp), 'eFTP Intervals.icu', d);
  }
  if (!best) {
    for (const a of recent) {
      const d = String(a.start_date_local).slice(0, 10);
      const b20 = num(a.icu_best_1200_watts);
      const b60 = num(a.icu_best_3600_watts);
      if (b20) take(b20 * 0.95, '95 % du meilleur 20 min', d);
      if (b60) take(b60, 'meilleure heure', d);
    }
  }
  if (!best && num(athlete?.eftp)) best = { watts: Math.round(num(athlete.eftp)), source: 'eFTP Intervals.icu', date: null };
  return best;
}

/** A change worth proposing: ≥ 3 % and ≥ 6 W away, not already dismissed. */
export function ftpSuggestion(current, estimate, dismissed = null) {
  if (!current || !estimate?.watts) return null;
  const delta = estimate.watts - current;
  if (Math.abs(delta) < Math.max(6, current * 0.03)) return null;
  if (dismissed && Math.abs(dismissed - estimate.watts) < 3) return null;
  return { ...estimate, current, delta, pct: Math.round((delta / current) * 100) };
}

/** Test reminder: base/build phases, 8 weeks after the last FTP change. */
export function ftpTestDue(setAt, phase, today = new Date()) {
  if (!setAt || !['base', 'build'].includes(phase)) return false;
  return (today - new Date(`${setAt}T12:00:00`)) / DAY >= 56;
}

export async function loadFtpOverride() {
  return persistence.getPref('ftp-override', null).catch(() => null);
}

export async function saveFtpOverride(watts, previous = null) {
  const value = { watts: Math.round(watts), previous, setAt: new Date().toISOString().slice(0, 10) };
  await persistence.savePref('ftp-override', value).catch(() => { });
  return value;
}
