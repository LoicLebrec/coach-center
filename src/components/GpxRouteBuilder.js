import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { LIBRARY_WORKOUTS as DEFAULT_LIBRARY_WORKOUTS } from '../data/workoutLibrary';
import persistence from '../services/persistence';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

// ── Constants ─────────────────────────────────────────────────
const SPEED_KMPH = {
  Ride: { Z1: 20, Z2: 27, Z3: 32, Z4: 36, Z5: 40 },
  Run:  { Z1:  7, Z2: 10, Z3: 13, Z4: 15, Z5: 17 },
};
const ZONES = [
  { id: 'Z1', label: 'Recovery' }, { id: 'Z2', label: 'Endurance' },
  { id: 'Z3', label: 'Tempo' },    { id: 'Z4', label: 'Threshold' },
  { id: 'Z5', label: 'VO2 Max' },
];
const ROUTE_COLORS  = ['#4d7fe8', '#3ecf6e', '#f77f3a'];
const SURFACE_PROFILES = {
  road:   'fastbike',
  quiet:  'safety',
  gravel: 'trekking',
  mtb:    'MTB',
};
const SURFACE_DESC = {
  road:   'Popular roads — popularity-weighted via BRouter',
  quiet:  'Avoids main roads — prefers cycle paths and back lanes',
  gravel: 'Off-road friendly — tracks, gravel paths, forest roads',
  mtb:    'Mountain bike trails and single-tracks',
};

// ── Tile providers ────────────────────────────────────────────
// Env key set in .env.local → REACT_APP_MAPTILER_KEY (applies to all users)
const ENV_MAPTILER_KEY = process.env.REACT_APP_MAPTILER_KEY || '';

function getTile(surface, sport, userKey) {
  const key = userKey || ENV_MAPTILER_KEY;
  const outdoor = sport !== 'Run' && (surface === 'gravel' || surface === 'mtb');
  if (key) {
    // MapTiler Outdoor — identical to Komoot aesthetic
    return {
      url: `https://api.maptiler.com/maps/outdoor-v2/{z}/{x}/{y}.png?key=${key}`,
      attr: '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; OpenStreetMap',
      maxZoom: 22,
    };
  }
  if (outdoor) {
    return {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attr: '&copy; Esri, Maxar',
      maxZoom: 19,
    };
  }
  return {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attr: '&copy; Esri, USGS, NOAA',
    maxZoom: 19,
  };
}

// ── Geocoding ─────────────────────────────────────────────────
let _lastGeoReq = 0;
async function reverseGeocode(lat, lng) {
  const wait = Math.max(0, 1050 - (Date.now() - _lastGeoReq));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  _lastGeoReq = Date.now();
  try {
    const res  = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=14`,
      { headers: { 'User-Agent': 'CoachCenter/1.0', 'Accept-Language': 'en' } }
    );
    const data = await res.json();
    const a    = data.address || {};
    return a.city || a.town || a.village || a.suburb || a.county
           || data.display_name?.split(',').slice(0, 2).join(', ')
           || coordStr(lat, lng);
  } catch (_) { return coordStr(lat, lng); }
}
async function searchPlaces(query) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`,
    { headers: { 'User-Agent': 'CoachCenter/1.0', 'Accept-Language': 'en' } }
  );
  return res.json();
}
function shortName(item) {
  const a = item.address || {};
  return [a.city || a.town || a.village || item.display_name?.split(',')[0], a.country].filter(Boolean).join(', ') || item.display_name;
}
function coordStr(lat, lng) {
  return `${Number(lat).toFixed(4)}°, ${Number(lng).toFixed(4)}°`;
}

// ── Geo helpers ───────────────────────────────────────────────
function haversineKm(a, b) {
  const R = 6371, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function routeDistanceKm(coords) {
  let d = 0;
  for (let i = 1; i < coords.length; i++) d += haversineKm({ lat: coords[i-1][1], lng: coords[i-1][0] }, { lat: coords[i][1], lng: coords[i][0] });
  return d;
}
function geodesicOffset(lat, lng, bearingDeg, distKm) {
  const R = 6371, d = distKm / R, b = (bearingDeg * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180, λ1 = (lng * Math.PI) / 180;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(b));
  const λ2 = λ1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(φ1), Math.cos(d) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: (φ2 * 180) / Math.PI, lng: ((λ2 * 180) / Math.PI + 540) % 360 - 180 };
}
function circleWaypoints(lat, lng, r, rot, n = 3) {
  return Array.from({ length: n }, (_, i) => geodesicOffset(lat, lng, rot + (i / n) * 360, r));
}

