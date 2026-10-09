/**
 * Number parsing for API payloads. Missing values stay missing:
 * Number(null) and Number('') are 0, which silently turned absent fields
 * (no resting HR yet today, no CTL key) into real-looking zeros.
 */
export function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** First argument that parses to a finite number, else null. */
export function asNumber(...values) {
  for (const v of values) {
    const n = num(v);
    if (n != null) return n;
  }
  return null;
}
