/**
 * Workout Analyzer — pure computation engine, no React.
 *
 * Handles three analysis modes:
 *  1. analyzeIntervalSet  — structured interval compliance + fatigue
 *  2. computeFatigueCurve — rolling NP/HR over entire ride
 *  3. analyzeRace         — zone distribution, matches, MMP, pacing
 */

// ─── Private helpers ─────────────────────────────────────────────────────────

/**
 * Rolling 4th-power mean (Normalized Power kernel) over a fixed window.
 * Returns an array the same length as `arr`; values before the window fills
 * are filled with the first valid result.
 */
function rollingNP(arr, window) {
  const result = new Array(arr.length).fill(0);
  let firstValid = null;

  for (let i = 0; i < arr.length; i++) {
    const start = Math.max(0, i - window + 1);
    let sum4 = 0;
    let count = 0;
    for (let j = start; j <= i; j++) {
      const v = arr[j] || 0;
      sum4 += v * v * v * v;
      count++;
    }
    const val = count > 0 ? Math.pow(sum4 / count, 0.25) : 0;
    result[i] = val;
    if (firstValid === null && count >= window) firstValid = val;
  }

  // Back-fill values before the window filled with the first valid NP
  if (firstValid !== null) {
    for (let i = 0; i < Math.min(window - 1, result.length); i++) {
      result[i] = firstValid;
    }
  }
  return result;
}

/**
 * Rolling simple average over a fixed window.
 */
function rollingAvg(arr, window) {
  const result = new Array(arr.length).fill(0);
  let runSum = 0;
  const buf = [];

  for (let i = 0; i < arr.length; i++) {
    const v = arr[i] || 0;
    buf.push(v);
    runSum += v;
    if (buf.length > window) runSum -= buf.shift();
    result[i] = runSum / buf.length;
  }
  return result;
}

/**
 * Max Mean Power for a fixed duration in seconds over a watts stream.
 * Returns the highest average power achievable for that duration.
 */
function computeMMP(arr, durationSec) {
  if (!arr || arr.length < durationSec) return null;
  let windowSum = 0;
  for (let i = 0; i < durationSec; i++) windowSum += arr[i] || 0;
  let best = windowSum;
  for (let i = durationSec; i < arr.length; i++) {
    windowSum += (arr[i] || 0) - (arr[i - durationSec] || 0);
    if (windowSum > best) best = windowSum;
  }
  return best / durationSec;
}

/**
 * Linear regression slope of an array of values.
 * Returns slope per index unit (not per-rep %).
 */