// ── OSRM (running) ─────────────────────────────────────────────
async function fetchOsrmTrip(startLat, startLng, wpts) {
  const pts = [{ lat: startLat, lng: startLng }, ...wpts, { lat: startLat, lng: startLng }];
  const co  = pts.map(p => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
  const res = await fetch(`https://router.project-osrm.org/trip/v1/foot/${co}?roundtrip=false&source=first&destination=last&overview=full&geometries=geojson`);
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const data = await res.json();
  if (data.code !== 'Ok') throw new Error('No route');
  return { coords: data.trips[0].geometry.coordinates, rawCoords: null };
}
async function fetchOsrmRoute(from, to) {
  const co  = `${from.lng.toFixed(5)},${from.lat.toFixed(5)};${to.lng.toFixed(5)},${to.lat.toFixed(5)}`;
  const res = await fetch(`https://router.project-osrm.org/route/v1/foot/${co}?overview=full&geometries=geojson`);
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const data = await res.json();
  if (data.code !== 'Ok') throw new Error('No route');
  return data.routes[0].geometry.coordinates;
}

// ── BRouter (cycling — includes elevation in response) ─────────
async function fetchBrouterRoute(from, to, profile) {
  const ll  = `${from.lng.toFixed(5)},${from.lat.toFixed(5)}|${to.lng.toFixed(5)},${to.lat.toFixed(5)}`;
  const res = await fetch(`https://brouter.de/brouter?lonlats=${ll}&profile=${profile}&alternativeidx=0&format=geojson`);
  if (!res.ok) throw new Error(`BRouter ${res.status}`);
  const data = await res.json();
  const raw  = data.features?.[0]?.geometry?.coordinates;
  if (!raw?.length) throw new Error('No route from BRouter');
  return raw.map(c => [c[0], c[1]]);   // [lng, lat] only — for draw segments
}
async function fetchBrouterTrip(startLat, startLng, wpts, profile) {
  const pts  = [{ lat: startLat, lng: startLng }, ...wpts, { lat: startLat, lng: startLng }];
  const ll   = pts.map(p => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join('|');
  const res  = await fetch(`https://brouter.de/brouter?lonlats=${ll}&profile=${profile}&alternativeidx=0&format=geojson`);
  if (!res.ok) throw new Error(`BRouter ${res.status}`);
  const data = await res.json();
  const raw  = data.features?.[0]?.geometry?.coordinates;
  if (!raw?.length) throw new Error('No route from BRouter');
  return {
    coords:    raw.map(c => [c[0], c[1]]),
    rawCoords: raw,   // [lng, lat, ele] — elevation included by BRouter
  };
}

// ── Surface-aware routing ─────────────────────────────────────
async function routeSegment(from, to, sport, surface) {
  if (sport === 'Run') return fetchOsrmRoute(from, to);
  return fetchBrouterRoute(from, to, SURFACE_PROFILES[surface] || 'fastbike');
}
async function routeTrip(startLat, startLng, wpts, sport, surface) {
  if (sport === 'Run') return fetchOsrmTrip(startLat, startLng, wpts);
  return fetchBrouterTrip(startLat, startLng, wpts, SURFACE_PROFILES[surface] || 'fastbike');
}
async function routeOutAndBack(startLat, startLng, halfKm, sport, surface, dir) {
  const mid = geodesicOffset(startLat, startLng, dir, halfKm);
  if (sport === 'Run') {
    const outC = await fetchOsrmRoute({ lat: startLat, lng: startLng }, mid);
    return { coords: [...outC, ...[...outC].reverse().slice(1)], rawCoords: null };
  }
  const { coords: outC, rawCoords: outR } = await fetchBrouterTrip(
    startLat, startLng, [mid], SURFACE_PROFILES[surface] || 'fastbike'
  );
  // out-and-back = route out, then reverse it
  return {
    coords:    [...outC, ...[...outC].reverse().slice(1)],
    rawCoords: outR ? [...outR, ...[...outR].reverse().slice(1)] : null,
  };
}

// ── Elevation / interval analysis ─────────────────────────────
/**
 * Scores a route's elevation profile for interval workouts.
 * BRouter returns [lng, lat, altitude] in rawCoords.
 * We find where the warmup ends and analyse the interval section.
 * Descents in the interval zone are penalised heavily.
 */
function scoreForIntervals(rawCoords, warmupKmDist) {
  if (!rawCoords?.length || rawCoords[0]?.length < 3) {
    return { score: 0.5, note: 'No elevation data', climbM: 0, descentM: 0, hasData: false };
  }

  // Find index where warmup distance is reached
  let cum = 0, warmupEnd = 0;
  for (let i = 1; i < rawCoords.length; i++) {
    cum += haversineKm({ lat: rawCoords[i-1][1], lng: rawCoords[i-1][0] },
                       { lat: rawCoords[i][1],   lng: rawCoords[i][0] });
    if (cum >= warmupKmDist && warmupEnd === 0) { warmupEnd = i; break; }
  }
  if (warmupEnd === 0) warmupEnd = Math.floor(rawCoords.length * 0.2);

  // Measure climb/descent in interval section
  const intPts = rawCoords.slice(warmupEnd);
  let descentM = 0, climbM = 0;
  for (let i = 1; i < intPts.length; i++) {
    const diff = (intPts[i][2] || 0) - (intPts[i-1][2] || 0);
    if (diff < 0) descentM += -diff;
    else           climbM  +=  diff;
  }

  // Penalty: >30m descent in interval zone = problematic
  const penalty  = Math.min(descentM / 40, 1);
  const bonus    = Math.min(climbM  / 300, 0.2);
  const score    = Math.max(0, 1 - penalty + bonus);

  let note;
  if (descentM > 40)  note = `${Math.round(descentM)}m descent in interval zone — not ideal`;
  else if (climbM > 80) note = `${Math.round(climbM)}m climbing in interval zone — good for efforts`;
  else                note = `Flat interval zone — suitable for power efforts`;

  return { score, note, climbM: Math.round(climbM), descentM: Math.round(descentM), hasData: true };
}

/**
 * Detects interval structure from a workout object.
 * Returns null if no intervals found.
 */
function detectIntervals(workout) {
  if (!workout) return null;
  const blocks = workout.workoutBlocks || workout.blocks || [];
  let warmupMin = 0;
  for (const b of blocks) {
    if (['Z1', 'Z2'].includes(b.zone)) warmupMin += Number(b.durationMin) || 0;
    else break;
  }
  const intervalBlocks = blocks.filter(b => ['Z4', 'Z5'].includes(b.zone));
  if (intervalBlocks.length < 2) return null;
  return { warmupMin, count: intervalBlocks.length };
}

// ── GPX export ────────────────────────────────────────────────
function downloadGpx(name, coords) {
  const pts  = coords.map(([lng, lat]) => `    <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"/>`).join('\n');
  const gpx  = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="CoachCenter APEX" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${name}</name><time>${new Date().toISOString()}</time></metadata>
  <trk><name>${name}</name><trkseg>\n${pts}\n  </trkseg></trk>
</gpx>`;
  const url  = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' }));
  const a    = document.createElement('a');
  a.href = url; a.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.gpx`; a.click();
  URL.revokeObjectURL(url);
}

// ── Workout helpers ───────────────────────────────────────────
function inferWorkoutProfile(w) {
  if (!w) return null;
  const blocks = Array.isArray(w.workoutBlocks) ? w.workoutBlocks : Array.isArray(w.blocks) ? w.blocks : [];
  const dur    = blocks.reduce((s, b) => s + (Number(b.durationMin) || 0), 0);
  const text   = `${w.title || w.name || ''} ${w.notes || ''}`;
  const sport  = /run/i.test(String(w.type || w.event_type || '')) ? 'Run' : 'Ride';
  const zone   = blocks[0]?.zone || (() => {
    const t = text.toLowerCase();
    if (/vo2|max|sprint/i.test(t)) return 'Z5';
    if (/threshold|ftp/i.test(t))  return 'Z4';
    if (/tempo/i.test(t))          return 'Z3';
    if (/recovery|easy/i.test(t))  return 'Z1';
    return 'Z2';
  })();
  const min = dur || (() => {
    const m = text.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (m) return Math.round((+m[1] + +m[2]) / 2);
    const mm = text.match(/(\d+)\s*min/i); if (mm) return +mm[1];
    return 90;
  })();
  return { sport, zone, duration: min };
}
function getTodayTraining(events = []) {
  const today = new Date().toISOString().slice(0, 10);
  return events.find(e => {
    const d = String(e.start_date_local || e.start_date || e.date || '').slice(0, 10);
    return d === today && !/rest|off day|full recovery/.test(`${e.title || ''} ${e.notes || ''}`.toLowerCase());
  }) || null;
}

// ── Leaflet helpers ───────────────────────────────────────────
function FitBounds({ coords }) {
  const map = useMap();
  useEffect(() => {
    if (!coords?.length) return;
    try { map.fitBounds(coords.map(([ln, la]) => [la, ln]), { padding: [60, 60] }); } catch (_) {}
  }, [coords, map]); // eslint-disable-line
  return null;
}
function MapClickHandler({ onMapClick, active }) {
  useMapEvents({ click: e => { if (active) onMapClick(e.latlng); } });
  return null;
}

// ── UI primitives ─────────────────────────────────────────────
const GLASS = {
  background: 'rgba(10, 10, 10, 0.88)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.07)',
  boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
};

function Fab({ onClick, disabled, children, active }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...GLASS,
      borderRadius: 10, padding: '9px 14px', cursor: disabled ? 'default' : 'pointer',
      fontFamily: 'var(--font-mono)', fontSize: 11, color: active ? 'var(--brand)' : 'var(--text-1)',
      border: `1px solid ${active ? 'var(--brand)' : 'rgba(255,255,255,0.07)'}`,
      whiteSpace: 'nowrap', display: 'block', width: '100%', textAlign: 'left',
      transition: 'all 0.15s', opacity: disabled ? 0.6 : 1,
    }}>
      {children}
    </button>
  );
}

