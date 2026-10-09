/**
 * When the athlete can ride: { 'YYYY-MM-DD': { off: true } | { minutes: 60 } }.
 * Days with no entry are "as planned"; minutes = the time the athlete has, which
 * becomes the session's length. Stored as one preference, past days pruned.
 */
import persistence from './persistence';

const KEY = 'availability';

export const AVAILABILITY_OPTIONS = [
  { value: '', label: 'Comme prévu' },
  { value: 'off', label: 'Pas dispo' },
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '1 h' },
  { value: '90', label: '1 h 30' },
  { value: '120', label: '2 h' },
  { value: '150', label: '2 h 30' },
  { value: '180', label: '3 h' },
  { value: '240', label: '4 h' },
];

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export async function loadAvailability() {
  const all = await persistence.getPref(KEY, {}).catch(() => ({}));
  const today = todayKey();
  return Object.fromEntries(Object.entries(all || {}).filter(([k]) => k >= today));
}

/** value: '' (as planned), 'off', or minutes as a string. Returns the new map. */
export async function setAvailability(date, value) {
  const all = await loadAvailability();
  if (!value) delete all[date];
  else all[date] = value === 'off' ? { off: true } : { minutes: Number(value) };
  await persistence.savePref(KEY, all).catch(() => { });
  window.dispatchEvent(new CustomEvent('availability-changed', { detail: all }));
  return all;
}

export function availabilityValue(entry) {
  if (!entry) return '';
  if (entry.off) return 'off';
  return entry.minutes ? String(entry.minutes) : '';
}

export function availabilityLabel(entry) {
  if (!entry) return null;
  if (entry.off) return 'Pas dispo';
  const m = entry.minutes;
  return m ? (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}` : `${m} min`) : null;
}
