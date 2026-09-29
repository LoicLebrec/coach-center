/**
 * Cloud Sync — backs up everything the app keeps in the browser to the backend
 * (api/user-store.js) so nothing is lost when browser data is cleared, and so
 * another browser/device gets the same plan, profile, journal, routes, etc.
 *
 * Covered: the localForage stores from persistence.js (except the API cache)
 * and the app's own localStorage keys (apex-*, nc_journal_*).
 * Each key carries a write timestamp; the newest write wins.
 * Only active when logged in (backendService token).
 */
import localforage from 'localforage';
import { backendService } from './backend-api';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// 'cached-data' is refetchable API cache — not worth backing up.
const SYNCED_STORES = ['credentials', 'coach-notes', 'preferences', 'coach', 'journal', 'planning'];
const META_KEY = 'apex-sync-meta';       // { key: lastWriteTs }
const PENDING_KEY = 'apex-sync-pending'; // [key] not yet pushed
const PUSH_DELAY_MS = 2000;
const MAX_CHUNK_CHARS = 3 * 1024 * 1024;

const isTrackedLocalKey = (k) =>
  (k.startsWith('apex-') && !k.startsWith('apex-sync-')) || k.startsWith('nc_journal_');

const instances = {};
const storeInstance = (name) =>
  instances[name] || (instances[name] = localforage.createInstance({ name: 'coach-center', storeName: name }));

// Raw localStorage accessors — bypass our own patch below.
const rawSet = Storage.prototype.setItem;
const rawRemove = Storage.prototype.removeItem;

const readJson = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
};
const writeJson = (key, value) => {
  try { rawSet.call(localStorage, key, JSON.stringify(value)); } catch { /* quota */ }
};

let meta = readJson(META_KEY, {});
let pending = new Set(readJson(PENDING_KEY, []));
let pushTimer = null;
let pushing = false;
let applying = false; // true while writing server data locally (don't echo back)

const saveState = () => {
  writeJson(META_KEY, meta);
  writeJson(PENDING_KEY, [...pending]);
};

function markDirty(key) {
  if (applying) return;
  meta[key] = Date.now();
  pending.add(key);
  saveState();
  schedulePush();
}

// ─── Key encoding ─────────────────────────────────────────────
const lfKey = (store, k) => `lf:${store}:${k}`;
const lsKey = (k) => `ls:${k}`;

function parseKey(key) {
  if (key.startsWith('ls:')) return { kind: 'ls', k: key.slice(3) };
  if (key.startsWith('lf:')) {
    const rest = key.slice(3);
    const i = rest.indexOf(':');
    return { kind: 'lf', store: rest.slice(0, i), k: rest.slice(i + 1) };
  }
  return null;
}

async function readLocal(key) {
  const p = parseKey(key);
  if (!p) return null;
  if (p.kind === 'ls') return localStorage.getItem(p.k);
  return storeInstance(p.store).getItem(p.k);
}

async function writeLocal(key, value) {
  const p = parseKey(key);
  if (!p) return;
  if (p.kind === 'ls') {
    if (value == null) rawRemove.call(localStorage, p.k);
    else rawSet.call(localStorage, p.k, value);
    return;
  }
  if (!SYNCED_STORES.includes(p.store)) return;
  if (value == null) await storeInstance(p.store).removeItem(p.k);
  else await storeInstance(p.store).setItem(p.k, value);
}

async function listLocalKeys() {
  const keys = [];
  for (const store of SYNCED_STORES) {
    try {
      (await storeInstance(store).keys()).forEach(k => keys.push(lfKey(store, k)));
    } catch { /* store unavailable */ }
  }
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && isTrackedLocalKey(k)) keys.push(lsKey(k));
  }
  return keys;
}

// ─── Write tracking ───────────────────────────────────────────