function PillToggle({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 3, gap: 2 }}>
      {options.map(o => (
        <button key={o.id} onClick={() => onChange(o.id)} style={{
          flex: 1, padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
          fontSize: 11, fontFamily: 'var(--font-mono)', transition: 'all 0.15s',
          background: value === o.id ? 'rgba(255,255,255,0.10)' : 'transparent',
          color: value === o.id ? 'var(--text-0)' : 'var(--text-3)',
          fontWeight: value === o.id ? 600 : 400,
        }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function RouteRating({ value, onChange, readonly }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {[1,2,3,4,5].map(n => (
        <button key={n} onClick={() => !readonly && onChange && onChange(n)} style={{
          width: 11, height: 11, borderRadius: '50%', border: 'none', padding: 0,
          cursor: readonly ? 'default' : 'pointer',
          background: n <= (value || 0) ? 'var(--accent-yellow)' : 'rgba(255,255,255,0.12)',
          transition: 'background 0.15s',
        }} />
      ))}
      {(value || 0) > 0 && (
        <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginLeft: 2 }}>
          {value}/5
        </span>
      )}
    </div>
  );
}

const LABEL = { fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 6 };

// ── Main component ────────────────────────────────────────────
export default function GpxRouteBuilder({ athlete, events = [], plannedEvents = [], workoutLibrary = [], mapTilerKey: userKey = '' }) {
  // ── Location ───────────────────────────────────────────────
  const [startLat, setStartLat]   = useState('');
  const [startLng, setStartLng]   = useState('');
  const [startName, setStartName] = useState('');
  const [homeLat, setHomeLat]     = useState('');
  const [homeLng, setHomeLng]     = useState('');
  const [homeName, setHomeName]   = useState('');
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]         = useState(false);
  const [mapPickMode, setMapPickMode]     = useState(null);
  const [detectingLoc, setDetectingLoc]   = useState(false);
  const searchTimerRef = useRef(null);
  const wrapperRef     = useRef(null);

  // ── Route settings ─────────────────────────────────────────
  const [sport, setSport]       = useState('Ride');
  const [zone, setZone]         = useState('Z2');
  const [duration, setDuration] = useState(90);
  const [routeType, setRouteType] = useState('loop');
  const [surface, setSurface]   = useState('road');

  // ── Tabs ───────────────────────────────────────────────────
  const [tab, setTab] = useState('generate');

  // ── Generate ───────────────────────────────────────────────
  const [candidates, setCandidates] = useState([]);
  const [selected, setSelected]     = useState(0);
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError]     = useState(null);

  // ── Draw ───────────────────────────────────────────────────
  const [waypoints, setWaypoints]     = useState([]);
  const [segments, setSegments]       = useState([]);
  const [drawLoading, setDrawLoading] = useState(false);
  const [editingRoute, setEditingRoute] = useState(null);
  const [saveName, setSaveName]         = useState('');
  const waypointsRef = useRef([]);
  useEffect(() => { waypointsRef.current = waypoints; }, [waypoints]);

  // ── Saved ──────────────────────────────────────────────────
  const [savedRoutes, setSavedRoutes]   = useState([]);
  const [previewRoute, setPreviewRoute] = useState(null);
  const [ratingRoute, setRatingRoute]   = useState(null); // { id, rating, feedback }
  const [saveMsg, setSaveMsg]           = useState('');
  const [autoGenDone, setAutoGenDone]   = useState(false);

  const allPlanned    = [...(plannedEvents || []), ...(events || [])];
  const todayTraining = getTodayTraining(allPlanned);
  const effectiveLib  = (workoutLibrary.length ? workoutLibrary : DEFAULT_LIBRARY_WORKOUTS);
  const targetKm      = Math.round(((SPEED_KMPH[sport]?.[zone] || 27) * Number(duration)) / 60 * 10) / 10;

  // Interval detection for today's workout
  const todayIntervals = todayTraining ? detectIntervals(todayTraining) : null;
  const warmupKmEst    = todayIntervals
    ? Math.round((SPEED_KMPH[sport]?.Z2 || 27) * todayIntervals.warmupMin / 60 * 10) / 10
    : 0;

  const tile = getTile(surface, sport, userKey);

  // ── Init ───────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const prefs   = JSON.parse(localStorage.getItem('apex-gpx-prefs') || '{}');
        const profile = await persistence.getAthleteProfile();
        if (prefs.sport)    setSport(prefs.sport);
        if (prefs.zone)     setZone(prefs.zone);
        if (prefs.duration) setDuration(prefs.duration);
        if (prefs.surface)  setSurface(prefs.surface);
        const sLat = prefs.startLat || profile?.homeLat || '';
        const sLng = prefs.startLng || profile?.homeLng || '';
        const hLat = profile?.homeLat || prefs.homeLat || '';
        const hLng = profile?.homeLng || prefs.homeLng || '';
        if (sLat && sLng) {
          setStartLat(sLat); setStartLng(sLng); setStartName(prefs.startName || '');
          if (!prefs.startName) reverseGeocode(sLat, sLng).then(n => { setStartName(n); savePrefs({ startName: n }); });
        }
        if (hLat && hLng) {
          setHomeLat(hLat); setHomeLng(hLng); setHomeName(prefs.homeName || '');
          if (!prefs.homeName) reverseGeocode(hLat, hLng).then(n => { setHomeName(n); savePrefs({ homeName: n }); });
        }
        setSavedRoutes((await persistence.getRoutes()) || []);
      } catch (_) {}
    })();
  }, []); // eslint-disable-line

  const savePrefs = (patch) => {
    try {
      const prev = JSON.parse(localStorage.getItem('apex-gpx-prefs') || '{}');
      localStorage.setItem('apex-gpx-prefs', JSON.stringify({ ...prev, ...patch }));
    } catch (_) {}
  };
  useEffect(() => { savePrefs({ sport, zone, duration, surface }); }, [sport, zone, duration, surface]);

  // ── Search ─────────────────────────────────────────────────
  const handleSearch = (val) => {
    setSearchQuery(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!val.trim()) { setSearchResults([]); return; }
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try { setSearchResults(await searchPlaces(val)); } catch (_) {}
      finally { setSearching(false); }
    }, 600);
  };
  const applyResult = (item) => {
    const la = parseFloat(item.lat), ln = parseFloat(item.lon);
    const n  = shortName(item);
    setStartLat(String(la)); setStartLng(String(ln)); setStartName(n);
    savePrefs({ startLat: String(la), startLng: String(ln), startName: n });
    setSearchQuery(''); setSearchResults([]);
  };
  useEffect(() => {
    const h = e => { if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setSearchResults([]); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // ── Location ───────────────────────────────────────────────
  const handleDetectLocation = async () => {
    setDetectingLoc(true);
    const setLoc = async (la, ln) => {
      setStartLat(String(la)); setStartLng(String(ln)); setStartName('Resolving...');
      const n = await reverseGeocode(la, ln);
      setStartName(n); savePrefs({ startLat: String(la), startLng: String(ln), startName: n });
    };
    try {
      await new Promise((res, rej) =>
        navigator.geolocation
          ? navigator.geolocation.getCurrentPosition(p => { setLoc(p.coords.latitude, p.coords.longitude); res(); }, rej, { timeout: 10000 })
          : rej()
      );
    } catch (_) {
      try { const d = await (await fetch('https://ipapi.co/json/')).json(); if (d.latitude) await setLoc(d.latitude, d.longitude); } catch (_) {}
    }
    setDetectingLoc(false);
  };

  // ── Map click ──────────────────────────────────────────────
  const handleMapClick = useCallback(async ({ lat: la, lng: ln }) => {
    if (mapPickMode === 'start') {
      setStartLat(String(la)); setStartLng(String(ln)); setStartName('Resolving...');
      setMapPickMode(null);
      reverseGeocode(la, ln).then(n => { setStartName(n); savePrefs({ startLat: String(la), startLng: String(ln), startName: n }); });
      return;
    }
    if (mapPickMode === 'home') {
      setHomeLat(String(la)); setHomeLng(String(ln)); setHomeName('Resolving...');
      setMapPickMode(null);
      reverseGeocode(la, ln).then(n => { setHomeName(n); savePrefs({ homeLat: String(la), homeLng: String(ln), homeName: n }); });
      return;
    }
    if (tab !== 'draw') return;
    const idx  = waypointsRef.current.length;
    const newPt = { lat: la, lng: ln, name: coordStr(la, ln) };
    setWaypoints(pts => [...pts, newPt]);
    const prev = waypointsRef.current;
    if (prev.length > 0) {
      setDrawLoading(true);
      routeSegment(prev[prev.length - 1], newPt, sport, surface)
        .then(seg => setSegments(s => [...s, seg]))
        .catch(() => setSegments(s => [...s, []]))
        .finally(() => setDrawLoading(false));
    }
    reverseGeocode(la, ln).then(n => setWaypoints(pts => pts.map((p, i) => i === idx ? { ...p, name: n } : p)));
  }, [mapPickMode, tab, sport, surface]);

  // ── Waypoints ──────────────────────────────────────────────
  const recalcSegments = async (wpts) => {
    if (wpts.length < 2) { setSegments([]); return; }
    setDrawLoading(true);
    const results = await Promise.allSettled(wpts.slice(0, -1).map((p, i) => routeSegment(p, wpts[i+1], sport, surface)));
    setSegments(results.map(r => r.status === 'fulfilled' ? r.value : []));
    setDrawLoading(false);
  };
  const moveWaypoint = async (idx, dir) => {
    const j  = idx + dir;
    if (j < 0 || j >= waypoints.length) return;
    const nw = [...waypoints]; [nw[idx], nw[j]] = [nw[j], nw[idx]];
    setWaypoints(nw); await recalcSegments(nw);
  };
  const removeWaypoint = async (idx) => {
    const nw = waypoints.filter((_, i) => i !== idx);
    setWaypoints(nw); await recalcSegments(nw);
  };
  const clearDraw = () => { setWaypoints([]); setSegments([]); setEditingRoute(null); setSaveName(''); };

  const drawnCoords = segments.flat();
  const drawnDistKm = Math.round(routeDistanceKm(drawnCoords) * 10) / 10;
  const exportCoords = coords =>
    routeType === 'outback' && coords.length ? [...coords, ...[...coords].reverse().slice(1)] : coords;

  // ── Auto-generate from today ────────────────────────────────
  useEffect(() => {
    if (autoGenDone || !todayTraining || !startLat || !startLng) return;
    setAutoGenDone(true);
    const p = inferWorkoutProfile(todayTraining);
    if (!p) return;
    setSport(p.sport); setZone(p.zone); setDuration(p.duration);
    if (localStorage.getItem('apex-gpx-auto-day') === new Date().toISOString().slice(0, 10)) return;
    localStorage.setItem('apex-gpx-auto-day', new Date().toISOString().slice(0, 10));
    setTimeout(handleGenerate, 500);
  }, [autoGenDone, todayTraining, startLat, startLng]); // eslint-disable-line

  // ── Generate ───────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    const la = parseFloat(startLat), ln = parseFloat(startLng);
    if (isNaN(la) || isNaN(ln)) { setGenError('Set your start location first.'); return; }
    setGenError(null); setGenLoading(true); setCandidates([]);

    const rotations = routeType === 'outback' ? [0, 120, 240] : [0, 40, 80];
    const radius    = targetKm / (2 * Math.PI);
    const halfKm    = targetKm / 2;

    try {
      const results = await Promise.allSettled(
        rotations.map(rot =>
          routeType === 'outback'
            ? routeOutAndBack(la, ln, halfKm, sport, surface, rot)
            : routeTrip(la, ln, circleWaypoints(la, ln, radius, rot, 3), sport, surface)
        )
      );

      const valid = results.map((r, i) => {
        if (r.status !== 'fulfilled') return null;
        const { coords, rawCoords } = r.value;
        const dist = Math.round(routeDistanceKm(coords) * 10) / 10;

        // Elevation-based interval scoring
        let intScore = null;
        if (todayIntervals && rawCoords) {
          intScore = scoreForIntervals(rawCoords, warmupKmEst);
        }

        return { id: i, label: ['A','B','C'][i], coords, rawCoords, distanceKm: dist, intScore };
      }).filter(Boolean);

      if (!valid.length) throw new Error('No routes returned. Try a different start point.');

      // Sort: if interval workout detected, prioritise terrain score over distance accuracy
      const sorted = todayIntervals
        ? [...valid].sort((a, b) => {
            const scoreA = (a.intScore?.score ?? 0.5) - Math.abs(a.distanceKm - targetKm) / targetKm * 0.4;
            const scoreB = (b.intScore?.score ?? 0.5) - Math.abs(b.distanceKm - targetKm) / targetKm * 0.4;
            return scoreB - scoreA;
          })
        : [...valid].sort((a, b) => Math.abs(a.distanceKm - targetKm) - Math.abs(b.distanceKm - targetKm));

      setCandidates(sorted); setSelected(0);
    } catch (err) { setGenError(err.message || 'Route generation failed.'); }
    finally { setGenLoading(false); }
  }, [startLat, startLng, targetKm, sport, surface, routeType, todayIntervals, warmupKmEst]);

  // ── Save / delete / rate ───────────────────────────────────
  const handleSaveRoute = async (name, coords, distKm, rSport, rWaypoints) => {
    if (!coords?.length) return;
    const id    = editingRoute?.id || `route_${Date.now()}`;
    const route = { id, name: name.trim() || `Route ${new Date().toLocaleDateString()}`,
      date: new Date().toISOString().slice(0,10), sport: rSport || sport, zone, surface,
      distanceKm: distKm, coords, waypoints: rWaypoints || [], rating: 0, feedback: '' };
    const next  = await persistence.saveRoute(route);
    setSavedRoutes(next);
    setSaveMsg(`"${route.name}" saved.`);
    setEditingRoute(null);
    setTimeout(() => setSaveMsg(''), 3000);
  };
  const handleDeleteRoute = async (id) => {
    const next = await persistence.deleteRoute(id);
    setSavedRoutes(next);
    if (previewRoute?.id === id) setPreviewRoute(null);
  };
  const handleRateRoute = async (id, rating) => {
    const route = savedRoutes.find(r => r.id === id);
    if (!route) return;
    const updated = { ...route, rating };
    const next    = await persistence.saveRoute(updated);
    setSavedRoutes(next);
    setRatingRoute(r => r?.id === id ? { ...r, rating } : r);
  };
  const handleSaveFeedback = async (id, feedback) => {
    const route = savedRoutes.find(r => r.id === id);
    if (!route) return;
    const updated = { ...route, feedback };
    const next    = await persistence.saveRoute(updated);
    setSavedRoutes(next);
    setRatingRoute(null);
  };
  const handleEditRoute = (route) => {
    setTab('draw'); setEditingRoute(route); setSaveName(route.name);
    if (route.waypoints?.length >= 2) {
      setWaypoints(route.waypoints); recalcSegments(route.waypoints);
    } else {
      const c = route.coords || [];
      if (c.length >= 2) {
        const f = { lat: c[0][1], lng: c[0][0], name: 'Start' };
        const l = { lat: c[c.length-1][1], lng: c[c.length-1][0], name: 'End' };
        setWaypoints([f, l]); setSegments([c]);
      } else clearDraw();
    }
    setPreviewRoute(null);
  };

  // ── Map ────────────────────────────────────────────────────
  const mapCenter  = startLat && startLng ? [parseFloat(startLat), parseFloat(startLng)] : [46.2276, 2.2137];
  const mapCursor  = mapPickMode ? 'crosshair' : tab === 'draw' ? 'copy' : 'grab';
  const allGenCoords = candidates.flatMap(c => c.coords);
  const drawnPolylineColor = editingRoute ? '#f77f3a' : '#4d7fe8';

  // ── Render ─────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', height: '100vh', overflow: 'hidden', cursor: mapCursor }}>

      {/* ── Full-page map ──────────────────────────────────── */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <MapContainer center={mapCenter} zoom={12}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          <TileLayer url={tile.url} attribution={tile.attr} maxZoom={tile.maxZoom} />
          <MapClickHandler onMapClick={({ lat, lng }) => handleMapClick({ lat, lng })} active={!!(mapPickMode || tab === 'draw')} />

          {/* Generated routes */}
          {tab === 'generate' && candidates.map((c, i) => (
            <Polyline key={c.id}
              positions={c.coords.map(([ln, la]) => [la, ln])}
              pathOptions={{ color: ROUTE_COLORS[i], weight: i === selected ? 5 : 2.5, opacity: i === selected ? 1 : 0.28 }}
              eventHandlers={{ click: () => setSelected(i) }}
            />
          ))}

          {/* Draw mode */}
          {tab === 'draw' && segments.map((seg, i) => (
            <Polyline key={i} positions={seg.map(([ln, la]) => [la, ln])}
              pathOptions={{ color: drawnPolylineColor, weight: 4, opacity: 0.95 }} />
          ))}
          {tab === 'draw' && waypoints.map((pt, i) => <Marker key={i} position={[pt.lat, pt.lng]} />)}

          {/* Saved route preview */}
          {tab === 'saved' && previewRoute?.coords && (
            <Polyline positions={previewRoute.coords.map(([ln, la]) => [la, ln])}
              pathOptions={{ color: '#4d7fe8', weight: 4, opacity: 0.95 }} />
          )}

          {/* Start marker */}
          {startLat && startLng && tab !== 'draw' && (
            <Marker position={[parseFloat(startLat), parseFloat(startLng)]} />
          )}

          {/* Fit bounds */}
          {tab === 'generate' && allGenCoords.length > 0 && <FitBounds coords={allGenCoords} />}
          {tab === 'draw' && drawnCoords.length > 0 && <FitBounds coords={drawnCoords} />}
          {tab === 'saved' && previewRoute?.coords?.length > 0 && <FitBounds coords={previewRoute.coords} />}
        </MapContainer>
      </div>

      {/* ── Left floating panel ────────────────────────────── */}
      <div style={{
        ...GLASS, position: 'absolute', left: 14, top: 14, bottom: 14,
        width: 310, borderRadius: 16, zIndex: 1000,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Panel header */}
        <div style={{ padding: '16px 16px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.1em', marginBottom: 12 }}>
            ROUTE BUILDER {tile.url.includes('maptiler') ? '· MapTiler' : '· Esri'}
          </div>

          {/* Location search */}
          <div ref={wrapperRef} style={{ position: 'relative', marginBottom: 10 }}>
            <input
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8, padding: '8px 12px', color: 'var(--text-0)',
                fontFamily: 'var(--font-sans)', fontSize: 13, outline: 'none',
              }}
              placeholder={startLat ? (startName || 'Start set') : 'Search start location...'}
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
            />
            {(searchResults.length > 0 || searching) && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
                background: '#111', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8, marginTop: 4, overflow: 'hidden',
                boxShadow: '0 12px 40px rgba(0,0,0,0.8)',
              }}>
                {searching && <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>Searching...</div>}
                {searchResults.map((r, i) => (
                  <button key={i} onClick={() => applyResult(r)} style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px',
                    background: 'none', border: 'none',
                    borderBottom: i < searchResults.length-1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    cursor: 'pointer', color: 'var(--text-0)', fontSize: 13,
                  }}
                    onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    onMouseOut={e => e.currentTarget.style.background = 'none'}
                  >
                    <div style={{ fontWeight: 500 }}>{shortName(r)}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>{Number(r.lat).toFixed(3)}, {Number(r.lon).toFixed(3)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Location quick actions */}
          {startLat && startLng && (
            <div style={{ display: 'flex', gap: 5, marginBottom: 10, flexWrap: 'wrap' }}>
              {homeLat && <button onClick={() => { setStartLat(homeLat); setStartLng(homeLng); setStartName(homeName); }} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>Use home</button>}
              {!homeLat && <button onClick={async () => { setHomeLat(startLat); setHomeLng(startLng); setHomeName(startName); const p = await persistence.getAthleteProfile(); await persistence.saveAthleteProfile({ ...(p||{}), homeLat: startLat, homeLng: startLng }); savePrefs({ homeLat: startLat, homeLng: startLng, homeName: startName }); }} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>Save as home</button>}
              <button onClick={() => setMapPickMode('start')} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, background: mapPickMode === 'start' ? 'var(--brand-dim)' : 'rgba(255,255,255,0.06)', border: `1px solid ${mapPickMode === 'start' ? 'var(--brand)' : 'rgba(255,255,255,0.08)'}`, color: mapPickMode === 'start' ? 'var(--brand)' : 'var(--text-2)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>Set on map</button>
              <button onClick={() => { setStartLat(''); setStartLng(''); setStartName(''); }} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>Clear</button>
            </div>
          )}

          {/* Route settings */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <select value={sport} onChange={e => setSport(e.target.value)} style={{
              flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 7, padding: '6px 8px', color: 'var(--text-0)', fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
            }}>
              <option value="Ride">Cycling</option>
              <option value="Run">Running</option>
            </select>
            <select value={zone} onChange={e => setZone(e.target.value)} style={{
              flex: 1.5, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 7, padding: '6px 8px', color: 'var(--text-0)', fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
            }}>
              {ZONES.map(z => <option key={z.id} value={z.id}>{z.id} — {z.label}</option>)}
            </select>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, padding: '0 8px' }}>
              <input type="number" min="20" max="360" value={duration} onChange={e => setDuration(e.target.value)}
                style={{ background: 'none', border: 'none', width: 36, color: 'var(--text-0)', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, outline: 'none', textAlign: 'right' }} />
              <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>m</span>
            </div>
          </div>

          {sport === 'Ride' && (
            <div style={{ marginBottom: 8 }}>
              <PillToggle options={[{id:'road',label:'Road'},{id:'quiet',label:'Quiet'},{id:'gravel',label:'Gravel'},{id:'mtb',label:'MTB'}]} value={surface} onChange={setSurface} />
              <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: 4, lineHeight: 1.5 }}>{SURFACE_DESC[surface]}</div>
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <PillToggle options={[{id:'loop',label:'Loop'},{id:'outback',label:'Out & Back'}]} value={routeType} onChange={setRouteType} />
          </div>

          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: 0, marginLeft: -16, marginRight: -16 }}>
            {[
              { id: 'generate', label: 'Generate' },
              { id: 'draw',     label: editingRoute ? 'Editing' : 'Draw' },
              { id: 'saved',    label: `Saved (${savedRoutes.length})` },
            ].map(t => {
              const isEditTab = t.id === 'draw' && !!editingRoute;
              return (
                <button key={t.id} onClick={() => setTab(t.id)} style={{
                  flex: 1, padding: '9px 4px', background: 'none', border: 'none',
                  cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11,
                  color: tab === t.id ? (isEditTab ? 'var(--accent-orange)' : 'var(--text-0)') : 'var(--text-3)',
                  borderBottom: `2px solid ${tab === t.id ? (isEditTab ? 'var(--accent-orange)' : 'var(--brand)') : 'transparent'}`,
                  fontWeight: tab === t.id ? 700 : 400, transition: 'all 0.15s',
                }}>
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Panel body (scrollable) */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>

          {/* ── GENERATE TAB ──────────────────────────────── */}
          {tab === 'generate' && (
            <div>
              {/* Interval warning */}
              {todayIntervals && (
                <div style={{
                  marginBottom: 10, padding: '9px 12px', borderRadius: 8,
                  background: 'rgba(77,127,232,0.1)', border: '1px solid rgba(77,127,232,0.25)',
                  fontSize: 11, lineHeight: 1.5,
                }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--brand)', marginBottom: 3 }}>INTERVAL WORKOUT DETECTED</div>
                  <div style={{ color: 'var(--text-1)' }}>
                    {todayIntervals.count}x intervals after ~{todayIntervals.warmupMin}min warmup
                    ({warmupKmEst} km warm-up distance).
                  </div>
                  <div style={{ color: 'var(--text-3)', marginTop: 2 }}>
                    Routes are ranked by terrain suitability — prefer flat or uphill for interval zones.
                  </div>
                </div>
              )}

              {/* Today's training */}
              {todayTraining && !todayIntervals && (
                <div style={{
                  marginBottom: 10, padding: '9px 12px', borderRadius: 8,
                  background: 'rgba(77,127,232,0.08)', border: '1px solid rgba(77,127,232,0.18)',
                }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--brand)', marginBottom: 2 }}>TODAY</div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{todayTraining.title || todayTraining.name}</div>
                  <button style={{ fontSize: 10, marginTop: 6, padding: '3px 8px', borderRadius: 5, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
                    onClick={() => { const p = inferWorkoutProfile(todayTraining); if (p) { setSport(p.sport); setZone(p.zone); setDuration(p.duration); } }}>
                    Use for route
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--brand)', fontWeight: 700 }}>
                  ~{targetKm} km target
                </div>
                <button onClick={handleGenerate} disabled={genLoading || !startLat} style={{
                  padding: '8px 16px', borderRadius: 8, cursor: (genLoading || !startLat) ? 'default' : 'pointer',
                  background: startLat ? 'var(--brand)' : 'rgba(255,255,255,0.06)',
                  border: 'none', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600,
                  opacity: genLoading ? 0.7 : 1, transition: 'all 0.15s',
                }}>
                  {genLoading ? 'Routing...' : 'Generate'}
                </button>
              </div>

              {genError && (
                <div style={{ padding: '8px 12px', background: 'rgba(240,96,96,0.12)', border: '1px solid rgba(240,96,96,0.3)', borderRadius: 7, fontSize: 11, color: 'var(--accent-red)', marginBottom: 10 }}>
                  {genError}
                </div>
              )}

              {/* Route cards */}
              {candidates.map((c, i) => (
                <div key={c.id} onClick={() => setSelected(i)} style={{
                  padding: '10px 12px', borderRadius: 10, marginBottom: 7, cursor: 'pointer',
                  background: i === selected ? `${ROUTE_COLORS[i]}14` : 'rgba(255,255,255,0.03)',
                  border: `1.5px solid ${i === selected ? ROUTE_COLORS[i] : 'rgba(255,255,255,0.06)'}`,
                  transition: 'all 0.15s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: ROUTE_COLORS[i], marginBottom: 3 }}>
                        Route {c.label}{i === 0 ? ' — best' : ''}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700 }}>{c.distanceKm} km</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
                        {Math.abs(c.distanceKm - targetKm).toFixed(1)} km off target
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {c.intScore?.hasData && (
                        <>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: c.intScore.descentM > 40 ? 'var(--accent-orange)' : 'var(--accent-green)', letterSpacing: '0.06em', marginBottom: 2 }}>
                            {c.intScore.descentM > 40 ? 'DESCENT IN INT. ZONE' : 'GOOD TERRAIN'}
                          </div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)' }}>
                            +{c.intScore.climbM}m / -{c.intScore.descentM}m
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  {c.intScore?.note && (
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 5, fontFamily: 'var(--font-mono)', lineHeight: 1.4 }}>
                      {c.intScore.note}
                    </div>
                  )}
                </div>
              ))}

              {candidates.length > 0 && (
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button onClick={() => downloadGpx(`${sport}-${zone}-${candidates[selected]?.distanceKm}km`, exportCoords(candidates[selected]?.coords || []))}
                    style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--brand)', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600 }}>
                    Download GPX
                  </button>
                  <button onClick={() => handleSaveRoute(`${sport} ${zone} ${candidates[selected]?.distanceKm}km`, exportCoords(candidates[selected]?.coords || []), candidates[selected]?.distanceKm, sport, [])}
                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', color: 'var(--text-1)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    Save
                  </button>
                </div>
              )}
              {saveMsg && <div style={{ fontSize: 11, color: 'var(--accent-green)', marginTop: 8, fontFamily: 'var(--font-mono)' }}>{saveMsg}</div>}
            </div>
          )}

          {/* ── DRAW TAB ──────────────────────────────────── */}
          {tab === 'draw' && (
            <div>
              {editingRoute ? (
                <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(247,127,58,0.1)', border: '1px solid rgba(247,127,58,0.3)' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent-orange)', marginBottom: 2 }}>EDITING</div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{editingRoute.name}</div>
                  <button onClick={clearDraw} style={{ fontSize: 10, marginTop: 4, padding: '2px 8px', borderRadius: 5, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>Cancel</button>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10, lineHeight: 1.5, fontFamily: 'var(--font-mono)' }}>
                  Click the map to place waypoints. Segments snap to roads via {sport === 'Run' ? 'OSRM' : 'BRouter'}.
                </div>
              )}

              {waypoints.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  {waypoints.map((pt, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 7, marginBottom: 3, border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: ROUTE_COLORS[i % 3], fontWeight: 700, minWidth: 16 }}>{i+1}</div>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-1)' }}>{pt.name}</div>
                      <div style={{ display: 'flex', gap: 3 }}>
                        <button onClick={() => moveWaypoint(i,-1)} disabled={i===0} style={{ padding:'2px 5px', fontSize:10, borderRadius:4, background:'none', border:'1px solid rgba(255,255,255,0.08)', color:'var(--text-3)', cursor:'pointer', opacity:i===0?0.3:1, fontFamily:'var(--font-mono)' }}>up</button>
                        <button onClick={() => moveWaypoint(i,1)} disabled={i===waypoints.length-1} style={{ padding:'2px 5px', fontSize:10, borderRadius:4, background:'none', border:'1px solid rgba(255,255,255,0.08)', color:'var(--text-3)', cursor:'pointer', opacity:i===waypoints.length-1?0.3:1, fontFamily:'var(--font-mono)' }}>dn</button>
                        <button onClick={() => removeWaypoint(i)} style={{ padding:'2px 5px', fontSize:10, borderRadius:4, background:'none', border:'1px solid rgba(255,255,255,0.08)', color:'var(--accent-red)', cursor:'pointer', fontFamily:'var(--font-mono)' }}>rm</button>
                      </div>
                    </div>
                  ))}
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 8px', fontFamily:'var(--font-mono)', fontSize:11, color:'var(--brand)', marginTop:4 }}>
                    <span>{drawnDistKm} km · {waypoints.length} pts {routeType==='outback' ? `(${(drawnDistKm*2).toFixed(1)}km total)` : ''}</span>
                    {drawLoading && <span style={{color:'var(--text-3)'}}>routing...</span>}
                  </div>
                </div>
              )}

              {waypoints.length > 1 && drawnCoords.length > 0 && (
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  <input value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="Route name..."
                    style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:7, padding:'7px 10px', color:'var(--text-0)', fontFamily:'var(--font-mono)', fontSize:11, outline:'none' }} />
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={() => downloadGpx(saveName || `drawn-${drawnDistKm}km`, exportCoords(drawnCoords))}
                      style={{ flex:1, padding:'7px', borderRadius:7, border:'1px solid rgba(255,255,255,0.1)', cursor:'pointer', background:'rgba(255,255,255,0.05)', color:'var(--text-1)', fontFamily:'var(--font-mono)', fontSize:11 }}>
                      GPX
                    </button>
                    <button onClick={() => handleSaveRoute(saveName, exportCoords(drawnCoords), routeType==='outback'?drawnDistKm*2:drawnDistKm, sport, waypoints)}
                      style={{ flex:1, padding:'7px', borderRadius:7, border:'none', cursor:'pointer', background: editingRoute ? 'var(--accent-orange)' : 'var(--brand)', color:'#fff', fontFamily:'var(--font-mono)', fontSize:11, fontWeight:600 }}>
                      {editingRoute ? 'Save Changes' : 'Save'}
                    </button>
                  </div>
                </div>
              )}

              {waypoints.length > 0 && (
                <button onClick={clearDraw} style={{ marginTop:8, width:'100%', padding:'6px', borderRadius:7, border:'1px solid rgba(255,255,255,0.07)', cursor:'pointer', background:'none', color:'var(--text-3)', fontFamily:'var(--font-mono)', fontSize:10 }}>
                  Clear all
                </button>
              )}
              {saveMsg && <div style={{ fontSize:11, color:'var(--accent-green)', marginTop:8, fontFamily:'var(--font-mono)' }}>{saveMsg}</div>}
            </div>
          )}

          {/* ── SAVED TAB ─────────────────────────────────── */}
          {tab === 'saved' && (
            <div>
              {savedRoutes.length === 0 ? (
                <div style={{ padding:'32px 0', textAlign:'center', color:'var(--text-3)', fontSize:12, fontFamily:'var(--font-mono)' }}>
                  No saved routes yet.
                </div>
              ) : (
                savedRoutes.map(r => (
                  <div key={r.id} style={{
                    marginBottom: 8, borderRadius: 10, overflow: 'hidden',
                    background: previewRoute?.id === r.id ? 'rgba(77,127,232,0.08)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${previewRoute?.id === r.id ? 'rgba(77,127,232,0.35)' : 'rgba(255,255,255,0.07)'}`,
                    transition: 'all 0.15s',
                  }}>
                    <div onClick={() => setPreviewRoute(previewRoute?.id === r.id ? null : r)}
                      style={{ padding:'10px 12px', cursor:'pointer' }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                        <div style={{ fontSize:12, fontWeight:600, color:'var(--text-0)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{r.name}</div>
                        <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-3)', marginLeft:8 }}>{previewRoute?.id===r.id ? 'hide' : 'show'}</div>
                      </div>
                      <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-3)', marginTop:3 }}>
                        {r.date} · {r.sport} · {r.zone}{r.surface&&r.surface!=='road'?` · ${r.surface}`:''} · {r.distanceKm} km
                      </div>
                      {/* Rating */}
                      <div style={{ marginTop:6 }}>
                        <RouteRating value={r.rating || 0} onChange={n => handleRateRoute(r.id, n)} />
                      </div>
                    </div>

                    {/* Rating feedback panel */}
                    {ratingRoute?.id === r.id && (
                      <div style={{ padding:'0 12px 10px', borderTop:'1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-3)', margin:'8px 0 5px' }}>Optional feedback (helps improve future routes)</div>
                        <textarea
                          defaultValue={r.feedback || ''}
                          onChange={e => setRatingRoute(rv => ({...rv, feedbackText: e.target.value}))}
                          placeholder="What was good or bad about this route?"
                          style={{ width:'100%', boxSizing:'border-box', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:6, padding:'6px 8px', color:'var(--text-0)', fontFamily:'var(--font-mono)', fontSize:10, resize:'vertical', minHeight:50, outline:'none' }}
                        />
                        <div style={{ display:'flex', gap:5, marginTop:6 }}>
                          <button onClick={() => handleSaveFeedback(r.id, ratingRoute.feedbackText || r.feedback || '')}
                            style={{ flex:1, padding:'5px', borderRadius:6, border:'none', cursor:'pointer', background:'var(--brand)', color:'#fff', fontFamily:'var(--font-mono)', fontSize:10, fontWeight:600 }}>Save feedback</button>
                          <button onClick={() => setRatingRoute(null)}
                            style={{ padding:'5px 10px', borderRadius:6, border:'1px solid rgba(255,255,255,0.08)', cursor:'pointer', background:'none', color:'var(--text-3)', fontFamily:'var(--font-mono)', fontSize:10 }}>Skip</button>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ padding:'7px 10px', borderTop:'1px solid rgba(255,255,255,0.05)', display:'flex', gap:5 }}>
                      <button onClick={() => { handleRateRoute(r.id, r.rating||0); setRatingRoute({id:r.id, rating:r.rating||0}); }}
                        style={{ fontSize:10, padding:'3px 8px', borderRadius:5, background:'none', border:'1px solid rgba(255,255,255,0.08)', color:'var(--text-3)', cursor:'pointer', fontFamily:'var(--font-mono)' }}>Rate</button>
                      <button onClick={() => handleEditRoute(r)}
                        style={{ fontSize:10, padding:'3px 8px', borderRadius:5, background:'none', border:'1px solid rgba(255,255,255,0.08)', color:'var(--text-3)', cursor:'pointer', fontFamily:'var(--font-mono)' }}>Edit</button>
                      <button onClick={() => downloadGpx(r.name, r.coords)}
                        style={{ fontSize:10, padding:'3px 8px', borderRadius:5, background:'none', border:'1px solid rgba(255,255,255,0.08)', color:'var(--text-3)', cursor:'pointer', fontFamily:'var(--font-mono)' }}>GPX</button>
                      <button onClick={() => handleDeleteRoute(r.id)}
                        style={{ fontSize:10, padding:'3px 8px', borderRadius:5, background:'none', border:'1px solid rgba(255,255,255,0.08)', color:'var(--accent-red)', cursor:'pointer', fontFamily:'var(--font-mono)', marginLeft:'auto' }}>Del</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── FABs — top right ───────────────────────────────── */}
      <div style={{ position:'absolute', top:14, right:14, zIndex:1000, display:'flex', flexDirection:'column', gap:6, width:130 }}>
        <Fab onClick={handleDetectLocation} disabled={detectingLoc}>
          {detectingLoc ? 'Locating...' : 'My Location'}
        </Fab>
        {(startLat && !homeLat) && (
          <Fab onClick={async () => { setHomeLat(startLat); setHomeLng(startLng); setHomeName(startName); const p = await persistence.getAthleteProfile(); await persistence.saveAthleteProfile({...(p||{}),homeLat:startLat,homeLng:startLng}); savePrefs({homeLat:startLat,homeLng:startLng,homeName:startName}); }}>
            Set as Home
          </Fab>
        )}
        {mapPickMode && (
          <Fab onClick={() => setMapPickMode(null)} active>Cancel pick</Fab>
        )}
      </div>

      {/* ── Map instruction overlay ─────────────────────────── */}
      {(mapPickMode || (tab === 'draw' && !mapPickMode)) && (
        <div style={{
          position:'absolute', bottom: 24, left:'50%', transform:'translateX(-50%)',
          zIndex:1000, pointerEvents:'none',
          padding:'7px 18px', borderRadius:20,
          background: mapPickMode ? 'rgba(77,127,232,0.9)' : editingRoute ? 'rgba(247,127,58,0.85)' : 'rgba(0,0,0,0.72)',
          color:'#fff', fontSize:12, fontFamily:'var(--font-mono)',
          backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)',
          boxShadow:'0 4px 20px rgba(0,0,0,0.5)',
        }}>
          {mapPickMode
            ? `Click map to set ${mapPickMode} location`
            : editingRoute ? 'Editing — click to add waypoints'
            : 'Click map to add waypoints'}
        </div>
      )}
    </div>
  );
}
