/**
 * Pushes today's decision to the backend so the widgets (Scriptable on iOS,
 * GNOME extension) can read it without the app being open. `context` carries
 * what the morning cron needs to recompute the day server-side.
 * Silently no-ops when the user is not signed in to the backend.
 */

import { backendService } from './backend-api';

const LAST_KEY = 'coach_widget_last';

export async function pushWidgetSnapshot(snapshot, context = null) {
  if (!backendService.isAuthenticated()) return;
  // generatedAt changes every time — compare the rest to skip identical pushes.
  const { generatedAt, ...rest } = snapshot;
  const sig = JSON.stringify([rest, context]);
  try {
    if (localStorage.getItem(LAST_KEY) === sig) return;
  } catch { /* storage unavailable */ }
  try {
    await backendService.saveWidgetSnapshot(snapshot, context);
    try { localStorage.setItem(LAST_KEY, sig); } catch { /* ignore */ }
  } catch (err) {
    console.warn('[widget] snapshot push failed:', err.message);
  }
}

export function widgetFeedUrl(token) {
  const base = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
  const abs = /^https?:/.test(base) ? base : `${window.location.origin}${base.startsWith('/') ? '' : '/'}${base}`;
  return `${abs.replace(/\/$/, '')}/widget/feed/${token}`;
}
