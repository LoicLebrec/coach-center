/**
 * Ride feedback storage (browser). The rules live in rideFeedbackRules.js so the
 * server-side daily plan can use them without pulling in browser storage.
 */
import persistence from './persistence';

export * from './rideFeedbackRules';

const KEY = 'ride-feedback';

export async function loadFeedback() {
  return (await persistence.getPref(KEY, {}).catch(() => ({}))) || {};
}

export async function saveFeedback(date, entry) {
  const all = await loadFeedback();
  const cutoff = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  const next = Object.fromEntries(Object.entries({ ...all, [date]: { ...entry, savedAt: new Date().toISOString() } }).filter(([k]) => k >= cutoff));
  await persistence.savePref(KEY, next).catch(() => { });
  window.dispatchEvent(new CustomEvent('ride-feedback-changed', { detail: next }));
  return next;
}

