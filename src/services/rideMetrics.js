/**
 * Ride metrics from second-by-second streams — the ones Intervals.icu shows on an
 * activity page and the analysis view was missing. Pure functions, no I/O.
 *
 *  - Pw:HR decoupling   (Friel): EF of the 2nd half vs the 1st, < 5 % = aerobically solid
 *  - Variability index  NP / average power
 *  - W′ balance         Skiba differential model (Skiba 2015), CP ≈ FTP
 *  - Work, kcal, carbs  kJ ≈ kcal at ~24 % gross efficiency; carb share from intensity
 *  - Time above FTP     total and longest stretch
 *  - HR zones           Friel LTHR zones (or the activity's own Intervals.icu zone times)
 *  - Climbs             ≥ 40 m gain at ≥ 3 % average, with VAM and power
 */

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** Intervals.icu [{type, data}] or Strava {key: {data}} → { watts, heartrate, cadence, altitude, distance } at 1 Hz. */
export function normalizeStreams(raw) {
  if (!raw || typeof raw !== 'object') return {};
  let obj = raw;
  if (Array.isArray(raw)) {
    obj = {};
    for (const s of raw) if (s?.type && Array.isArray(s.data)) obj[s.type] = s.data;
  }
  const pick = (...keys) => {
    for (const k of keys) {
      const v = obj[k];
      if (Array.isArray(v)) return v;
      if (v && Array.isArray(v.data)) return v.data;
    }
    return null;
  };
  const out = {
    watts: pick('watts', 'power'),
    heartrate: pick('heartrate', 'heart_rate', 'hr'),
    cadence: pick('cadence'),
    altitude: pick('altitude', 'fixed_altitude', 'enhanced_altitude'),
    distance: pick('distance'),
  };
  const time = pick('time');
  // Strava sends one sample per recorded point: spread them on a 1 Hz grid.
  if (time && time.length > 1 && time[time.length - 1] + 1 > time.length * 1.05) {
    const len = Math.round(time[time.length - 1]) + 1;
    for (const k of Object.keys(out)) {
      const src = out[k];
      if (!src) continue;
      const res = new Array(len);
      let j = 0;
      for (let t = 0; t < len; t++) {
        while (j + 1 < time.length && time[j + 1] <= t) j++;
        // Gaps (auto-pause) count as no power rather than repeating the last value.
        res[t] = k === 'watts' && time[j + 1] - time[j] > 5 && t > time[j] ? 0 : src[j];
      }
      out[k] = res;
    }
  }
  return out;
}

export function rollingMean(arr, win) {
  const out = new Array(arr.length);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += num(arr[i]) || 0;
    if (i >= win) sum -= num(arr[i - win]) || 0;
    out[i] = sum / Math.min(i + 1, win);
  }
  return out;
}