/** Wrap a localForage instance so its writes get backed up. */
export function trackStore(instance, storeName) {
  if (!SYNCED_STORES.includes(storeName)) return instance;
  const { setItem, removeItem, clear } = instance;
  instance.setItem = async (k, v, cb) => {
    const r = await setItem.call(instance, k, v, cb);
    markDirty(lfKey(storeName, k));
    return r;
  };
  instance.removeItem = async (k, cb) => {
    const r = await removeItem.call(instance, k, cb);
    markDirty(lfKey(storeName, k));
    return r;
  };
  instance.clear = async (cb) => {
    const keys = await instance.keys();
    const r = await clear.call(instance, cb);
    keys.forEach(k => markDirty(lfKey(storeName, k)));
    return r;
  };
  return instance;
}

// localStorage writes are spread across components — patch once, globally.
Storage.prototype.setItem = function (k, v) {
  rawSet.call(this, k, v);
  if (this === window.localStorage && isTrackedLocalKey(String(k))) markDirty(lsKey(String(k)));
};
Storage.prototype.removeItem = function (k) {
  rawRemove.call(this, k);
  if (this === window.localStorage && isTrackedLocalKey(String(k))) markDirty(lsKey(String(k)));
};

// ─── Network ──────────────────────────────────────────────────

async function api(method, body) {
  const res = await fetch(`${API_BASE_URL}/user-store`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${backendService.token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw Object.assign(new Error(`user-store ${method} ${res.status}`), { status: res.status });
  return res.json();
}

function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, PUSH_DELAY_MS);
}

async function push() {
  if (pushing || !pending.size || !backendService.isAuthenticated()) return;
  pushing = true;
  try {
    const keys = [...pending];
    let chunk = {};
    let size = 0;
    const sent = [];
    const flush = async () => {
      if (!sent.length) return;
      await api('PUT', { entries: chunk });
      // Only clear keys not rewritten while the request was in flight.
      sent.forEach(([k, t]) => { if (meta[k] === t) pending.delete(k); });
      saveState();
      chunk = {}; size = 0; sent.length = 0;
    };
    for (const key of keys) {
      const t = meta[key] || Date.now();
      const v = await readLocal(key);
      const entrySize = JSON.stringify(v ?? null).length;
      if (size && size + entrySize > MAX_CHUNK_CHARS) await flush();
      chunk[key] = { v: v ?? null, t };
      size += entrySize;
      sent.push([key, t]);
    }
    await flush();
  } catch (err) {
    console.warn('[cloudSync] push failed, will retry:', err.message);
  } finally {
    pushing = false;
  }
}

/**
 * Pull server state and merge (newest write wins), then queue any local-only
 * or newer local keys for upload. Returns the number of keys updated locally.
 */
async function pull() {
  const { entries } = await api('GET');
  let changed = 0;
  applying = true;
  try {
    for (const [key, { v, t }] of Object.entries(entries || {})) {
      if (t > (meta[key] || 0)) {
        await writeLocal(key, v);
        meta[key] = t;
        pending.delete(key);
        changed++;
      }
    }
  } finally {
    applying = false;
  }
  const now = Date.now();
  for (const key of await listLocalKeys()) {
    const server = entries?.[key];
    if (!meta[key]) meta[key] = now;
    if (!server || meta[key] > server.t) pending.add(key);
  }
  saveState();
  return changed;
}

let listenersBound = false;
function bindListeners() {
  if (listenersBound) return;
  listenersBound = true;
  window.addEventListener('online', push);
  document.addEventListener('visibilitychange', () => { if (document.hidden) push(); });
  setInterval(push, 60 * 1000);
}

const cloudSync = {
  /** Restore from server, then keep backing up. Never throws. */
  async start() {
    if (!backendService.isAuthenticated()) return 0;
    bindListeners();
    try {
      const changed = await pull();
      push();
      return changed;
    } catch (err) {
      console.warn('[cloudSync] restore failed:', err.message);
      return 0;
    }
  },
  push,
  pendingCount: () => pending.size,
};

export default cloudSync;