function linearSlope(values) {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/**
 * Median of a numeric array (ignores non-finite values).
 */
function median(arr) {
  const clean = arr.filter(v => Number.isFinite(v) && v > 0);
  if (clean.length === 0) return 0;
  clean.sort((a, b) => a - b);
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 === 0
    ? (clean[mid - 1] + clean[mid]) / 2
    : clean[mid];
}

// ─── Public API ───────────────────────────────────────────────────────────────

const workoutAnalyzer = {

  /**
   * Parse the flat streams object returned by the intervals.icu streams API.
   * Handles both array-of-values and wrapped formats.
   *
   * @param {Object} rawStreams — e.g. { watts: [...], heartrate: [...] }
   * @returns {{ watts, heartrate, cadence, velocity }}
   */
  parseStreams(rawStreams) {
    if (!rawStreams || typeof rawStreams !== 'object') {
      return { watts: [], heartrate: [], cadence: [], velocity: [] };
    }

    const extract = (key, aliases = []) => {
      for (const k of [key, ...aliases]) {
        const val = rawStreams[k];
        if (Array.isArray(val)) return val;
        // Some endpoints wrap in { data: [...] }
        if (val && Array.isArray(val.data)) return val.data;
      }
      return [];
    };

    return {
      watts:     extract('watts',     ['power']),
      heartrate: extract('heartrate', ['heart_rate', 'hr']),
      cadence:   extract('cadence',   ['rpm']),
      velocity:  extract('velocity',  ['velocity_smooth', 'speed']),
    };
  },

  /**
   * Parse and normalise the intervals array from the intervals.icu API.
   * Filters out group: true entries.
   *
   * @param {Array} rawIntervals
   * @returns {Array<{id, type, label, repIndex, startIndex, endIndex,
   *                  avgWatts, maxWatts, npWatts, avgHR, avgCadence,
   *                  targetLow, targetHigh, movingTime}>}
   */
  parseIntervals(rawIntervals) {
    if (!Array.isArray(rawIntervals)) return [];

    let repIndex = 0;
    return rawIntervals
      .filter(iv => !iv.group)
      .map(iv => {
        const type = (iv.type || iv.interval_type || 'WORK').toUpperCase();

        // Target power: prefer explicit low/high, fall back to single target
        const targetLow  = iv.target_power_low  ?? iv.target_power ?? null;
        const targetHigh = iv.target_power_high ?? iv.target_power ?? null;

        const parsed = {
          id:         iv.id ?? null,
          type,
          label:      iv.label || iv.name || '',
          repIndex:   repIndex,
          startIndex: iv.start_index ?? iv.startIndex ?? 0,
          endIndex:   iv.end_index   ?? iv.endIndex   ?? 0,
          avgWatts:   iv.average_watts         ?? iv.avg_watts   ?? null,
          maxWatts:   iv.max_watts             ?? null,
          npWatts:    iv.normalized_watts      ?? iv.np_watts    ?? null,
          avgHR:      iv.average_heartrate     ?? iv.avg_hr      ?? null,
          avgCadence: iv.average_cadence       ?? iv.avg_cadence ?? null,
          targetLow,
          targetHigh,
          movingTime: iv.moving_time           ?? iv.duration    ?? null,
        };
        repIndex++;
        return parsed;
      });
  },

  /**
   * Analyse a structured interval workout: compliance, fatigue, HR drift.
   *
   * @param {Array}  rawIntervals  — raw API response
   * @param {number} ftp           — athlete FTP in watts
   * @returns {{ reps, repCount, fatigueIndex, avgCompliance, hrSlope, assessment } | null}
   */
  analyzeIntervalSet(rawIntervals, ftp) {
    const intervals = this.parseIntervals(rawIntervals);
    const WORK_TYPES = new Set(['WORK', 'INTERVAL', 'EFFORT', 'REP', 'SET']);
    const REST_TYPES = new Set(['REST', 'RECOVERY', 'WARMUP', 'COOLDOWN', 'WARM_UP', 'COOL_DOWN']);

    const workReps = intervals.filter(iv => {
      const t = iv.type;
      if (REST_TYPES.has(t)) return false;
      if (WORK_TYPES.has(t)) return true;
      // Unknown types: include only if they have a meaningful power reading
      return iv.avgWatts != null && iv.avgWatts > 0;
    });

    if (workReps.length < 2) return null;

    // Compliance per rep
    const reps = workReps.map((iv, i) => {
      const targetMid = (iv.targetLow != null && iv.targetHigh != null)
        ? (iv.targetLow + iv.targetHigh) / 2
        : iv.targetLow ?? iv.targetHigh ?? null;

      const compliancePct = (targetMid && targetMid > 0 && iv.avgWatts != null)
        ? (iv.avgWatts / targetMid) * 100
        : null;

      const efThisInterval = (iv.avgWatts != null && iv.avgHR && iv.avgHR > 0)
        ? iv.avgWatts / iv.avgHR
        : null;

      return {
        repNumber:    i + 1,
        label:        iv.label,
        type:         iv.type,
        avgWatts:     iv.avgWatts,
        maxWatts:     iv.maxWatts,
        npWatts:      iv.npWatts,
        avgHR:        iv.avgHR,
        avgCadence:   iv.avgCadence,
        targetLow:    iv.targetLow,
        targetHigh:   iv.targetHigh,
        movingTime:   iv.movingTime,
        compliancePct,
        efThisInterval,
      };
    });

    // Fatigue index: linear slope of avgWatts across reps, normalised to first rep
    const wattsArr = reps.map(r => r.avgWatts ?? 0).filter(v => v > 0);
    const firstRepWatts = wattsArr[0] || 1;
    const slopeWatts = linearSlope(wattsArr);
    // Express as % per rep relative to first rep
    const fatigueIndex = (slopeWatts / firstRepWatts) * 100;

    // HR slope
    const hrArr = reps.map(r => r.avgHR).filter(v => v != null && v > 0);
    const hrSlope = hrArr.length >= 2 ? linearSlope(hrArr) : null;

    // Average compliance (only for reps that have target data)
    const complianceArr = reps.map(r => r.compliancePct).filter(v => v != null);
    const avgCompliance = complianceArr.length > 0
      ? complianceArr.reduce((s, v) => s + v, 0) / complianceArr.length
      : null;

    // French assessment
    let assessment;
    if (fatigueIndex > -2) {
      assessment = 'Excellent maintien de la puissance — aucune fatigue significative détectée.';
    } else if (fatigueIndex > -5) {
      assessment = 'Légère fatigue sur la fin de séance — puissance encore bien tenue globalement.';
    } else if (fatigueIndex > -10) {
      assessment = 'Fatigue modérée — baisse progressive de la puissance au fil des répétitions.';
    } else {
      assessment = 'Fatigue importante — la puissance chute significativement. Envisager de réduire le volume ou l\'intensité.';
    }

    return {
      reps,
      repCount:     reps.length,
      fatigueIndex: Math.round(fatigueIndex * 10) / 10,
      avgCompliance: avgCompliance != null ? Math.round(avgCompliance * 10) / 10 : null,
      hrSlope:       hrSlope != null ? Math.round(hrSlope * 10) / 10 : null,
      assessment,
    };
  },

  /**
   * Compute a rolling fatigue curve over the full ride.
   * Uses 30s rolling NP and HR, subsampled to ≤300 points.
   *
   * @param {Object} rawStreams — raw API streams object
   * @returns {{ curve, medianNP, durationMin, npDrop, hrRise } | null}
   */
  computeFatigueCurve(rawStreams) {
    const { watts, heartrate } = this.parseStreams(rawStreams);
    if (!watts || watts.length < 60) return null;

    const WINDOW = 30; // seconds
    const npArr  = rollingNP(watts, WINDOW);
    const hrArr  = heartrate.length >= watts.length
      ? rollingAvg(heartrate, WINDOW)
      : new Array(watts.length).fill(null);

    const n = watts.length;
    const durationMin = n / 60;

    // Subsample to max 300 points
    const step = Math.max(1, Math.floor(n / 300));
    const curve = [];
    for (let i = 0; i < n; i += step) {
      const np = npArr[i];
      const hr = hrArr[i] || null;
      const ef = (np > 0 && hr && hr > 0) ? np / hr : null;
      curve.push({
        timeMin:  Math.round((i / 60) * 10) / 10,
        np:       Math.round(np),
        hr:       hr != null ? Math.round(hr) : null,
        ef:       ef != null ? Math.round(ef * 1000) / 1000 : null,
      });
    }

    // Median NP from middle 80% of ride (skip warmup/cooldown extremes)
    const lo = Math.floor(n * 0.10);
    const hi = Math.ceil(n * 0.90);
    const middleNP = npArr.slice(lo, hi);
    const medianNP = Math.round(median(middleNP));

    // Normalise curve npNorm
    for (const pt of curve) {
      pt.npNorm = medianNP > 0 ? Math.round((pt.np / medianNP) * 100) / 100 : null;
    }

    // npDrop: compare first 25% vs last 25%
    const q1end  = Math.floor(n * 0.25);
    const q4start = Math.floor(n * 0.75);
    const firstQ  = npArr.slice(0, q1end);
    const lastQ   = npArr.slice(q4start);
    const avgFirst = firstQ.reduce((s, v) => s + v, 0) / (firstQ.length || 1);
    const avgLast  = lastQ.reduce((s, v) => s + v, 0) / (lastQ.length || 1);
    const npDrop   = avgFirst > 0 ? Math.round(((avgLast - avgFirst) / avgFirst) * 1000) / 10 : null;

    // hrRise: avg HR first quarter vs last quarter
    let hrRise = null;
    if (heartrate.length >= watts.length) {
      const hrFirst = heartrate.slice(0, q1end);
      const hrLast  = heartrate.slice(q4start);
      const hrAvgFirst = hrFirst.reduce((s, v) => s + (v || 0), 0) / (hrFirst.length || 1);
      const hrAvgLast  = hrLast.reduce((s, v)  => s + (v || 0), 0) / (hrLast.length  || 1);
      hrRise = Math.round((hrAvgLast - hrAvgFirst) * 10) / 10;
    }

    return {
      curve,
      medianNP,
      durationMin: Math.round(durationMin * 10) / 10,
      npDrop,
      hrRise,
    };
  },

  /**
   * Full race analysis: zone distribution, match burning, MMP, pacing.
   *
   * @param {Object} rawStreams — raw API streams object
   * @param {number} ftp        — athlete FTP in watts
   * @returns {{ zoneDistribution, matches, matchCount, totalMatchDuration,
   *             mmp, pacing, wAboveFTP } | null}
   */
  analyzeRace(rawStreams, ftp) {
    const { watts } = this.parseStreams(rawStreams);
    if (!watts || watts.length < 30 || !ftp || ftp <= 0) return null;

    const n = watts.length;

    // ── Zone distribution ──────────────────────────────────────────────────
    const ZONE_THRESHOLDS = [
      { key: 'Z1', lo: 0,    hi: 0.55 },
      { key: 'Z2', lo: 0.55, hi: 0.75 },
      { key: 'Z3', lo: 0.75, hi: 0.90 },
      { key: 'Z4', lo: 0.90, hi: 1.05 },
      { key: 'Z5', lo: 1.05, hi: 1.20 },
      { key: 'Z6', lo: 1.20, hi: 1.50 },
      { key: 'Z7', lo: 1.50, hi: Infinity },
    ];
    const zoneCounts = { Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0, Z6: 0, Z7: 0 };
    let wAboveFTP = 0;

    for (let i = 0; i < n; i++) {
      const pct = (watts[i] || 0) / ftp;
      for (const z of ZONE_THRESHOLDS) {
        if (pct >= z.lo && pct < z.hi) {
          zoneCounts[z.key]++;
          break;
        }
      }
      if ((watts[i] || 0) >= ftp) wAboveFTP++;
    }

    const zoneDistribution = {};
    for (const z of ZONE_THRESHOLDS) {
      zoneDistribution[z.key] = Math.round((zoneCounts[z.key] / n) * 1000) / 10;
    }

    // ── Match burning ──────────────────────────────────────────────────────
    const MATCH_THRESHOLD = ftp * 1.5;
    const MIN_MATCH_SECS  = 2;
    const matches = [];
    let inMatch = false;
    let matchStart = 0;

    for (let i = 0; i <= n; i++) {
      const w = i < n ? (watts[i] || 0) : 0;
      if (w >= MATCH_THRESHOLD && !inMatch) {
        inMatch = true;
        matchStart = i;
      } else if ((w < MATCH_THRESHOLD || i === n) && inMatch) {
        inMatch = false;
        const dur = i - matchStart;
        if (dur >= MIN_MATCH_SECS) {
          const segment = watts.slice(matchStart, i);
          const sum = segment.reduce((s, v) => s + (v || 0), 0);
          const avg = sum / segment.length;
          const max = Math.max(...segment);
          matches.push({
            startSec:    matchStart,
            durationSec: dur,
            avgWatts:    Math.round(avg),
            maxWatts:    Math.round(max),
            pctFTP:      Math.round((avg / ftp) * 10) / 10,
          });
        }
      }
    }
    matches.sort((a, b) => b.avgWatts - a.avgWatts);
    const totalMatchDuration = matches.reduce((s, m) => s + m.durationSec, 0);

    // ── MMP ───────────────────────────────────────────────────────────────
    const MMP_DURATIONS = [5, 30, 60, 300, 600, 1200];
    const mmp = {};
    for (const dur of MMP_DURATIONS) {
      if (watts.length >= dur) {
        const val = computeMMP(watts, dur);
        const label = dur < 60
          ? `${dur}s`
          : dur < 3600
            ? `${Math.round(dur / 60)}min`
            : `${Math.round(dur / 3600)}h`;
        mmp[label] = {
          watts:  val != null ? Math.round(val) : null,
          pctFTP: val != null ? Math.round((val / ftp) * 10) / 10 : null,
        };
      }
    }

    // ── Pacing ────────────────────────────────────────────────────────────
    const half = Math.floor(n / 2);
    const firstHalf  = watts.slice(0, half);
    const secondHalf = watts.slice(half);

    const avgFirst  = firstHalf.reduce((s, v)  => s + (v || 0), 0) / (firstHalf.length  || 1);
    const avgSecond = secondHalf.reduce((s, v) => s + (v || 0), 0) / (secondHalf.length || 1);
    const pacingIndex = avgFirst > 0
      ? Math.round(((avgSecond - avgFirst) / avgFirst) * 1000) / 10
      : null;

    // ── Critical moments ──────────────────────────────────────────────────
    const windowSec = Math.max(10, Math.floor(n * 0.10));
    const moments   = [];
    for (let i = 0; i <= n - windowSec; i += Math.max(1, Math.floor(windowSec / 5))) {
      const seg = watts.slice(i, i + windowSec);
      const avg = seg.reduce((s, v) => s + (v || 0), 0) / seg.length;
      moments.push({ startSec: i, durationSec: windowSec, avgWatts: Math.round(avg) });
    }
    moments.sort((a, b) => b.avgWatts - a.avgWatts);
    // Deduplicate: keep only moments that don't overlap with an already-kept one
    const critical = [];
    for (const m of moments) {
      const overlaps = critical.some(
        c => m.startSec < c.startSec + c.durationSec && m.startSec + m.durationSec > c.startSec
      );
      if (!overlaps) critical.push(m);
      if (critical.length === 5) break;
    }
    critical.sort((a, b) => a.startSec - b.startSec);

    return {
      zoneDistribution,
      matches:             matches.slice(0, 20),  // cap at 20
      matchCount:          matches.length,
      totalMatchDuration,
      mmp,
      pacing: {
        firstHalfWatts:  Math.round(avgFirst),
        secondHalfWatts: Math.round(avgSecond),
        pacingIndex,
      },
      wAboveFTP: Math.round((wAboveFTP / n) * 1000) / 10,
      criticalMoments: critical,
    };
  },
};

export default workoutAnalyzer;