const mean = (xs) => {
  const v = xs.filter(x => x != null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};

export function normalizedPower(watts) {
  if (!watts?.length) return null;
  const r = rollingMean(watts, 30);
  return Math.pow(r.reduce((s, x) => s + x ** 4, 0) / r.length, 0.25);
}

/**
 * Pw:HR decoupling. Only moving samples (power > 0, HR > 0) count; the first
 * 10 minutes are dropped as warm-up when the ride is long enough.
 */
export function decoupling(watts, hr) {
  if (!watts?.length || !hr?.length) return null;
  const pairs = [];
  for (let i = 0; i < Math.min(watts.length, hr.length); i++) {
    const p = num(watts[i]); const h = num(hr[i]);
    if (p > 0 && h > 40) pairs.push([p, h]);
  }
  const skip = pairs.length > 3600 ? 600 : 0;
  const use = pairs.slice(skip);
  if (use.length < 1200) return null; // under 20 min of steady data says little
  const half = Math.floor(use.length / 2);
  const ef = (xs) => mean(xs.map(x => x[0])) / mean(xs.map(x => x[1]));
  const ef1 = ef(use.slice(0, half));
  const ef2 = ef(use.slice(half));
  return { pct: ((ef1 - ef2) / ef1) * 100, ef1, ef2 };
}

/** Skiba differential W′bal. Returns the series (J), the lowest point and when it happened. */
export function wPrimeBalance(watts, cp, wPrime = 20000) {
  if (!watts?.length || !cp) return null;
  let bal = wPrime;
  let min = wPrime; let minAt = 0;
  const series = new Array(watts.length);
  for (let i = 0; i < watts.length; i++) {
    const p = num(watts[i]) || 0;
    if (p > cp) bal -= p - cp;
    else bal += (cp - p) * (wPrime - bal) / wPrime;
    if (bal < min) { min = bal; minAt = i; }
    series[i] = bal;
  }
  return { series, min: Math.max(0, min), minPct: Math.max(0, min) / wPrime * 100, minAt, wPrime };
}

/** Share of energy from carbohydrate by intensity factor (roughly Romijn 1993 / Jeukendrup). */
function carbShare(intensity) {
  if (intensity == null) return 0.6;
  if (intensity < 0.55) return 0.35;
  if (intensity < 0.7) return 0.5;
  if (intensity < 0.8) return 0.62;
  if (intensity < 0.9) return 0.75;
  if (intensity < 1) return 0.85;
  return 0.95;
}

export function energy(watts, ftp) {
  if (!watts?.length) return null;
  const kj = watts.reduce((s, w) => s + (num(w) || 0), 0) / 1000;
  const np = normalizedPower(watts);
  const intensity = ftp ? np / ftp : null;
  const kcal = kj; // ~24 % gross efficiency: 1 kJ of work ≈ 1 kcal burned
  return { kj: Math.round(kj), kcal: Math.round(kcal), carbs: Math.round((kcal * carbShare(intensity)) / 4) };
}

export function aboveFtp(watts, ftp) {
  if (!watts?.length || !ftp) return null;
  const r = rollingMean(watts, 5);
  let total = 0; let run = 0; let longest = 0;
  for (const p of r) {
    if (p > ftp) { total++; run++; longest = Math.max(longest, run); } else run = 0;
  }
  return { total, longest };
}

// Friel LTHR zones for cycling.
const HR_ZONES = [
  ['Z1', 'Récup', 0, 0.81], ['Z2', 'Endurance', 0.81, 0.9], ['Z3', 'Tempo', 0.9, 0.94],
  ['Z4', 'Seuil', 0.94, 1.0], ['Z5', 'VO2+', 1.0, Infinity],
];

/**
 * HR time in zones. Uses the activity's Intervals.icu zone times when present,
 * otherwise LTHR zones from the stream (LTHR from the athlete, else ~90 % of max HR).
 */
export function hrZones(hr, { lthr = null, maxHr = null, icuZoneTimes = null } = {}) {
  if (Array.isArray(icuZoneTimes) && icuZoneTimes.length >= 5) {
    const secs = icuZoneTimes.map(x => num(typeof x === 'object' ? x.secs : x) || 0);
    const merged = [secs[0], secs[1], secs[2], secs[3], secs.slice(4).reduce((s, x) => s + x, 0)];
    const tot = merged.reduce((s, x) => s + x, 0);
    if (tot > 0) return HR_ZONES.map(([key, label], i) => ({ key, label, secs: merged[i], pct: merged[i] / tot * 100 }));
  }
  if (!hr?.length) return null;
  const ref = lthr || (maxHr ? maxHr * 0.9 : null);
  if (!ref) return null;
  const secs = HR_ZONES.map(() => 0);
  let tot = 0;
  for (const h of hr) {
    const v = num(h);
    if (!v || v < 40) continue;
    const r = v / ref;
    const i = HR_ZONES.findIndex(([, , lo, hi]) => r >= lo && r < hi);
    secs[i < 0 ? 0 : i]++; tot++;
  }
  if (!tot) return null;
  return HR_ZONES.map(([key, label], i) => ({ key, label, secs: secs[i], pct: secs[i] / tot * 100 }));
}

/** Best average power over `secs`. */
export function bestPower(watts, secs) {
  if (!watts || watts.length < secs) return null;
  let sum = 0; let best = 0;
  for (let i = 0; i < watts.length; i++) {
    sum += num(watts[i]) || 0;
    if (i >= secs) sum -= num(watts[i - secs]) || 0;
    if (i >= secs - 1) best = Math.max(best, sum / secs);
  }
  return best;
}

/**
 * Climbs: altitude smoothed over 30 s, a climb starts when the road goes up and
 * ends after 50 m of descent from its top. Kept if ≥ 40 m gain at ≥ 3 % average.
 */
export function detectClimbs(altitude, distance, watts = null, { minGain = 40, minGrade = 3 } = {}) {
  if (!altitude?.length || !distance?.length) return [];
  const n = Math.min(altitude.length, distance.length);
  const alt = rollingMean(altitude.slice(0, n).map(a => num(a) ?? 0), 30);
  const climbs = [];
  let start = 0; let top = 0;
  for (let i = 1; i < n; i++) {
    // Still looking for the foot of a climb: follow the road down.
    if (alt[i] <= alt[start] && alt[top] - alt[start] < minGain) { start = i; top = i; continue; }
    if (alt[i] > alt[top]) top = i;
    if (alt[top] - alt[i] >= 50 || i === n - 1) {
      const gain = alt[top] - alt[start];
      const len = (num(distance[top]) || 0) - (num(distance[start]) || 0);
      const grade = len > 0 ? gain / len * 100 : 0;
      if (gain >= minGain && grade >= minGrade && top > start) {
        const secs = top - start;
        const w = watts ? mean(watts.slice(start, top).map(num)) : null;
        climbs.push({
          start, end: top, gain: Math.round(gain), lengthKm: Math.round(len / 100) / 10,
          grade: Math.round(grade * 10) / 10, secs, vam: Math.round(gain / secs * 3600),
          watts: w != null ? Math.round(w) : null,
        });
      }
      start = i; top = i;
    }
  }
  return climbs;
}

/** Everything for the analysis view, from raw API streams. */
export function rideMetrics(rawStreams, { ftp = null, weight = null, lthr = null, maxHr = null, wPrime = null, icuHrZoneTimes = null } = {}) {
  const s = normalizeStreams(rawStreams);
  const watts = s.watts?.length ? s.watts.map(w => num(w) || 0) : null;
  const hr = s.heartrate?.length ? s.heartrate : null;
  const np = watts ? normalizedPower(watts) : null;
  const ap = watts ? mean(watts) : null;
  return {
    streams: s,
    np, ap,
    vi: np && ap ? np / ap : null,
    decoupling: watts && hr ? decoupling(watts, hr) : null,
    wbal: watts && ftp ? wPrimeBalance(watts, ftp, wPrime || 20000) : null,
    energy: watts ? energy(watts, ftp) : null,
    aboveFtp: watts && ftp ? aboveFtp(watts, ftp) : null,
    hrZones: hrZones(hr, { lthr, maxHr, icuZoneTimes: icuHrZoneTimes }),
    peaks: watts ? [5, 60, 300, 1200].map(secs => ({ secs, watts: bestPower(watts, secs) })).filter(p => p.watts) : [],
    climbs: detectClimbs(s.altitude, s.distance, watts),
    weight,
  };
}
