import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, Tooltip, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
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
// Fallback speeds (km/h) when no FTP/weight data available
const SPEED_KMPH = {
  Ride: { Z1: 20, Z2: 27, Z3: 32, Z4: 36, Z5: 40 },
  Run: { Z1: 7, Z2: 10, Z3: 13, Z4: 15, Z5: 17 },
};

// Zone intensity as fraction of FTP
const ZONE_FTP_FRACTION = { Z1: 0.55, Z2: 0.70, Z3: 0.85, Z4: 1.00, Z5: 1.12 };

// Physics per surface: CRR (rolling resistance coeff) + CdA (drag area m²)
// Road: asphalt / aerodynamic position
// Quiet: mixed paved / relaxed position
// Gravel: packed gravel / upright position — much higher rolling resistance
// MTB: off-road terrain / standing/upright
const SURFACE_PHYSICS = {
  road: { crr: 0.004, cda: 0.32 },
  quiet: { crr: 0.007, cda: 0.36 },
  gravel: { crr: 0.030, cda: 0.40 },
  mtb: { crr: 0.050, cda: 0.50 },
};

// Multiplier applied to fallback table speeds when no FTP available
const SURFACE_SPEED_FACTOR = { road: 1.0, quiet: 0.90, gravel: 0.68, mtb: 0.56 };

// Solve v (km/h) from flat-road power equation using Newton-Raphson.
// P = 0.5·CdA·ρ·v³ + Crr·mass·g·v
// Solve flat-road speed from power: P = 0.5·CdA·ρ·v³ + Crr·m·g·v
function solveSpeedKmh(powerW, massKg, crr, cda, rho = 1.225, g = 9.81) {
  if (powerW <= 0 || massKg <= 0) return 0;
  let v = 7;
  for (let i = 0; i < 80; i++) {
    const f = 0.5 * cda * rho * v * v * v + crr * massKg * g * v - powerW;
    const df = 1.5 * cda * rho * v * v + crr * massKg * g;
    if (Math.abs(df) < 1e-10) break;
    const dv = f / df;
    v = Math.max(0.5, v - dv);
    if (Math.abs(dv) < 1e-4) break;
  }
  return v * 3.6;
}

// Same but with a road grade (dimensionless, e.g. 0.05 = 5% climb).
// P = 0.5·CdA·ρ·v³ + (Crr + grade)·m·g·v
function solveSpeedKmhGrade(powerW, massKg, crr, cda, grade, rho = 1.225, g = 9.81) {
  if (powerW <= 0 || massKg <= 0) return 1;
  const eff = crr + Math.max(-0.06, Math.min(0.18, grade)); // clamp extreme grades
  let v = Math.max(0.5, 7 - grade * 25);
  for (let i = 0; i < 80; i++) {
    const f = 0.5 * cda * rho * v * v * v + eff * massKg * g * v - powerW;
    const df = 1.5 * cda * rho * v * v + eff * massKg * g;
    if (Math.abs(df) < 1e-10) break;
    const dv = f / df;
    v = Math.max(0.3, v - dv);
    if (Math.abs(dv) < 1e-4) break;
  }
  return Math.max(1, v * 3.6);
}

// Estimate time (min) to ride a route using actual elevation from BRouter rawCoords.
// powerW is the sustained power for the effort (e.g. average across blocks).
function estimateRouteTimeMin(rawCoords, powerW, massKg, crr, cda) {
  if (!rawCoords?.length || rawCoords[0]?.length < 3 || powerW <= 0) return null;
  let totalH = 0;
  for (let i = 1; i < rawCoords.length; i++) {
    const segKm = haversineKm(
      { lat: rawCoords[i - 1][1], lng: rawCoords[i - 1][0] },
      { lat: rawCoords[i][1], lng: rawCoords[i][0] }
    );
    if (segKm < 1e-6) continue;
    const dEle = (rawCoords[i][2] || 0) - (rawCoords[i - 1][2] || 0);
    const grade = dEle / (segKm * 1000);
    totalH += segKm / solveSpeedKmhGrade(powerW, massKg, crr, cda, grade);
  }
  return Math.round(totalH * 60);
}

// ── Unified route scoring ─────────────────────────────────────────────────────
// Models route quality as a linear combination of three components:
//   time match  : how close terrain-adjusted time is to planned duration
//   interval terrain : how suitable the hard-effort section terrain is
//   route shape : absence of U-turns and zigzags
//
// Weights are derived from the workout's interval load:
//   intervalLoad ≈ 0  (Z1/Z2 endurance) → time match dominates
//   intervalLoad ≈ 1  (many Z5 VO2 blocks) → terrain quality dominates
//
// This makes the model "endogenous from the training" — the workout structure
// itself determines what we optimise for, not a hardcoded branching condition.
function routeFitScore(candidate, { duration, targetKm, intervalLoad, terrainPref }) {
  const { shape, intScore, elevation, estTimeMin, distanceKm } = candidate;

  // Time match — prefer terrain-adjusted estimate; fall back to distance ratio
  const plannedMin = Number(duration);
  const timeDevFraction = estTimeMin != null
    ? Math.abs(estTimeMin - plannedMin) / Math.max(1, plannedMin)
    : Math.abs(distanceKm - targetKm) / Math.max(1, targetKm);
  // Quadratic so small deviations are tolerated but large ones are penalised hard
  const timeScore = Math.max(0, 1 - (timeDevFraction / 0.40) ** 2);

  // Interval terrain — scoreForIntervals already looks only at the post-warmup section;
  // when no interval data available, neutral score adjusted for whether load is high
  const terrainScore = intScore?.score ?? (intervalLoad > 0.3 ? 0.40 : 0.65);

  // Route shape — clean turns, penalise each U-turn explicitly
  const shapeScore = Math.max(0, (shape?.score ?? 0.5) - (shape?.uTurns || 0) * 0.25);

  // Terrain preference bonus (flat / hilly bias)
  let prefBonus = 0;
  if (elevation?.hasData) {
    if (terrainPref === 'flat') prefBonus = -Math.min(elevation.climbM / 400, 0.25);
    if (terrainPref === 'hilly') prefBonus = Math.min(elevation.climbM / 600, 0.25);
  }

  // Weights derived from intervalLoad — sum to ~0.85 + prefBonus
  const wTime = Math.max(0.20, 0.55 - intervalLoad * 0.45);
  const wTerrain = intervalLoad * 0.55;
  const wShape = 0.15;

  return timeScore * wTime + terrainScore * wTerrain + shapeScore * wShape + prefBonus;
}
const ZONES = [
  { id: 'Z1', label: 'Recovery' }, { id: 'Z2', label: 'Endurance' },
  { id: 'Z3', label: 'Tempo' }, { id: 'Z4', label: 'Threshold' },
  { id: 'Z5', label: 'VO2 Max' },
];
const ROUTE_COLORS = ['#4d7fe8', '#3ecf6e', '#f77f3a'];
// Primary BRouter profile, then fallback chain if server rejects it.
// BRouter public server: https://brouter.de/brouter
const SURFACE_PROFILES = {
  road: 'fastbike-road',   // strictly paved/asphalt; falls back to fastbike
  quiet: 'safety',         // quieter paved roads
  gravel: 'trekking',      // unpaved tracks & gravel
  mtb: 'MTB',              // mountain bike trails
};
const SURFACE_PROFILE_FALLBACK = {
  'fastbike-road': 'fastbike',
};
const SURFACE_DESC = {
  road: 'Asphalt only — avoids gravel, tracks and unpaved surfaces',
  quiet: 'Quieter paved roads — avoids main roads, prefers cycle paths',
  gravel: 'Off-road friendly — tracks, gravel paths, forest roads',
  mtb: 'Mountain bike trails and single-tracks',
};
const ZONE_COLORS = {
  Z1: '#94a3b8',
  Z2: '#22c55e',
  Z3: '#eab308',
  Z4: '#f97316',
  Z5: '#ef4444',
};

// ── POI categories ────────────────────────────────────────────
const POI_CATEGORIES = [
  { id: 'bicycle_shop', label: 'Bike Shops', icon: '🚲', color: '#4d7fe8', overpass: '"shop"="bicycle"' },
  { id: 'cafe', label: 'Cafes', icon: '☕', color: '#f77f3a', overpass: '"amenity"="cafe"' },
  { id: 'viewpoint', label: 'Viewpoints', icon: '🔭', color: '#3ecf6e', overpass: '"tourism"="viewpoint"' },
  { id: 'peak', label: 'Peaks', icon: '⛰', color: '#e8a84d', overpass: '"natural"="peak"' },
];

function poiCategory(type) {
  return POI_CATEGORIES.find(c => c.id === type) || { label: type, icon: '📍', color: '#888' };
}

function humanizeMapTag(value) {
  return String(value || '')
    .split(';')
    .map(v => v.trim())
    .filter(Boolean)
    .map(v => v.replace(/_/g, ' '))
    .join(', ');
}

function poiPrimaryType(poi, tags) {
  const raw = tags.shop || tags.amenity || tags.tourism || tags.natural || poi?.type || 'location';
  return humanizeMapTag(raw);
}

function poiDescription(poi) {
  const t = poi?.tags || {};
  if (t.description) return String(t.description);

  const parts = [];

  switch (poi.type) {
    case 'cafe': {
      const hasTakeaway = t.takeaway === 'yes' || t.takeaway === 'only';
      const hasSeating = t.outdoor_seating === 'yes';
      const cuisine = t.cuisine ? humanizeMapTag(t.cuisine) : null;
      const chain = t.brand || t.operator;
      parts.push(chain ? `${chain} — good cafe stop mid-ride.` : 'A potential mid-ride cafe stop.');
      if (cuisine) parts.push(`Serves ${cuisine}.`);
      if (hasTakeaway && hasSeating) parts.push('Takeaway + outdoor seating — ideal for quick fuelling or a proper recovery break.');
      else if (hasTakeaway) parts.push('Takeaway available — useful for a quick refuel without stopping long.');
      else if (hasSeating) parts.push('Outdoor seating — a good spot to sit down and recover between efforts.');
      if (t.internet_access === 'wlan' || t.internet_access === 'yes') parts.push('Has WiFi.');
      break;
    }
    case 'bicycle_shop': {
      const hasRepair = t['service:bicycle:repair'] === 'yes';
      const hasRental = t['service:bicycle:rental'] === 'yes';
      const hasParts = t['service:bicycle:retail'] === 'yes';
      const brand = t.brand || t.operator || t.name;
      parts.push(brand ? `${brand} — bike shop on your route.` : 'Bike shop on your route.');
      if (hasRepair) parts.push('Does mechanical repairs — good to know if you have a mid-ride breakdown.');
      if (hasParts) parts.push('Sells parts and accessories.');
      if (hasRental) parts.push('Bike rental available.');
      if (!hasRepair && !hasParts && !hasRental) parts.push('Call ahead to confirm services.');
      break;
    }
    case 'viewpoint': {
      parts.push(t.ele ? `Viewpoint at ${t.ele}m — worth a stop.` : 'Viewpoint worth stopping for.');
      if (t.direction) parts.push(`Faces ${humanizeMapTag(t.direction)}.`);
      if (t['name:en']) parts.push(`Known as: ${t['name:en']}.`);
      break;
    }
    case 'peak': {
      parts.push(t.ele ? `Summit at ${t.ele}m — a natural KOM target on the way.` : 'A summit on your route — natural climb target.');
      if (t['name:fr'] || t['name:en']) parts.push(`Also known as: ${t['name:fr'] || t['name:en']}.`);
      break;
    }
    default: {
      const primaryType = poiPrimaryType(poi, t);
      const identity = t.brand || t.operator || t['name:en'];
      parts.push(identity ? `${identity} (${primaryType}).` : `Mapped as ${primaryType}.`);
      if (t.ele) parts.push(`Elevation: ${t.ele}m.`);
    }
  }

  return parts.join(' ') || 'No additional information in map data for this location.';
}

function poiHours(poi) {
  const t = poi?.tags || {};
  return t.opening_hours || t['opening_hours:covid19'] || t.hours || 'No official opening hours in map data';
}

function poiAddress(poi) {
  const t = poi?.tags || {};
  const line = [t['addr:street'], t['addr:housenumber'], t['addr:city']].filter(Boolean).join(' ');
  return line || 'No address provided';
}

function googleMapsPlaceUrl(lat, lng, name = '') {
  const query = name ? `${name} @ ${lat},${lng}` : `${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function googleMapsDirectionsUrl(fromLat, fromLng, toLat, toLng) {
  return `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&travelmode=bicycling`;
}

function poiDivIcon(cat, isSelected) {
  const size = isSelected ? 46 : 38;
  const border = isSelected ? '3px solid #fff' : '2.5px solid rgba(255,255,255,0.9)';
  const shadow = isSelected
    ? `0 0 0 3px ${cat.color}, 0 4px 16px rgba(0,0,0,0.55)`
    : '0 3px 10px rgba(0,0,0,0.4)';
  return L.divIcon({
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${cat.color};
      display:flex;align-items:center;justify-content:center;
      font-size:${isSelected ? 11 : 10}px;
      font-weight:700;
      letter-spacing:0.06em;
      border:${border};
      box-shadow:${shadow};
      cursor:pointer;
      pointer-events:auto;
      transition:all 0.15s;
    ">${cat.icon}</div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function mapPinIcon(label, color = '#4d7fe8') {
  return L.divIcon({
    html: `<div style="
      width:26px;height:26px;border-radius:50%;
      background:${color};
      border:2px solid rgba(255,255,255,0.96);
      box-shadow:0 3px 14px rgba(0,0,0,0.45),0 0 0 2px ${color}55;
      display:flex;align-items:center;justify-content:center;
      font-family:var(--font-mono);font-size:10px;font-weight:700;color:#fff;
      letter-spacing:0.03em;
    ">${label}</div>`,
    className: '',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

async function fetchOverpassPois(lat, lng, radiusM, catIds) {
  const cats = POI_CATEGORIES.filter(c => catIds.includes(c.id));
  if (!cats.length) return [];

  const overpassBlocks = cats.map(c => (`
      node[${c.overpass}](around:${radiusM},${lat},${lng});
      way[${c.overpass}](around:${radiusM},${lat},${lng});
      relation[${c.overpass}](around:${radiusM},${lat},${lng});
    `)).join('\n');

  const query = `[out:json][timeout:25];(
      ${overpassBlocks}
    );
    out center tags;`;

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: 'data=' + encodeURIComponent(query),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const data = await res.json();

  const byId = new Map();
  for (const e of (data.elements || [])) {
    const elLat = e.lat ?? e.center?.lat;
    const elLng = e.lon ?? e.center?.lon;
    if (elLat == null || elLng == null) continue;
    const type = e.tags?.shop === 'bicycle' ? 'bicycle_shop'
      : e.tags?.amenity === 'cafe' ? 'cafe'
        : e.tags?.tourism === 'viewpoint' ? 'viewpoint'
          : 'peak';
    const id = `${e.type || 'node'}:${e.id}`;
    byId.set(id, {
      id,
      lat: elLat,
      lng: elLng,
      name: e.tags?.name || e.tags?.['name:en'] || 'Unnamed',
      type,
      tags: e.tags || {},
    });
  }
  return [...byId.values()];
}

async function fetchWikiThumb(articleTitle) {
  try {
    const lang = articleTitle.match(/^([a-z]{2,3}):/)?.[1] || 'en';
    const title = articleTitle.replace(/^[a-z]+:/i, '').replace(/_/g, ' ');
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&format=json&pithumbsize=320&origin=*`;
    const data = await (await fetch(url)).json();
    const page = Object.values(data?.query?.pages || {})[0];
    return page?.thumbnail?.source || null;
  } catch (_) { return null; }
}

// ── Tile providers ────────────────────────────────────────────
const ENV_MAPTILER_KEY = process.env.REACT_APP_MAPTILER_KEY || '';
function getTile(surface, sport, userKey) {
  const key = userKey || ENV_MAPTILER_KEY;
  const outdoor = sport !== 'Run' && (surface === 'gravel' || surface === 'mtb');
  if (key) return {
    url: `https://api.maptiler.com/maps/outdoor-v2/{z}/{x}/{y}.png?key=${key}`,
    attr: '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; OpenStreetMap',
    maxZoom: 22,
  };
  if (outdoor) return {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr: '&copy; Esri, Maxar', maxZoom: 19,
  };
  return {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attr: '&copy; Esri, USGS, NOAA', maxZoom: 19,
  };
}

// ── Geocoding ─────────────────────────────────────────────────
let _lastGeoReq = 0;
async function reverseGeocode(lat, lng) {
  const wait = Math.max(0, 1050 - (Date.now() - _lastGeoReq));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  _lastGeoReq = Date.now();
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=14`,
      { headers: { 'User-Agent': 'CoachCenter/1.0', 'Accept-Language': 'en' } }
    );
    const data = await res.json();
    const a = data.address || {};
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
  for (let i = 1; i < coords.length; i++) d += haversineKm({ lat: coords[i - 1][1], lng: coords[i - 1][0] }, { lat: coords[i][1], lng: coords[i][0] });
  return d;
}

function segmentBearingDeg(a, b) {
  const y = Math.sin((b.lng - a.lng) * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180);
  const x = Math.cos(a.lat * Math.PI / 180) * Math.sin(b.lat * Math.PI / 180)
    - Math.sin(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.cos((b.lng - a.lng) * Math.PI / 180);
  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}

function headingDeltaDeg(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function scoreRouteShape(coords) {
  if (!Array.isArray(coords) || coords.length < 4) {
    return { score: 0.5, uTurns: 0, zigzags: 0 };
  }

  let uTurns = 0;
  let zigzags = 0;
  let tinyBacktracks = 0;
  const totalKm = Math.max(0.1, routeDistanceKm(coords));

  for (let i = 2; i < coords.length; i++) {
    const p0 = { lat: coords[i - 2][1], lng: coords[i - 2][0] };
    const p1 = { lat: coords[i - 1][1], lng: coords[i - 1][0] };
    const p2 = { lat: coords[i][1], lng: coords[i][0] };
    const b1 = segmentBearingDeg(p0, p1);
    const b2 = segmentBearingDeg(p1, p2);
    const turn = headingDeltaDeg(b1, b2);
    const l1 = haversineKm(p0, p1);
    const l2 = haversineKm(p1, p2);

    if (turn > 155) uTurns += 1;
    if (turn > 120 && Math.min(l1, l2) < 0.12) zigzags += 1;
    if (turn > 140 && l1 < 0.05 && l2 < 0.05) tinyBacktracks += 1;
  }

  const penalty = (uTurns * 1.3 + zigzags * 0.45 + tinyBacktracks * 0.8) / Math.max(4, totalKm * 3.5);
  return {
    score: Math.max(0, 1 - penalty),
    uTurns,
    zigzags,
  };
}

function routeElevation(rawCoords) {
  if (!rawCoords?.length || rawCoords[0]?.length < 3) return { climbM: 0, descentM: 0, hasData: false };
  let climbM = 0, descentM = 0;
  for (let i = 1; i < rawCoords.length; i++) {
    const diff = (rawCoords[i][2] || 0) - (rawCoords[i - 1][2] || 0);
    if (diff > 0) climbM += diff; else descentM += -diff;
  }
  return { climbM: Math.round(climbM), descentM: Math.round(descentM), hasData: true };
}

function compressTrackCoords(coords, maxPoints = 3200) {
  if (!Array.isArray(coords) || coords.length <= maxPoints) return coords;
  const step = Math.ceil(coords.length / maxPoints);
  const compact = [];
  for (let i = 0; i < coords.length; i += step) compact.push(coords[i]);
  if (compact[compact.length - 1] !== coords[coords.length - 1]) {
    compact.push(coords[coords.length - 1]);
  }
  return compact;
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

// ── OSRM ─────────────────────────────────────────────────────
async function fetchOsrmTrip(startLat, startLng, wpts) {
  const pts = [{ lat: startLat, lng: startLng }, ...wpts, { lat: startLat, lng: startLng }];
  const co = pts.map(p => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
  const res = await fetch(`https://router.project-osrm.org/trip/v1/foot/${co}?roundtrip=false&source=first&destination=last&overview=full&geometries=geojson`);
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const data = await res.json();
  if (data.code !== 'Ok') throw new Error('No route');
  return { coords: data.trips[0].geometry.coordinates, rawCoords: null };
}
async function fetchOsrmRoute(from, to) {
  const co = `${from.lng.toFixed(5)},${from.lat.toFixed(5)};${to.lng.toFixed(5)},${to.lat.toFixed(5)}`;
  const res = await fetch(`https://router.project-osrm.org/route/v1/foot/${co}?overview=full&geometries=geojson`);
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const data = await res.json();
  if (data.code !== 'Ok') throw new Error('No route');
  return data.routes[0].geometry.coordinates;
}

async function fetchOsrmRouteByProfile(profile, from, to) {
  const co = `${from.lng.toFixed(5)},${from.lat.toFixed(5)};${to.lng.toFixed(5)},${to.lat.toFixed(5)}`;
  const res = await fetch(`https://router.project-osrm.org/route/v1/${profile}/${co}?overview=full&geometries=geojson`);
  if (!res.ok) throw new Error(`OSRM ${profile} ${res.status}`);
  const data = await res.json();
  if (data.code !== 'Ok') throw new Error(`No route (${profile})`);
  return data.routes[0].geometry.coordinates;
}

async function snapToRoutablePoint(point, sport) {
  const profiles = sport === 'Run' ? ['foot', 'driving'] : ['driving', 'foot'];
  for (const profile of profiles) {
    try {
      const res = await fetch(`https://router.project-osrm.org/nearest/v1/${profile}/${point.lng.toFixed(5)},${point.lat.toFixed(5)}?number=1`);
      if (!res.ok) continue;
      const data = await res.json();
      const snapped = data?.waypoints?.[0]?.location;
      if (snapped?.length === 2) {
        return { lat: snapped[1], lng: snapped[0] };
      }
    } catch (_) { }
  }
  return point;
}

// ── BRouter ───────────────────────────────────────────────────
async function fetchBrouterRoute(from, to, profile) {
  const ll = `${from.lng.toFixed(5)},${from.lat.toFixed(5)}|${to.lng.toFixed(5)},${to.lat.toFixed(5)}`;
  const res = await fetch(`https://brouter.de/brouter?lonlats=${ll}&profile=${profile}&alternativeidx=0&format=geojson`);
  if (!res.ok) throw new Error(`BRouter ${res.status}`);
  const data = await res.json();
  const raw = data.features?.[0]?.geometry?.coordinates;
  if (!raw?.length) throw new Error('No route from BRouter');
  return raw.map(c => [c[0], c[1]]);
}

async function fetchBrouterRouteSafe(from, to, profile) {
  try {
    return await fetchBrouterRoute(from, to, profile);
  } catch (err) {
    const fallback = SURFACE_PROFILE_FALLBACK[profile];
    if (fallback) return await fetchBrouterRoute(from, to, fallback);
    throw err;
  }
}
async function fetchBrouterTrip(startLat, startLng, wpts, profile, alternativeidx = 0) {
  const pts = [{ lat: startLat, lng: startLng }, ...wpts, { lat: startLat, lng: startLng }];
  const ll = pts.map(p => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join('|');
  const res = await fetch(`https://brouter.de/brouter?lonlats=${ll}&profile=${profile}&alternativeidx=${alternativeidx}&format=geojson`);
  if (!res.ok) throw new Error(`BRouter ${res.status}`);
  const data = await res.json();
  const raw = data.features?.[0]?.geometry?.coordinates;
  if (!raw?.length) throw new Error('No route from BRouter');
  return { coords: raw.map(c => [c[0], c[1]]), rawCoords: raw };
}

// Try a BRouter profile; if the server rejects it (profile not deployed),
// automatically retry with the fallback profile before giving up.
async function fetchBrouterTripSafe(startLat, startLng, wpts, profile) {
  try {
    return await fetchBrouterTrip(startLat, startLng, wpts, profile, 0);
  } catch (err) {
    const fallback = SURFACE_PROFILE_FALLBACK[profile];
    if (fallback) return await fetchBrouterTrip(startLat, startLng, wpts, fallback, 0);
    throw err;
  }
}

// ── Routing helpers ───────────────────────────────────────────
async function routeSegment(from, to, sport, surface) {
  const fromSnap = await snapToRoutablePoint(from, sport);
  const toSnap = await snapToRoutablePoint(to, sport);
  if (sport === 'Run') {
    try {
      return await fetchOsrmRoute(fromSnap, toSnap);
    } catch (_) {
      return fetchOsrmRouteByProfile('driving', fromSnap, toSnap);
    }
  }
  try {
    return await fetchBrouterRouteSafe(fromSnap, toSnap, SURFACE_PROFILES[surface] || 'fastbike');
  } catch (_) {
    return fetchOsrmRouteByProfile('driving', fromSnap, toSnap);
  }
}

async function routeTripWithSegments(startLat, startLng, wpts, sport, surface) {
  const pts = [{ lat: startLat, lng: startLng }, ...wpts, { lat: startLat, lng: startLng }];
  const segs = await Promise.all(pts.slice(0, -1).map((p, i) => routeSegment(p, pts[i + 1], sport, surface)));
  const coords = segs.flatMap((seg, i) => i === 0 ? seg : seg.slice(1));
  return { coords, rawCoords: null };
}

async function routeTrip(startLat, startLng, wpts, sport, surface) {
  if (sport === 'Run') return fetchOsrmTrip(startLat, startLng, wpts);
  try {
    return await fetchBrouterTripSafe(startLat, startLng, wpts, SURFACE_PROFILES[surface] || 'fastbike');
  } catch (_) {
    return routeTripWithSegments(startLat, startLng, wpts, sport, surface);
  }
}
async function routeOutAndBack(startLat, startLng, halfKm, sport, surface, dir) {
  const mid = geodesicOffset(startLat, startLng, dir, halfKm);
  if (sport === 'Run') {
    const outC = await fetchOsrmRoute({ lat: startLat, lng: startLng }, mid);
    return { coords: [...outC, ...[...outC].reverse().slice(1)], rawCoords: null };
  }
  try {
    const { coords: outC, rawCoords: outR } = await fetchBrouterTripSafe(startLat, startLng, [mid], SURFACE_PROFILES[surface] || 'fastbike');
    return { coords: [...outC, ...[...outC].reverse().slice(1)], rawCoords: outR ? [...outR, ...[...outR].reverse().slice(1)] : null };
  } catch (_) {
    const outC = await routeSegment({ lat: startLat, lng: startLng }, mid, sport, surface);
    return { coords: [...outC, ...[...outC].reverse().slice(1)], rawCoords: null };
  }
}

// ── Interval analysis ─────────────────────────────────────────
function scoreForIntervals(rawCoords, warmupKmDist) {
  if (!rawCoords?.length || rawCoords[0]?.length < 3)
    return { score: 0.5, note: 'No elevation data', climbM: 0, descentM: 0, hasData: false };
  let cum = 0, warmupEnd = 0;
  for (let i = 1; i < rawCoords.length; i++) {
    cum += haversineKm({ lat: rawCoords[i - 1][1], lng: rawCoords[i - 1][0] }, { lat: rawCoords[i][1], lng: rawCoords[i][0] });
    if (cum >= warmupKmDist && warmupEnd === 0) { warmupEnd = i; break; }
  }
  if (warmupEnd === 0) warmupEnd = Math.floor(rawCoords.length * 0.2);
  const intPts = rawCoords.slice(warmupEnd);
  let descentM = 0, climbM = 0;
  for (let i = 1; i < intPts.length; i++) {
    const diff = (intPts[i][2] || 0) - (intPts[i - 1][2] || 0);
    if (diff < 0) descentM += -diff; else climbM += diff;
  }
  const penalty = Math.min(descentM / 40, 1);
  const bonus = Math.min(climbM / 300, 0.2);
  const score = Math.max(0, 1 - penalty + bonus);
  const note = descentM > 40 ? `${Math.round(descentM)}m descent in interval zone — not ideal`
    : climbM > 80 ? `${Math.round(climbM)}m climbing in interval zone — good for efforts`
      : `Flat interval zone — suitable for power efforts`;
  return { score, note, climbM: Math.round(climbM), descentM: Math.round(descentM), hasData: true };
}
function detectIntervals(workout) {
  if (!workout) return null;
  const blocks = workout.workoutBlocks || workout.blocks || [];
  let warmupMin = 0;
  for (const b of blocks) {
    if (['Z1', 'Z2'].includes(b.zone)) warmupMin += Number(b.durationMin) || 0;
    else break;
  }
  const iBlocks = blocks.filter(b => ['Z4', 'Z5'].includes(b.zone));
  if (iBlocks.length < 2) return null;
  return { warmupMin, count: iBlocks.length };
}

// ── GPX ───────────────────────────────────────────────────────
function downloadGpx(name, coords) {
  const compactCoords = compressTrackCoords(coords);
  const pts = compactCoords.map(([lng, lat]) => `    <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"/>`).join('\n');
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="CoachCenter APEX" xmlns="http://www.topografix.com/GPX/1/1">\n  <metadata><name>${name}</name><time>${new Date().toISOString()}</time></metadata>\n  <trk><name>${name}</name><trkseg>\n${pts}\n  </trkseg></trk>\n</gpx>`;
  const url = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' }));
  const a = document.createElement('a');
  a.href = url; a.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.gpx`; a.click();
  URL.revokeObjectURL(url);
}

// ── Workout helpers ───────────────────────────────────────────
function inferWorkoutProfile(w) {
  if (!w) return null;
  const blocks = Array.isArray(w.workoutBlocks) ? w.workoutBlocks : Array.isArray(w.blocks) ? w.blocks : [];
  const dur = blocks.reduce((s, b) => s + (Number(b.durationMin) || 0), 0);
  const text = `${w.title || w.name || ''} ${w.notes || ''}`;
  const sport = /run/i.test(String(w.type || w.event_type || '')) ? 'Run' : 'Ride';
  const zone = blocks[0]?.zone || (() => {
    const t = text.toLowerCase();
    if (/vo2|max|sprint/i.test(t)) return 'Z5'; if (/threshold|ftp/i.test(t)) return 'Z4';
    if (/tempo/i.test(t)) return 'Z3'; if (/recovery|easy/i.test(t)) return 'Z1'; return 'Z2';
  })();
  const min = dur || (() => {
    const m = text.match(/(\d+)\s*[-–]\s*(\d+)/); if (m) return Math.round((+m[1] + +m[2]) / 2);
    const mm = text.match(/(\d+)\s*min/i); if (mm) return +mm[1]; return 90;
  })();
  return { sport, zone, duration: min };
}

function normalizeWorkoutBlocks(workout, fallbackProfile) {
  const raw = Array.isArray(workout?.workoutBlocks)
    ? workout.workoutBlocks
    : Array.isArray(workout?.blocks)
      ? workout.blocks
      : [];
  if (raw.length) {
    return raw.map((b, i) => ({
      id: `${b.zone || 'Z2'}_${i}`,
      zone: b.zone || fallbackProfile?.zone || 'Z2',
      durationMin: Math.max(1, Number(b.durationMin || b.duration || 0) || 1),
    }));
  }
  return [{ id: 'single', zone: fallbackProfile?.zone || 'Z2', durationMin: Math.max(20, Number(fallbackProfile?.duration || 60)) }];
}

function workoutBlockSummary(blocks) {
  const byZone = blocks.reduce((acc, b) => {
    acc[b.zone] = (acc[b.zone] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(byZone)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([z, c]) => `${z}x${c}`)
    .join(' · ');
}

function getTodayTraining(events = []) {
  const today = new Date().toISOString().slice(0, 10);
  return events.find(e => {
    const d = String(e.start_date_local || e.start_date || e.date || '').slice(0, 10);
    return d === today && !/rest|off day|full recovery/.test(`${e.title || ''} ${e.notes || ''}`.toLowerCase());
  }) || null;
}

// ── Leaflet components ────────────────────────────────────────
function FitBounds({ coords, sidebarOffset = 0 }) {
  const map = useMap();
  useEffect(() => {
    if (!coords?.length) return;
    try {
      map.fitBounds(coords.map(([ln, la]) => [la, ln]), {
        paddingTopLeft: [sidebarOffset + 28, 72],
        paddingBottomRight: [28, 72],
      });
    } catch (_) { }
  }, [coords, map, sidebarOffset]); // eslint-disable-line
  return null;
}
function FlyTo({ lat, lng, zoom = 13 }) {
  const map = useMap();
  useEffect(() => {
    if (lat != null && lng != null) map.flyTo([lat, lng], zoom, { duration: 1.6, easeLinearity: 0.25 });
  }, [lat, lng, zoom]); // eslint-disable-line
  return null;
}
function MapClickHandler({ onMapClick, active }) {
  useMapEvents({ click: e => { if (active) onMapClick(e.latlng); } });
  return null;
}
function MapMoveHandler({ onMoveEnd }) {
  const map = useMap();
  useMapEvents({ moveend: () => { const c = map.getCenter(); onMoveEnd(c.lat, c.lng); } });
  return null;
}

// ── UI primitives ─────────────────────────────────────────────
const GLASS = {
  background: 'rgba(10, 10, 10, 0.90)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.07)',
  boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
};

function Fab({ onClick, disabled, children, active, color }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...GLASS,
      borderRadius: 13, padding: '12px 16px', cursor: disabled ? 'default' : 'pointer',
      fontFamily: 'var(--font-sans)', fontSize: 14,
      fontWeight: 600,
      color: active ? (color || 'var(--brand)') : 'var(--text-1)',
      border: `1px solid ${active ? (color || 'var(--brand)') : 'rgba(255,255,255,0.07)'}`,
      background: active ? (color ? `${color}22` : 'var(--brand-dim)') : 'rgba(10,10,10,0.90)',
      whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 8,
      width: '100%', textAlign: 'left',
      transition: 'all 0.18s', opacity: disabled ? 0.6 : 1,
    }}>
      {children}
    </button>
  );
}

function PillToggle({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: 11, padding: 4, gap: 3 }}>
      {options.map(o => (
        <button key={o.id} onClick={() => onChange(o.id)} style={{
          flex: 1, padding: '9px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
          fontSize: 14, fontFamily: 'var(--font-sans)', fontWeight: 600, transition: 'all 0.15s',
          background: value === o.id ? 'rgba(255,255,255,0.11)' : 'transparent',
          color: value === o.id ? 'var(--text-0)' : 'var(--text-3)',
          letterSpacing: '-0.01em',
        }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function RouteRating({ value, onChange, readonly }) {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} onClick={() => !readonly && onChange && onChange(n)} style={{
          width: 16, height: 16, borderRadius: '50%', border: 'none', padding: 0,
          cursor: readonly ? 'default' : 'pointer',
          background: n <= (value || 0) ? '#f5c518' : 'rgba(255,255,255,0.12)',
          transition: 'background 0.15s',
        }} />
      ))}
      {(value || 0) > 0 && (
        <span style={{ fontSize: 13, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginLeft: 2 }}>{value}/5</span>
      )}
    </div>
  );
}

// ── POI Info Card ─────────────────────────────────────────────
function PoiCard({ poi, thumb, onClose, currentLocation }) {
  const cat = poiCategory(poi.type);
  const t = poi.tags;
  const mapsUrl = googleMapsPlaceUrl(poi.lat, poi.lng, poi.name);
  const directionsUrl = currentLocation
    ? googleMapsDirectionsUrl(currentLocation[0], currentLocation[1], poi.lat, poi.lng)
    : null;
  return (
    <div style={{
      ...GLASS,
      position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 2000, borderRadius: 20, overflow: 'hidden',
      width: 360, maxWidth: 'calc(100vw - 370px)',
      animation: 'fadeSlideUp 0.22s ease',
    }}>
      <style>{`@keyframes fadeSlideUp{from{opacity:0;transform:translateX(-50%) translateY(14px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>

      {/* Photo header */}
      {thumb && (
        <div style={{ position: 'relative', height: 170, overflow: 'hidden' }}>
          <img src={thumb} alt={poi.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 35%, rgba(10,10,10,0.92) 100%)' }} />
          <div style={{ position: 'absolute', bottom: 16, left: 18, right: 48 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', lineHeight: 1.2, textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>{poi.name}</div>
          </div>
          <button onClick={onClose} style={{
            position: 'absolute', top: 12, right: 12,
            width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(0,0,0,0.55)', border: 'none',
            color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(8px)',
          }}>×</button>
        </div>
      )}

      <div style={{ padding: thumb ? '14px 18px 18px' : '18px 18px 18px' }}>

        {/* Header when no photo */}
        {!thumb && (
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14,
                background: `${cat.color}22`, border: `2px solid ${cat.color}44`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', flexShrink: 0,
              }}>{cat.icon}</div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-0)', lineHeight: 1.2 }}>{poi.name}</div>
                <div style={{ fontSize: 13, color: cat.color, fontFamily: 'var(--font-mono)', marginTop: 2 }}>{cat.label}</div>
              </div>
            </div>
            <button onClick={onClose} style={{
              width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.07)',
              border: 'none', color: 'var(--text-3)', fontSize: 18, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>×</button>
          </div>
        )}

        {/* Category pill when photo is shown */}
        {thumb && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12,
            background: `${cat.color}22`, border: `1px solid ${cat.color}55`,
            borderRadius: 20, padding: '5px 12px',
          }}>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>{cat.icon}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: cat.color, fontWeight: 600 }}>{cat.label}</span>
          </div>
        )}

        {/* Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: 10, alignItems: 'start' }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>Type</span>
            <span style={{ fontSize: 14, color: cat.color, fontWeight: 600, lineHeight: 1.45 }}>{cat.label}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: 10, alignItems: 'start' }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>Address</span>
            <span style={{ fontSize: 14, color: 'var(--text-1)', lineHeight: 1.45 }}>{poiAddress(poi)}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: 10, alignItems: 'start' }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>Hours</span>
            <span style={{ fontSize: 13, color: 'var(--text-1)', fontFamily: 'var(--font-mono)', lineHeight: 1.4 }}>{poiHours(poi)}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: 10, alignItems: 'start' }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>Description</span>
            <span style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.55 }}>{poiDescription(poi)}</span>
          </div>
          {t.phone && (
            <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: 10, alignItems: 'start' }}>
              <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>Phone</span>
              <span style={{ fontSize: 13, color: 'var(--text-1)', fontFamily: 'var(--font-mono)' }}>{t.phone}</span>
            </div>
          )}
          {t.website && (
            <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: 10, alignItems: 'start' }}>
              <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>Website</span>
              <a href={t.website} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 13, color: 'var(--brand)', fontFamily: 'var(--font-mono)', textDecoration: 'none' }}>
                {t.website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
              </a>
            </div>
          )}
          {t.ele && (
            <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: 10, alignItems: 'start' }}>
              <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>Elevation</span>
              <span style={{ fontSize: 14, color: 'var(--text-1)', fontFamily: 'var(--font-mono)' }}>{t.ele} m elevation</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              color: 'var(--brand)',
              textDecoration: 'none',
              border: '1px solid rgba(77,127,232,0.35)',
              borderRadius: 999,
              padding: '5px 10px',
            }}
          >
            Open in Google Maps
          </a>
          {directionsUrl && (
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-1)',
                textDecoration: 'none',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 999,
                padding: '5px 10px',
              }}
            >
              Directions from me
            </a>
          )}
        </div>
        <div style={{ marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-4)', opacity: 0.5 }}>
          {coordStr(poi.lat, poi.lng)}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export default function GpxRouteBuilder({ athlete, events = [], plannedEvents = [], workoutLibrary = [], mapTilerKey: userKey = '' }) {
  // Location
  const [startLat, setStartLat] = useState('');
  const [startLng, setStartLng] = useState('');
  const [startName, setStartName] = useState('');
  const [endLat, setEndLat] = useState('');
  const [endLng, setEndLng] = useState('');
  const [endName, setEndName] = useState('');
  const [viaLat, setViaLat] = useState('');
  const [viaLng, setViaLng] = useState('');
  const [viaName, setViaName] = useState('');
  const [homeLat, setHomeLat] = useState('');
  const [homeLng, setHomeLng] = useState('');
  const [homeName, setHomeName] = useState('');
  const [mapPickMode, setMapPickMode] = useState(null);
  const [detectingLoc, setDetectingLoc] = useState(false);
  const searchTimerRef = useRef(null);

  // Route settings
  const [sport, setSport] = useState('Ride');
  const [zone, setZone] = useState('Z2');
  const [duration, setDuration] = useState(90);
  const [routeType, setRouteType] = useState('loop');
  const [surface, setSurface] = useState('road');
  const [directionPref, setDirectionPref] = useState('any');
  const [terrainPref, setTerrainPref] = useState('any');
  const [menuStep, setMenuStep] = useState('start');

  // Tabs
  const [tab, setTab] = useState('generate');

  // Generate
  const [candidates, setCandidates] = useState([]);
  const [selected, setSelected] = useState(0);
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState(null);
  const [isExportingGpx, setIsExportingGpx] = useState(false);
  const [selectedLibrarySession, setSelectedLibrarySession] = useState('');
  const [selectedBlocks, setSelectedBlocks] = useState([]);

  // Draw
  const [waypoints, setWaypoints] = useState([]);
  const [segments, setSegments] = useState([]);
  const [drawLoading, setDrawLoading] = useState(false);
  const [editingRoute, setEditingRoute] = useState(null);
  const [saveName, setSaveName] = useState('');
  const waypointsRef = useRef([]);
  useEffect(() => { waypointsRef.current = waypoints; }, [waypoints]);

  // Saved
  const [savedRoutes, setSavedRoutes] = useState([]);
  const [previewRoute, setPreviewRoute] = useState(null);
  const [ratingRoute, setRatingRoute] = useState(null);
  const [saveMsg, setSaveMsg] = useState('');
  const [autoGenDone, setAutoGenDone] = useState(false);

  // Map
  const [mapFlyTo, setMapFlyTo] = useState(null);
  const [mapCenter, setMapCenter] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);

  // POI — each category independently toggleable
  const [activePoiCats, setActivePoiCats] = useState(new Set());
  const [pois, setPois] = useState([]);
  const [poisLoading, setPoisLoading] = useState(false);
  const [selectedPoi, setSelectedPoi] = useState(null);
  const [poiThumb, setPoiThumb] = useState(null);
  const poisCenterRef = useRef(null);
  const poiMarkerRefs = useRef({});
  const [mapPoiSearch, setMapPoiSearch] = useState('');
  const [showMapPoiResults, setShowMapPoiResults] = useState(false);
  const [mapPlaceResults, setMapPlaceResults] = useState([]);
  const [mapSearching, setMapSearching] = useState(false);
  const [topBuildExpanded, setTopBuildExpanded] = useState(false);

  const showPois = activePoiCats.size > 0;

  const togglePoiCat = useCallback((catId) => {
    setActivePoiCats(prev => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId); else next.add(catId);
      return next;
    });
    setSelectedPoi(null);
  }, []);

  const allPlanned = [...(plannedEvents || []), ...(events || [])];
  const todayTraining = getTodayTraining(allPlanned);
  const effectiveLib = workoutLibrary.length ? workoutLibrary : DEFAULT_LIBRARY_WORKOUTS;
  const librarySessions = effectiveLib
    .map((w, idx) => {
      const profile = inferWorkoutProfile(w);
      if (!profile) return null;
      const blocks = normalizeWorkoutBlocks(w, profile);
      return {
        id: `${w.title || w.name || 'session'}_${idx}`,
        title: w.title || w.name || `Session ${idx + 1}`,
        profile,
        blocks,
        totalMin: blocks.reduce((sum, b) => sum + (Number(b.durationMin) || 0), 0),
      };
    })
    .filter(Boolean)
    .slice(0, 24);
  const ftp = athlete?.icu_ftp || athlete?.ftp || null;
  const riderMass = athlete?.icu_weight || athlete?.weight || 75;

  // Speed at a given zone — uses FTP physics model when power data is available,
  // falls back to hardcoded table (with surface factor for cycling) otherwise.
  const zoneSpeedKmh = useCallback((z, surf = surface) => {
    if (sport === 'Run') return SPEED_KMPH.Run[z] || 10;
    if (ftp) {
      const fraction = ZONE_FTP_FRACTION[z] || 0.70;
      const { crr, cda } = SURFACE_PHYSICS[surf] || SURFACE_PHYSICS.road;
      return solveSpeedKmh(ftp * fraction, riderMass, crr, cda);
    }
    const base = SPEED_KMPH.Ride[z] || 27;
    return base * (SURFACE_SPEED_FACTOR[surf] || 1.0);
  }, [sport, surface, ftp, riderMass]);

  // Target distance: sum per-block distances when a structured workout is selected,
  // so a 5×5min Z5 session with Z1 recovery and Z2 warmup gives the right total km
  // rather than projecting the single dominant zone over the full duration.
  const targetKm = useMemo(() => {
    if (sport === 'Run') return Math.round((SPEED_KMPH.Run[zone] || 10) * Number(duration) / 60 * 10) / 10;
    if (selectedBlocks.length > 0) {
      const total = selectedBlocks.reduce((sum, b) => sum + zoneSpeedKmh(b.zone) * Number(b.durationMin) / 60, 0);
      return Math.round(total * 10) / 10;
    }
    return Math.round(zoneSpeedKmh(zone) * Number(duration) / 60 * 10) / 10;
  }, [sport, zone, duration, selectedBlocks, zoneSpeedKmh]); // eslint-disable-line
  const ftpBased = sport === 'Ride' && !!ftp;

  const todayIntervals = todayTraining ? detectIntervals(todayTraining) : null;
  const warmupKmEst = todayIntervals
    ? Math.round(zoneSpeedKmh('Z2') * todayIntervals.warmupMin / 60 * 10) / 10
    : 0;
  const tile = getTile(surface, sport, userKey);

  const exportGpxFile = useCallback((name, coords) => {
    if (!coords?.length || isExportingGpx) return;
    setIsExportingGpx(true);
    window.setTimeout(() => {
      downloadGpx(name, coords);
      setIsExportingGpx(false);
    }, 0);
  }, [isExportingGpx]);

  const applyLibrarySession = useCallback((session) => {
    if (!session) return;
    setSport(session.profile.sport || 'Ride');
    setZone(session.profile.zone || 'Z2');
    setDuration(Math.max(20, Number(session.profile.duration) || 90));
    setSelectedBlocks(session.blocks || []);
  }, []);

  // ── Init ───────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const prefs = JSON.parse(localStorage.getItem('apex-gpx-prefs') || '{}');
        const profile = await persistence.getAthleteProfile();
        if (prefs.sport) setSport(prefs.sport);
        if (prefs.zone) setZone(prefs.zone);
        if (prefs.duration) setDuration(prefs.duration);
        if (prefs.surface) setSurface(prefs.surface);
        const sLat = prefs.startLat || profile?.homeLat || '';
        const sLng = prefs.startLng || profile?.homeLng || '';
        const hLat = profile?.homeLat || prefs.homeLat || '';
        const hLng = profile?.homeLng || prefs.homeLng || '';
        if (sLat && sLng) {
          setStartLat(sLat); setStartLng(sLng); setStartName(prefs.startName || '');
          setCurrentLocation([parseFloat(sLat), parseFloat(sLng)]);
          setMapCenter([parseFloat(sLat), parseFloat(sLng)]);
          setMapReady(true);
          if (!prefs.startName) reverseGeocode(sLat, sLng).then(n => { setStartName(n); savePrefs({ startName: n }); });
        } else {
          // Auto-detect on first load
          navigator.geolocation?.getCurrentPosition(
            p => {
              const la = p.coords.latitude, ln = p.coords.longitude;
              setStartLat(String(la)); setStartLng(String(ln));
              setCurrentLocation([la, ln]);
              setMapCenter([la, ln]); setMapFlyTo({ lat: la, lng: ln, zoom: 13 });
              setMapReady(true);
              reverseGeocode(la, ln).then(n => { setStartName(n); savePrefs({ startLat: String(la), startLng: String(ln), startName: n }); });
            },
            () => {
              fetch('https://ipapi.co/json/').then(r => r.json()).then(d => {
                if (!d.latitude) {
                  setMapCenter([46.2276, 2.2137]);
                  setMapReady(true);
                  return;
                }
                setStartLat(String(d.latitude)); setStartLng(String(d.longitude));
                setCurrentLocation([d.latitude, d.longitude]);
                setMapCenter([d.latitude, d.longitude]); setMapFlyTo({ lat: d.latitude, lng: d.longitude, zoom: 12 });
                setMapReady(true);
                reverseGeocode(d.latitude, d.longitude).then(n => { setStartName(n); savePrefs({ startLat: String(d.latitude), startLng: String(d.longitude), startName: n }); });
              }).catch(() => {
                setMapCenter([46.2276, 2.2137]);
                setMapReady(true);
              });
            },
            { timeout: 8000 }
          );
        }
        if (hLat && hLng) {
          setHomeLat(hLat); setHomeLng(hLng); setHomeName(prefs.homeName || '');
          if (!prefs.homeName) reverseGeocode(hLat, hLng).then(n => { setHomeName(n); savePrefs({ homeName: n }); });
        }
        setSavedRoutes((await persistence.getRoutes()) || []);
      } catch (_) {
        setMapCenter([46.2276, 2.2137]);
        setMapReady(true);
      }
    })();
  }, []); // eslint-disable-line

  const savePrefs = (patch) => {
    try {
      const prev = JSON.parse(localStorage.getItem('apex-gpx-prefs') || '{}');
      localStorage.setItem('apex-gpx-prefs', JSON.stringify({ ...prev, ...patch }));
    } catch (_) { }
  };
  useEffect(() => { savePrefs({ sport, zone, duration, surface }); }, [sport, zone, duration, surface]);

  // ── POI fetch ─────────────────────────────────────────────
  const loadPois = useCallback(async (lat, lng, cats) => {
    const catIds = [...cats];
    if (!catIds.length) { setPois([]); return; }
    const key = `${lat.toFixed(2)},${lng.toFixed(2)},${catIds.sort().join(',')}`;
    if (poisCenterRef.current === key) return;
    poisCenterRef.current = key;
    setPoisLoading(true);
    try { setPois(await fetchOverpassPois(lat, lng, 6000, catIds)); } catch (_) { }
    setPoisLoading(false);
  }, []);

  useEffect(() => {
    if (!mapCenter) return;
    if (!activePoiCats.size) { setPois([]); poisCenterRef.current = null; return; }
    loadPois(mapCenter[0], mapCenter[1], activePoiCats);
  }, [activePoiCats, mapCenter, loadPois]);

  // Wiki thumb
  useEffect(() => {
    setPoiThumb(null);
    if (!selectedPoi) return;
    const wiki = selectedPoi.tags?.wikipedia || selectedPoi.tags?.['wikipedia:en'];
    if (wiki) fetchWikiThumb(wiki).then(setPoiThumb);
  }, [selectedPoi]);

  // ── Top search (POIs + places) ────────────────────────────
  const handleMapSearchChange = (val) => {
    setMapPoiSearch(val);
    setShowMapPoiResults(true);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!val.trim()) {
      setMapPlaceResults([]);
      setMapSearching(false);
      return;
    }
    searchTimerRef.current = setTimeout(async () => {
      setMapSearching(true);
      try {
        const places = await searchPlaces(val);
        setMapPlaceResults(Array.isArray(places) ? places.slice(0, 6) : []);
      } catch (_) {
        setMapPlaceResults([]);
      } finally {
        setMapSearching(false);
      }
    }, 450);
  };

  const applyPlaceResult = (item) => {
    const la = parseFloat(item.lat), ln = parseFloat(item.lon);
    const n = shortName(item);
    setStartLat(String(la)); setStartLng(String(ln)); setStartName(n);
    setMapFlyTo({ lat: la, lng: ln, zoom: 13 });
    savePrefs({ startLat: String(la), startLng: String(ln), startName: n });
    setMapPoiSearch(n || '');
    setShowMapPoiResults(false);
  };

  // ── Location detect ───────────────────────────────────────
  const handleDetectLocation = async () => {
    setDetectingLoc(true);
    const setLoc = async (la, ln) => {
      setStartLat(String(la)); setStartLng(String(ln)); setStartName('Resolving...');
      setCurrentLocation([la, ln]);
      setMapFlyTo({ lat: la, lng: ln, zoom: 13 });
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
      try { const d = await (await fetch('https://ipapi.co/json/')).json(); if (d.latitude) await setLoc(d.latitude, d.longitude); } catch (_) { }
    }
    setDetectingLoc(false);
  };

  // ── Map click ─────────────────────────────────────────────
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
    if (mapPickMode === 'end') {
      setEndLat(String(la)); setEndLng(String(ln)); setEndName('Resolving...');
      setMapPickMode(null);
      reverseGeocode(la, ln).then(n => setEndName(n));
      return;
    }
    if (mapPickMode === 'via') {
      setViaLat(String(la)); setViaLng(String(ln)); setViaName('Resolving...');
      setMapPickMode(null);
      reverseGeocode(la, ln).then(n => setViaName(n));
      return;
    }
    if (tab !== 'draw') return;
    const idx = waypointsRef.current.length;
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

  // ── Waypoints ─────────────────────────────────────────────
  const recalcSegments = async (wpts) => {
    if (wpts.length < 2) { setSegments([]); return; }
    setDrawLoading(true);
    const results = await Promise.allSettled(wpts.slice(0, -1).map((p, i) => routeSegment(p, wpts[i + 1], sport, surface)));
    setSegments(results.map(r => r.status === 'fulfilled' ? r.value : []));
    setDrawLoading(false);
  };
  const moveWaypoint = async (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= waypoints.length) return;
    const nw = [...waypoints];[nw[idx], nw[j]] = [nw[j], nw[idx]];
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

  // ── Auto-generate ─────────────────────────────────────────
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

  // ── Generate ──────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    const la = parseFloat(startLat), ln = parseFloat(startLng);
    if (isNaN(la) || isNaN(ln)) { setGenError('Set your start location first.'); return; }
    const endPoint = {
      lat: parseFloat(endLat),
      lng: parseFloat(endLng),
    };
    const hasEndPoint = !isNaN(endPoint.lat) && !isNaN(endPoint.lng);
    if (routeType === 'point' && !hasEndPoint) {
      setGenError('Set an end point for point-to-point navigation.');
      return;
    }
    setGenError(null); setGenLoading(true); setCandidates([]);

    // Direction preference → rotate waypoints toward that bearing
    const dirBearing = { north: 0, east: 90, south: 180, west: 270 };
    const baseRot = dirBearing[directionPref] ?? null;
    const rotations = routeType === 'outback'
      ? (baseRot !== null ? [baseRot - 20, baseRot, baseRot + 20] : [0, 120, 240])
      : (baseRot !== null ? [baseRot - 25, baseRot, baseRot + 25] : [0, 45, 90]);

    // Road routing adds ~40% distance on top of the straight-line circle perimeter.
    // Correcting for this by shrinking the theoretical radius so actual routed distance
    // lands close to the target. Factor 1.45 works for typical mixed road networks.
    const ROAD_TORTUOSITY = 1.45;
    const radius = targetKm / (2 * Math.PI * ROAD_TORTUOSITY);
    const halfKm = targetKm / (2 * 1.25); // roads add ~25% on each leg

    // ── Workout-derived interval load ─────────────────────────────────────────
    // intervalLoad ∈ [0, 1] — how much the scoring should weight terrain quality
    // over time match. Rises with zone intensity and number of hard blocks.
    const z5blocks = selectedBlocks.filter(b => b.zone === 'Z5').length;
    const z4blocks = selectedBlocks.filter(b => b.zone === 'Z4').length;
    const baseLoad = { Z1: 0, Z2: 0, Z3: 0.15, Z4: 0.45, Z5: 0.75 }[zone] || 0;
    const intervalLoad = Math.min(0.85, baseLoad + z5blocks * 0.07 + z4blocks * 0.04);

    // Warmup km estimate — used to identify the interval zone in elevation profile
    const isIntervalZone = intervalLoad > 0.1;
    const effectiveIntervals = todayIntervals ||
      (isIntervalZone ? { warmupMin: Math.round(Number(duration) * 0.18), count: z5blocks + z4blocks || 3 } : null);
    const effectiveWarmupKm = todayIntervals
      ? warmupKmEst
      : Math.round(targetKm * 0.18 * 10) / 10;

    // Physics params used in time estimation and inner variant scoring
    const { crr, cda } = SURFACE_PHYSICS[surface] || SURFACE_PHYSICS.road;
    const avgPowerW = ftp
      ? (selectedBlocks.length > 0
        ? selectedBlocks.reduce((s, b) => s + ftp * (ZONE_FTP_FRACTION[b.zone] || 0.7) * Number(b.durationMin), 0) /
        Math.max(1, selectedBlocks.reduce((s, b) => s + Number(b.durationMin), 0))
        : ftp * (ZONE_FTP_FRACTION[zone] || 0.7))
      : null;

    const scoreParams = { duration, targetKm, intervalLoad, terrainPref };

    try {
      if (routeType === 'point') {
        const points = [{ lat: la, lng: ln }];
        if (!isNaN(parseFloat(viaLat)) && !isNaN(parseFloat(viaLng))) {
          points.push({ lat: parseFloat(viaLat), lng: parseFloat(viaLng) });
        }
        points.push(endPoint);

        const segs = await Promise.all(points.slice(0, -1).map((p, i) => routeSegment(p, points[i + 1], sport, surface)));
        const coords = segs.flatMap((seg, i) => i === 0 ? seg : seg.slice(1));
        const distanceKm = Math.round(routeDistanceKm(coords) * 10) / 10;
        const shape = scoreRouteShape(coords);
        const candidate = {
          id: 0,
          label: 'A',
          coords,
          rawCoords: null,
          distanceKm,
          intScore: null,
          shape,
          elevation: { climbM: 0, descentM: 0, hasData: false },
          estTimeMin: null,
        };
        if ((shape.uTurns || 0) > 0) {
          setGenError('Point-to-point route built, but includes a U-turn. Try moving waypoint/end point slightly.');
        }
        setCandidates([candidate]);
        setSelected(0);
        setGenLoading(false);
        return;
      }

      const results = await Promise.allSettled(rotations.map(async (rot) => {
        if (routeType === 'outback') return routeOutAndBack(la, ln, halfKm, sport, surface, rot);

        const variants = [
          { n: 5, r: radius * 1.0 },
          { n: 5, r: radius * 0.88 },
          { n: 4, r: radius * 1.08 },
        ];

        const allVariantResults = await Promise.allSettled(
          variants.map(v => {
            const wpts = circleWaypoints(la, ln, v.r, rot, v.n);
            if (sport !== 'Run') return fetchBrouterTripSafe(la, ln, wpts, SURFACE_PROFILES[surface] || 'fastbike');
            return routeTrip(la, ln, wpts, sport, surface);
          })
        );

        // Score variants with the same unified function used for final ranking —
        // consistent selection at both levels means the best variant AND best
        // candidate both optimise the same objective.
        const scored = allVariantResults
          .filter(r => r.status === 'fulfilled')
          .map(r => r.value)
          .map(res => {
            const distanceKm = routeDistanceKm(res.coords);
            const shape = scoreRouteShape(res.coords);
            const elevation = routeElevation(res.rawCoords);
            const intScore = effectiveIntervals ? scoreForIntervals(res.rawCoords, effectiveWarmupKm) : null;
            const estTimeMin = avgPowerW ? estimateRouteTimeMin(res.rawCoords, avgPowerW, riderMass, crr, cda) : null;
            return { ...res, __score: routeFitScore({ shape, intScore, elevation, estTimeMin, distanceKm }, scoreParams) };
          })
          .sort((a, b) => b.__score - a.__score);

        if (!scored.length) throw new Error('No loop variant');
        return scored[0];
      }));

      const valid = results.map((r, i) => {
        if (r.status !== 'fulfilled') return null;
        const { coords, rawCoords } = r.value;
        const distanceKm = Math.round(routeDistanceKm(coords) * 10) / 10;
        const intScore = effectiveIntervals && rawCoords ? scoreForIntervals(rawCoords, effectiveWarmupKm) : null;
        const shape = scoreRouteShape(coords);
        const elevation = routeElevation(rawCoords);
        const estTimeMin = avgPowerW ? estimateRouteTimeMin(rawCoords, avgPowerW, riderMass, crr, cda) : null;
        return { id: i, label: ['A', 'B', 'C'][i], coords, rawCoords, distanceKm, intScore, shape, elevation, estTimeMin };
      }).filter(Boolean);
      if (!valid.length) throw new Error('No routes returned. Try a different start point or surface type.');

      const cleanRoutes = valid.filter(v => (v.shape?.uTurns || 0) === 0);
      const pool = cleanRoutes.length > 0 ? cleanRoutes : valid;
      const sorted = [...pool].sort((a, b) => routeFitScore(b, scoreParams) - routeFitScore(a, scoreParams));

      if (cleanRoutes.length === 0) {
        setGenError('Routes shown — clean loops are difficult here. Try moving your start point slightly.');
      }
      setCandidates(sorted); setSelected(0);
    } catch (err) { setGenError(err.message || 'Route generation failed.'); }
    finally { setGenLoading(false); }
  }, [startLat, startLng, endLat, endLng, viaLat, viaLng, targetKm, sport, surface, routeType, directionPref, terrainPref, zone, duration, todayIntervals, warmupKmEst, zoneSpeedKmh, selectedBlocks, ftp, riderMass]);

  // ── Save / delete / rate ──────────────────────────────────
  const handleSaveRoute = async (name, coords, distKm, rSport, rWaypoints) => {
    if (!coords?.length) return;
    const id = editingRoute?.id || `route_${Date.now()}`;
    const route = {
      id, name: name.trim() || `Route ${new Date().toLocaleDateString()}`,
      date: new Date().toISOString().slice(0, 10), sport: rSport || sport, zone, surface,
      distanceKm: distKm, coords, waypoints: rWaypoints || [], rating: 0, feedback: ''
    };
    const next = await persistence.saveRoute(route);
    setSavedRoutes(next); setSaveMsg(`"${route.name}" saved.`); setEditingRoute(null);
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
    const next = await persistence.saveRoute({ ...route, rating });
    setSavedRoutes(next);
    setRatingRoute(r => r?.id === id ? { ...r, rating } : r);
  };
  const handleSaveFeedback = async (id, feedback) => {
    const route = savedRoutes.find(r => r.id === id);
    if (!route) return;
    await persistence.saveRoute({ ...route, feedback });
    setSavedRoutes(await persistence.getRoutes());
    setRatingRoute(null);
  };
  const handleEditRoute = (route) => {
    setTab('draw'); setEditingRoute(route); setSaveName(route.name);
    if (route.waypoints?.length >= 2) {
      setWaypoints(route.waypoints); recalcSegments(route.waypoints);
    } else {
      const c = route.coords || [];
      if (c.length >= 2) {
        setWaypoints([{ lat: c[0][1], lng: c[0][0], name: 'Start' }, { lat: c[c.length - 1][1], lng: c[c.length - 1][0], name: 'End' }]);
        setSegments([c]);
      } else clearDraw();
    }
    setPreviewRoute(null);
  };

  // ── Map derived state ─────────────────────────────────────
  const displayCenter = startLat && startLng ? [parseFloat(startLat), parseFloat(startLng)] : (mapCenter || [46.2276, 2.2137]);
  const displayCurrentLocation = currentLocation || displayCenter;
  const mapCursor = mapPickMode ? 'crosshair' : tab === 'draw' ? 'copy' : 'grab';
  const allGenCoords = candidates.flatMap(c => c.coords);
  const drawnPolylineColor = editingRoute ? '#f77f3a' : '#4d7fe8';
  const filteredPois = pois.filter(p => activePoiCats.has(p.type));
  const mapPoiResults = useMemo(() => {
    const q = mapPoiSearch.trim().toLowerCase();
    if (!q) return [];
    return filteredPois
      .filter(p => (`${p.name} ${p.tags?.brand || ''} ${p.tags?.operator || ''} ${p.tags?.cuisine || ''}`).toLowerCase().includes(q))
      .slice(0, 8);
  }, [mapPoiSearch, filteredPois]);

  const handlePoiMarkerClick = useCallback((poi) => {
    // Clone object to force details card refresh on repeated clicks.
    setSelectedPoi({ ...poi });
    setMapFlyTo({ lat: poi.lat, lng: poi.lng, zoom: 15 });
    const ref = poiMarkerRefs.current[poi.id];
    if (ref) {
      // Ensure popup opens even if click event propagation is swallowed by map interactions.
      window.setTimeout(() => ref.openPopup(), 0);
    }
  }, []);

  // ── Render ────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', height: '100vh', overflow: 'hidden', cursor: mapCursor }} className="gpx-ui">

      {/* ── Full-page map ──────────────────────────────────── */}
      <div style={{ position: 'absolute', inset: 0 }}>
        {mapReady ? (
          <MapContainer center={displayCenter} zoom={12} style={{ height: '100%', width: '100%' }} zoomControl={false}>
            <TileLayer url={tile.url} attribution={tile.attr} maxZoom={tile.maxZoom} />
            <MapClickHandler onMapClick={({ lat, lng }) => handleMapClick({ lat, lng })} active={!!(mapPickMode || tab === 'draw')} />
            <MapMoveHandler onMoveEnd={(lat, lng) => setMapCenter([lat, lng])} />
            {mapFlyTo && <FlyTo lat={mapFlyTo.lat} lng={mapFlyTo.lng} zoom={mapFlyTo.zoom || 13} />}

            {tab === 'generate' && candidates.map((c, i) => (
              <Polyline key={c.id} positions={c.coords.map(([ln, la]) => [la, ln])}
                pathOptions={{ color: ROUTE_COLORS[i], weight: i === selected ? 5 : 2.5, opacity: i === selected ? 1 : 0.28 }}
                eventHandlers={{ click: () => setSelected(i) }} />
            ))}
            {tab === 'draw' && segments.map((seg, i) => (
              <Polyline key={i} positions={seg.map(([ln, la]) => [la, ln])}
                pathOptions={{ color: drawnPolylineColor, weight: 4, opacity: 0.95 }} />
            ))}
            {tab === 'draw' && waypoints.map((pt, i) => {
              const isFirst = i === 0;
              const isLast = i === waypoints.length - 1 && waypoints.length > 1;
              const pinColor = isFirst ? '#1f9d77' : isLast ? '#ef4444' : '#4d7fe8';
              const pinLabel = isFirst ? 'S' : isLast ? 'E' : String(i + 1);
              // Cumulative distance up to this waypoint
              let cumDist = 0;
              for (let j = 1; j <= i; j++) {
                cumDist += haversineKm(
                  { lat: waypoints[j - 1].lat, lng: waypoints[j - 1].lng },
                  { lat: waypoints[j].lat, lng: waypoints[j].lng }
                );
              }
              return (
                <Marker key={i} position={[pt.lat, pt.lng]} icon={mapPinIcon(pinLabel, pinColor)}>
                  <Tooltip direction="top" offset={[0, -16]} opacity={0.95} permanent={false}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                      {isFirst ? 'Start' : isLast ? `End · ${cumDist.toFixed(1)} km` : `WP ${i + 1} · ${cumDist.toFixed(1)} km`}
                    </span>
                  </Tooltip>
                  <Popup>
                    <div style={{ minWidth: 160, fontFamily: 'var(--font-sans)', padding: '4px 2px' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#111', marginBottom: 4 }}>
                        {isFirst ? 'Start' : isLast ? 'End point' : `Waypoint ${i + 1}`}
                      </div>
                      <div style={{ fontSize: 11, color: '#666', marginBottom: i > 0 ? 4 : 8 }}>
                        {pt.lat.toFixed(5)}, {pt.lng.toFixed(5)}
                      </div>
                      {i > 0 && (
                        <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
                          {cumDist.toFixed(2)} km from start
                        </div>
                      )}
                      <button
                        onClick={() => removeWaypoint(i)}
                        style={{
                          width: '100%', padding: '6px 8px', borderRadius: 6, border: 'none',
                          background: '#ef4444', color: '#fff', fontSize: 12, fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Remove waypoint
                      </button>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
            {tab === 'saved' && previewRoute?.coords && (
              <Polyline positions={previewRoute.coords.map(([ln, la]) => [la, ln])}
                pathOptions={{ color: '#4d7fe8', weight: 4, opacity: 0.95 }} />
            )}
            {startLat && startLng && tab !== 'draw' && (
              <Marker position={[parseFloat(startLat), parseFloat(startLng)]} icon={mapPinIcon('ST', '#1f9d77')} />
            )}
            {routeType === 'point' && endLat && endLng && tab !== 'draw' && (
              <Marker position={[parseFloat(endLat), parseFloat(endLng)]} icon={mapPinIcon('EN', '#f97316')} />
            )}
            {routeType === 'point' && viaLat && viaLng && tab !== 'draw' && (
              <Marker position={[parseFloat(viaLat), parseFloat(viaLng)]} icon={mapPinIcon('WP', '#7c3aed')} />
            )}

            {displayCurrentLocation && (
              <CircleMarker
                center={displayCurrentLocation}
                radius={10}
                pathOptions={{ color: '#0ea5e9', fillColor: '#38bdf8', fillOpacity: 0.35, weight: 2 }}
              >
                <Tooltip direction="top" offset={[0, -8]} opacity={0.92}>You are here</Tooltip>
                <Popup>
                  <div style={{ minWidth: 220, fontFamily: 'var(--font-sans)' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 6 }}>Current Location</div>
                    <div style={{ fontSize: 12, color: '#4b5563', marginBottom: 10 }}>{coordStr(displayCurrentLocation[0], displayCurrentLocation[1])}</div>
                    <a
                      href={googleMapsPlaceUrl(displayCurrentLocation[0], displayCurrentLocation[1], 'Current location')}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-block',
                        borderRadius: 8,
                        background: '#4d7fe8',
                        color: '#fff',
                        padding: '7px 10px',
                        fontSize: 12,
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      Open in Google Maps
                    </a>
                  </div>
                </Popup>
              </CircleMarker>
            )}

            {/* POI markers */}
            {filteredPois.map(poi => {
              const cat = poiCategory(poi.type);
              const isSel = selectedPoi?.id === poi.id;
              return (
                <Marker key={poi.id} position={[poi.lat, poi.lng]} icon={poiDivIcon(cat, isSel)}
                  ref={(m) => {
                    if (m) poiMarkerRefs.current[poi.id] = m;
                  }}
                  riseOnHover
                  eventHandlers={{
                    click: (e) => {
                      e.originalEvent?.stopPropagation?.();
                      handlePoiMarkerClick(poi);
                    },
                  }}>
                  <Tooltip direction="top" offset={[0, -8]} opacity={0.9}>{poi.name}</Tooltip>
                  <Popup>
                    <div style={{ minWidth: 238, fontFamily: 'var(--font-sans)' }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 2, lineHeight: 1.2 }}>{poi.name}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: cat.color, marginBottom: 8, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{cat.label}</div>
                      <div style={{ fontSize: 13, color: '#1f2937', lineHeight: 1.5, marginBottom: 6 }}><strong>Description:</strong> {poiDescription(poi)}</div>
                      <div style={{ fontSize: 13, color: '#1f2937', lineHeight: 1.45, marginBottom: 6 }}><strong>Hours:</strong> {poiHours(poi)}</div>
                      <div style={{ fontSize: 12, color: '#4b5563', lineHeight: 1.45, marginBottom: 9 }}><strong>Address:</strong> {poiAddress(poi)}</div>
                      <button
                        onClick={() => handlePoiMarkerClick(poi)}
                        style={{
                          width: '100%',
                          border: 'none',
                          borderRadius: 8,
                          background: '#4d7fe8',
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 600,
                          padding: '7px 10px',
                          cursor: 'pointer',
                        }}
                      >
                        Open Full Details
                      </button>
                      <a
                        href={googleMapsPlaceUrl(poi.lat, poi.lng, poi.name)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'block',
                          marginTop: 8,
                          width: '100%',
                          borderRadius: 8,
                          background: '#0f172a',
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 600,
                          padding: '7px 10px',
                          textAlign: 'center',
                          textDecoration: 'none',
                          boxSizing: 'border-box',
                        }}
                      >
                        Google Maps
                      </a>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {tab === 'generate' && candidates[selected]?.coords?.length > 0 && <FitBounds key={`gen-${selected}`} coords={candidates[selected].coords} sidebarOffset={404} />}
            {tab === 'draw' && drawnCoords.length > 0 && <FitBounds coords={drawnCoords} sidebarOffset={404} />}
            {tab === 'saved' && previewRoute?.coords?.length > 0 && <FitBounds coords={previewRoute.coords} sidebarOffset={404} />}
          </MapContainer>
        ) : (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(180deg, #0f1217 0%, #121826 100%)',
          }}>
            <div style={{
              padding: '12px 16px', borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.35)',
              fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-1)',
            }}>
              Locating your area...
            </div>
          </div>
        )}
      </div>

      {/* ── Top map POI search ────────────────────────────── */}
      <div style={{
        position: 'absolute',
        top: 14,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1200,
        width: 'min(560px, calc(100vw - 30px))',
      }}>
        <div style={{
          ...GLASS,
          borderRadius: 12,
          padding: 8,
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <input
            value={mapPoiSearch}
            onChange={(e) => handleMapSearchChange(e.target.value)}
            onFocus={() => setShowMapPoiResults(true)}
            placeholder="Search POIs, cities, locations..."
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 9,
              padding: '10px 12px',
              color: 'var(--text-0)',
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              outline: 'none',
            }}
          />
          {showMapPoiResults && mapPoiSearch.trim() && (
            <div style={{
              marginTop: 8,
              borderRadius: 9,
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(8, 10, 14, 0.98)',
            }}>
              {mapSearching && (
                <div style={{ padding: '9px 11px', fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  Searching places...
                </div>
              )}

              {mapPoiResults.length > 0 && (
                <div style={{ borderBottom: (mapPlaceResults.length > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none') }}>
                  <div style={{ padding: '7px 11px', fontSize: 11, color: 'var(--text-4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
                    VISIBLE POIS
                  </div>
                  {mapPoiResults.map((poi) => (
                    <button
                      key={poi.id}
                      onClick={() => {
                        handlePoiMarkerClick(poi);
                        setMapPoiSearch(poi.name || '');
                        setShowMapPoiResults(false);
                      }}
                      style={{
                        width: '100%',
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--text-1)',
                        textAlign: 'left',
                        padding: '9px 11px',
                        cursor: 'pointer',
                        borderTop: '1px solid rgba(255,255,255,0.05)',
                        fontFamily: 'var(--font-sans)',
                        fontSize: 14,
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{poi.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{poiCategory(poi.type).label} - {coordStr(poi.lat, poi.lng)}</div>
                    </button>
                  ))}
                </div>
              )}

              {mapPlaceResults.length > 0 && (
                <div>
                  <div style={{ padding: '7px 11px', fontSize: 11, color: 'var(--text-4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
                    CITIES & LOCATIONS
                  </div>
                  {mapPlaceResults.map((place, idx) => (
                    <button
                      key={`${place.place_id || idx}`}
                      onClick={() => applyPlaceResult(place)}
                      style={{
                        width: '100%',
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--text-1)',
                        textAlign: 'left',
                        padding: '9px 11px',
                        cursor: 'pointer',
                        borderTop: '1px solid rgba(255,255,255,0.05)',
                        fontFamily: 'var(--font-sans)',
                        fontSize: 14,
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{shortName(place)}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{Number(place.lat).toFixed(3)}, {Number(place.lon).toFixed(3)}</div>
                    </button>
                  ))}
                </div>
              )}

              {!mapSearching && mapPoiResults.length === 0 && mapPlaceResults.length === 0 && (
                <div style={{ padding: '9px 11px', fontSize: 13, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                  No match. Try a city name, address, or enable POI categories.
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{
          ...GLASS,
          marginTop: 8,
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.08)',
          overflow: 'hidden',
        }}>
          <button
            onClick={() => setTopBuildExpanded(v => !v)}
            style={{
              width: '100%',
              border: 'none',
              background: 'rgba(255,255,255,0.04)',
              color: 'var(--text-1)',
              padding: '9px 11px',
              textAlign: 'left',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              letterSpacing: '0.06em',
            }}
          >
            {topBuildExpanded ? 'HIDE' : 'SHOW'} BUILD POINTS
          </button>

          {topBuildExpanded && (
            <div style={{ padding: 10, background: 'rgba(8, 10, 14, 0.94)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
                ROUTE MODE
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                {[
                  { id: 'loop', label: 'Loop' },
                  { id: 'outback', label: 'Out & Back' },
                  { id: 'point', label: 'Point to Point' },
                ].map(o => (
                  <button
                    key={o.id}
                    onClick={() => setRouteType(o.id)}
                    style={{
                      border: `1px solid ${routeType === o.id ? 'var(--brand)' : 'rgba(255,255,255,0.12)'}`,
                      background: routeType === o.id ? 'var(--brand-dim)' : 'rgba(255,255,255,0.05)',
                      color: routeType === o.id ? 'var(--brand)' : 'var(--text-2)',
                      borderRadius: 7,
                      padding: '5px 8px',
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                    }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              <div style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
                POINT PICKER
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                <button onClick={() => setMapPickMode('start')} style={{ fontSize: 12, padding: '6px 9px', borderRadius: 7, border: `1px solid ${mapPickMode === 'start' ? 'var(--brand)' : 'rgba(255,255,255,0.12)'}`, background: mapPickMode === 'start' ? 'var(--brand-dim)' : 'rgba(255,255,255,0.05)', color: 'var(--text-1)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
                  Pick Start
                </button>
                <button onClick={() => { setRouteType('point'); setMapPickMode('via'); }} style={{ fontSize: 12, padding: '6px 9px', borderRadius: 7, border: `1px solid ${mapPickMode === 'via' ? 'var(--brand)' : 'rgba(255,255,255,0.12)'}`, background: mapPickMode === 'via' ? 'var(--brand-dim)' : 'rgba(255,255,255,0.05)', color: 'var(--text-1)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
                  Pick Waypoint
                </button>
                <button onClick={() => { setRouteType('point'); setMapPickMode('end'); }} style={{ fontSize: 12, padding: '6px 9px', borderRadius: 7, border: `1px solid ${mapPickMode === 'end' ? 'var(--brand)' : 'rgba(255,255,255,0.12)'}`, background: mapPickMode === 'end' ? 'var(--brand-dim)' : 'rgba(255,255,255,0.05)', color: 'var(--text-1)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
                  Pick End
                </button>
                {mapPickMode && (
                  <button onClick={() => setMapPickMode(null)} style={{ fontSize: 12, padding: '6px 9px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
                    Cancel
                  </button>
                )}
              </div>

              <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.4 }}>
                Start: <span style={{ color: 'var(--text-1)' }}>{startName || (startLat && startLng ? coordStr(startLat, startLng) : 'not set')}</span><br />
                Waypoint: <span style={{ color: 'var(--text-1)' }}>{viaName || (viaLat && viaLng ? coordStr(viaLat, viaLng) : 'optional')}</span><br />
                End: <span style={{ color: 'var(--text-1)' }}>{endName || (endLat && endLng ? coordStr(endLat, endLng) : 'not set')}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Left floating panel ────────────────────────────── */}
      <div style={{
        ...GLASS, position: 'absolute', left: 14, top: 14, bottom: 14,
        width: 'min(390px, calc(100vw - 28px))', borderRadius: 18, zIndex: 1000,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        minHeight: 0,
        background: 'linear-gradient(180deg, rgba(14,17,24,0.96) 0%, rgba(8,10,15,0.95) 100%)',
        border: '1px solid rgba(255,255,255,0.11)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.62), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}>
        {/* Panel header */}
        <div style={{
          padding: '18px 18px 10px',
          borderBottom: '1px solid rgba(255,255,255,0.09)',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 100%)',
          flex: '0 0 50%',
          height: '50%',
          minHeight: 0,
          maxHeight: '50%',
          overflowY: 'auto',
          overflowX: 'hidden',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
          flexShrink: 0,
        }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 20, fontWeight: 800, color: 'var(--text-0)', letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: 2 }}>
              Route Builder
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.1em' }}>
              {tile.url.includes('maptiler') ? 'MapTiler Outdoor' : 'Esri'} · {sport === 'Run' ? 'Running' : 'Cycling'}
            </div>
          </div>

          {startLat && startLng && (
            <div style={{
              marginBottom: 10,
              padding: '8px 10px',
              borderRadius: 9,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              color: 'var(--text-2)',
              lineHeight: 1.35,
            }}>
              Start location: <span style={{ color: 'var(--text-0)', fontWeight: 600 }}>{startName || coordStr(startLat, startLng)}</span>
            </div>
          )}

          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.1em', marginBottom: 8 }}>
            WORKFLOW
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6, marginBottom: 10 }}>
            {[
              { id: 'start', label: 'Start Location' },
              { id: 'training', label: 'Training' },
              { id: 'settings', label: 'Advanced Training Type' },
              { id: 'output', label: 'View' },
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => setMenuStep(s.id)}
                style={{
                  borderRadius: 8,
                  border: `1px solid ${menuStep === s.id ? 'var(--brand)' : 'rgba(255,255,255,0.1)'}`,
                  background: menuStep === s.id ? 'var(--brand-dim)' : 'rgba(255,255,255,0.04)',
                  color: menuStep === s.id ? 'var(--brand)' : 'var(--text-2)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  padding: '7px 6px',
                  fontWeight: menuStep === s.id ? 700 : 500,
                }}
              >
                {s.label}
              </button>
            ))}
          </div>

          {menuStep === 'start' && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-4)', letterSpacing: '0.08em', marginBottom: 7 }}>
                START POINT
              </div>
              {startLat && startLng ? (
                <div style={{ display: 'flex', gap: 5, marginBottom: 8, flexWrap: 'wrap' }}>
                  {homeLat && (
                    <button onClick={() => { setStartLat(homeLat); setStartLng(homeLng); setStartName(homeName); setMapFlyTo({ lat: parseFloat(homeLat), lng: parseFloat(homeLng), zoom: 13 }); }}
                      style={{ fontSize: 12, padding: '6px 11px', borderRadius: 8, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-1)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
                      Use home
                    </button>
                  )}
                  <button onClick={() => setMapPickMode('start')}
                    style={{ fontSize: 12, padding: '6px 11px', borderRadius: 8, background: mapPickMode === 'start' ? 'var(--brand-dim)' : 'rgba(255,255,255,0.07)', border: `1px solid ${mapPickMode === 'start' ? 'var(--brand)' : 'rgba(255,255,255,0.12)'}`, color: mapPickMode === 'start' ? 'var(--brand)' : 'var(--text-1)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
                    Select start on map
                  </button>
                  <button onClick={() => { setStartLat(''); setStartLng(''); setStartName(''); }}
                    style={{ fontSize: 12, padding: '6px 11px', borderRadius: 8, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
                    Clear
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  <button onClick={() => setMapPickMode('start')}
                    style={{ fontSize: 12, padding: '6px 11px', borderRadius: 8, background: mapPickMode === 'start' ? 'var(--brand-dim)' : 'rgba(255,255,255,0.07)', border: `1px solid ${mapPickMode === 'start' ? 'var(--brand)' : 'rgba(255,255,255,0.12)'}`, color: mapPickMode === 'start' ? 'var(--brand)' : 'var(--text-1)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
                    Pick start
                  </button>
                  <button onClick={handleDetectLocation}
                    style={{ fontSize: 12, padding: '6px 11px', borderRadius: 8, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-1)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
                    Use my location
                  </button>
                </div>
              )}
            </div>
          )}

          {menuStep === 'training' && <div style={{
            marginBottom: 10,
            padding: '11px 12px',
            background: 'rgba(255,255,255,0.045)',
            border: '1px solid rgba(255,255,255,0.11)',
            borderRadius: 12,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 8 }}>
              PICK FROM TRAINING LIBRARY
            </div>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              maxHeight: 250,
              overflowY: 'auto',
              paddingRight: 2,
            }}>
              {librarySessions.map((s) => {
                const isSelected = selectedLibrarySession === s.id;
                const total = Math.max(1, s.totalMin || 1);
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSelectedLibrarySession(s.id);
                      applyLibrarySession(s);
                    }}
                    style={{
                      border: `1px solid ${isSelected ? 'rgba(77,127,232,0.65)' : 'rgba(255,255,255,0.1)'}`,
                      background: isSelected ? 'rgba(77,127,232,0.16)' : 'rgba(255,255,255,0.03)',
                      borderRadius: 10,
                      padding: '9px 10px',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{
                      fontSize: 13,
                      color: 'var(--text-0)',
                      fontFamily: 'var(--font-sans)',
                      fontWeight: 600,
                      marginBottom: 7,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {s.title}
                    </div>

                    <div style={{
                      display: 'flex',
                      gap: 2,
                      height: 10,
                      borderRadius: 999,
                      overflow: 'hidden',
                      background: 'rgba(255,255,255,0.06)',
                      marginBottom: 7,
                    }}>
                      {s.blocks.slice(0, 16).map((b) => (
                        <div
                          key={b.id}
                          style={{
                            flex: `${Math.max(1, b.durationMin)} 1 0`,
                            background: ZONE_COLORS[b.zone] || 'var(--brand)',
                            minWidth: 4,
                          }}
                          title={`${b.zone} - ${b.durationMin} min`}
                        />
                      ))}
                    </div>

                    <div style={{
                      fontSize: 11,
                      color: 'var(--text-3)',
                      fontFamily: 'var(--font-mono)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}>
                      <span>{s.profile.sport} · {Math.round(total)} min</span>
                      <span>{workoutBlockSummary(s.blocks)}</span>
                    </div>
                  </button>
                );
              })}
              {!librarySessions.length && (
                <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                  No workout templates found.
                </div>
              )}
            </div>
            {!!selectedLibrarySession && (() => {
              const current = librarySessions.find(s => s.id === selectedLibrarySession);
              if (!current) return null;
              return (
                <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                    color: current.profile.sport === 'Run' ? '#f0b429' : '#4d7fe8',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 999,
                    padding: '3px 9px',
                  }}>{current.profile.sport}</span>
                  <span style={{
                    fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                    color: ZONE_COLORS[current.profile.zone] || 'var(--text-1)',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 999,
                    padding: '3px 9px',
                  }}>{current.profile.zone}</span>
                  <span style={{
                    fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-2)',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 999,
                    padding: '3px 9px',
                  }}>{current.profile.duration} min</span>
                </div>
              );
            })()}
          </div>}

          {menuStep === 'settings' && <>
            <div style={{ display: 'flex', gap: 7, marginBottom: 10 }}>
              <select value={sport} onChange={e => setSport(e.target.value)} style={{
                flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)',
                borderRadius: 8, padding: '8px 10px', color: 'var(--text-0)', fontFamily: 'var(--font-mono)', fontSize: 13, cursor: 'pointer',
              }}>
                <option value="Ride">Cycling</option>
                <option value="Run">Running</option>
              </select>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8, padding: '0 10px' }}>
                <input type="number" min="20" max="360" value={duration} onChange={e => setDuration(e.target.value)}
                  style={{ background: 'none', border: 'none', width: 44, color: 'var(--text-0)', fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700, outline: 'none', textAlign: 'right' }} />
                <span style={{ fontSize: 13, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>min</span>
              </div>
            </div>

            {sport === 'Ride' && (
              <div style={{ marginBottom: 10 }}>
                <PillToggle options={[{ id: 'road', label: 'Road' }, { id: 'quiet', label: 'Quiet' }, { id: 'gravel', label: 'Gravel' }, { id: 'mtb', label: 'MTB' }]} value={surface} onChange={setSurface} />
                <div style={{ fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-sans)', marginTop: 7, lineHeight: 1.5 }}>{SURFACE_DESC[surface]}</div>
              </div>
            )}

            <div style={{ marginBottom: 10 }}>
              <PillToggle options={[{ id: 'loop', label: 'Loop' }, { id: 'outback', label: 'Out & Back' }, { id: 'point', label: 'Point to Point' }]} value={routeType} onChange={setRouteType} />
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-sans)', marginBottom: 10 }}>
              Active terrain profile: <strong style={{ color: 'var(--text-1)' }}>{surface}</strong> ({SURFACE_PROFILES[surface] || 'fastbike'})
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-4)', letterSpacing: '0.1em', marginBottom: 6 }}>TERRAIN</div>
              <PillToggle options={[{ id: 'any', label: 'Any' }, { id: 'flat', label: 'Flat' }, { id: 'hilly', label: 'Hilly' }]} value={terrainPref} onChange={setTerrainPref} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-4)', letterSpacing: '0.1em', marginBottom: 6 }}>DIRECTION</div>
              <PillToggle options={[{ id: 'any', label: 'Any' }, { id: 'north', label: 'N' }, { id: 'east', label: 'E' }, { id: 'south', label: 'S' }, { id: 'west', label: 'W' }]} value={directionPref} onChange={setDirectionPref} />
            </div>
          </>}

          {menuStep === 'output' && (
            <div style={{ marginBottom: 12, padding: '10px 11px', borderRadius: 10, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
                Quick access to route output
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                <button onClick={() => setTab('generate')} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: tab === 'generate' ? 'var(--brand-dim)' : 'rgba(255,255,255,0.06)', color: 'var(--text-1)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
                  Open Generate
                </button>
                <button onClick={() => setTab('saved')} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: tab === 'saved' ? 'var(--brand-dim)' : 'rgba(255,255,255,0.06)', color: 'var(--text-1)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
                  Open Saved
                </button>
                <button
                  onClick={() => candidates[selected]?.coords?.length && exportGpxFile(`${sport}-${zone}-${candidates[selected]?.distanceKm}km`, exportCoords(candidates[selected]?.coords || []))}
                  disabled={!candidates[selected]?.coords?.length || isExportingGpx}
                  style={{ fontSize: 12, padding: '6px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(77,127,232,0.18)', color: '#fff', cursor: 'pointer', fontFamily: 'var(--font-mono)', opacity: (!candidates[selected]?.coords?.length || isExportingGpx) ? 0.5 : 1 }}
                >
                  {isExportingGpx ? 'Preparing...' : 'Download GPX'}
                </button>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.4 }}>
                Current tab: <span style={{ color: 'var(--text-1)' }}>{tab}</span><br />
                Candidate: <span style={{ color: 'var(--text-1)' }}>{candidates[selected]?.distanceKm ? `${candidates[selected].distanceKm} km` : 'none yet'}</span>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: 'flex', marginLeft: -18, marginRight: -18 }}>
            {[
              { id: 'generate', label: 'Generate' },
              { id: 'draw', label: editingRoute ? 'Editing' : 'Draw' },
              { id: 'saved', label: `Saved (${savedRoutes.length})` },
            ].map(t => {
              const isEdit = t.id === 'draw' && !!editingRoute;
              return (
                <button key={t.id} onClick={() => setTab(t.id)} style={{
                  flex: 1, padding: '11px 4px', background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font-mono)', fontSize: 14,
                  color: tab === t.id ? (isEdit ? 'var(--accent-orange)' : 'var(--text-0)') : 'var(--text-3)',
                  borderBottom: `2px solid ${tab === t.id ? (isEdit ? 'var(--accent-orange)' : 'var(--brand)') : 'transparent'}`,
                  fontWeight: tab === t.id ? 700 : 400, transition: 'all 0.15s',
                }}>
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Panel body */}
        <div style={{
          flex: '1 1 50%',
          height: '50%',
          minHeight: 0,
          maxHeight: '50%',
          overflowY: 'auto',
          overflowX: 'hidden',
          touchAction: 'pan-y',
          padding: 16,
          paddingBottom: 96,
          scrollbarGutter: 'stable both-edges',
          scrollbarWidth: 'thin',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
        }}>

          {/* GENERATE TAB */}
          {tab === 'generate' && (
            <div>
              {(todayIntervals || ['Z4', 'Z5'].includes(zone)) && (
                <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 10, background: 'rgba(77,127,232,0.1)', border: '1px solid rgba(77,127,232,0.25)' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--brand)', marginBottom: 4, letterSpacing: '0.08em' }}>
                    {todayIntervals ? 'INTERVAL WORKOUT DETECTED' : `${zone} — INTERVAL TERRAIN MODE`}
                  </div>
                  <div style={{ fontSize: 15, color: 'var(--text-1)', lineHeight: 1.55 }}>
                    {todayIntervals
                      ? `${todayIntervals.count}x intervals after ~${todayIntervals.warmupMin}min warmup (${warmupKmEst} km).`
                      : `${zone === 'Z5' ? 'VO2 max' : 'Threshold'} efforts — routes ranked to avoid descents in the hard section.`}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.5 }}>
                    Routes ranked by terrain — flat or uphill interval zone avoids losing power on descents.
                  </div>
                </div>
              )}
              {todayTraining && !todayIntervals && (
                <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 10, background: 'rgba(77,127,232,0.08)', border: '1px solid rgba(77,127,232,0.18)' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--brand)', marginBottom: 4 }}>TODAY</div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{todayTraining.title || todayTraining.name}</div>
                  <button style={{ fontSize: 12, marginTop: 8, padding: '5px 11px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
                    onClick={() => { const p = inferWorkoutProfile(todayTraining); if (p) { setSport(p.sport); setZone(p.zone); setDuration(p.duration); } }}>
                    Use for route
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--brand)', fontWeight: 700 }}>
                    ~{targetKm} km target
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>
                    {ftpBased
                      ? `${Math.round(zoneSpeedKmh(zone))} km/h · from ${ftp}W FTP`
                      : `${Math.round(zoneSpeedKmh(zone))} km/h · estimated`}
                  </div>
                </div>
                <button onClick={handleGenerate} disabled={genLoading || !startLat} style={{
                  padding: '10px 22px', borderRadius: 10, cursor: (genLoading || !startLat) ? 'default' : 'pointer',
                  background: startLat ? 'var(--brand)' : 'rgba(255,255,255,0.06)',
                  border: 'none', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600,
                  opacity: genLoading ? 0.7 : 1, transition: 'all 0.15s',
                }}>
                  {genLoading ? 'Routing...' : 'Generate'}
                </button>
              </div>

              {genError && (
                <div style={{ padding: '10px 14px', background: candidates.length > 0 ? 'rgba(247,127,58,0.1)' : 'rgba(240,96,96,0.12)', border: `1px solid ${candidates.length > 0 ? 'rgba(247,127,58,0.35)' : 'rgba(240,96,96,0.3)'}`, borderRadius: 8, fontSize: 13, color: candidates.length > 0 ? 'var(--accent-orange)' : 'var(--accent-red)', marginBottom: 14 }}>
                  {genError}
                </div>
              )}

              {candidates.map((c, i) => (
                <div key={c.id} onClick={() => setSelected(i)} style={{
                  padding: '13px 14px', borderRadius: 12, marginBottom: 8, cursor: 'pointer',
                  background: i === selected ? `${ROUTE_COLORS[i]}18` : 'rgba(255,255,255,0.03)',
                  border: `1.5px solid ${i === selected ? ROUTE_COLORS[i] : 'rgba(255,255,255,0.06)'}`,
                  transition: 'all 0.15s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: ROUTE_COLORS[i], marginBottom: 4 }}>
                        Route {c.label}{i === 0 ? ' — best match' : ''}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 700, lineHeight: 1 }}>{c.distanceKm} km</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                        {Math.abs(c.distanceKm - targetKm).toFixed(1)} km off target
                      </div>
                      {!!c.shape && (
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: c.shape.score >= 0.78 ? 'var(--accent-green)' : 'var(--accent-orange)', marginTop: 4 }}>
                          Clean turns: {Math.round(c.shape.score * 100)}%{c.shape.uTurns > 0 ? ` · ${c.shape.uTurns} u-turn` : ''}
                        </div>
                      )}
                      {c.elevation?.hasData && (
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                          +{c.elevation.climbM}m / -{c.elevation.descentM}m
                        </div>
                      )}
                      {c.estTimeMin != null && (
                        <div style={{
                          fontFamily: 'var(--font-mono)', fontSize: 11, marginTop: 4,
                          color: Math.abs(c.estTimeMin - Number(duration)) <= 5
                            ? 'var(--accent-green)' : 'var(--accent-orange)',
                        }}>
                          ~{c.estTimeMin}min on terrain
                          {Math.abs(c.estTimeMin - Number(duration)) > 5 &&
                            ` (planned ${duration}min)`}
                        </div>
                      )}
                    </div>
                    {c.intScore?.hasData && (
                      <div style={{ textAlign: 'right', minWidth: 80 }}>
                        <div style={{
                          display: 'inline-block', padding: '3px 8px', borderRadius: 5,
                          background: c.intScore.descentM > 40 ? 'rgba(247,127,58,0.15)' : 'rgba(62,207,110,0.15)',
                          border: `1px solid ${c.intScore.descentM > 40 ? 'rgba(247,127,58,0.4)' : 'rgba(62,207,110,0.4)'}`,
                          fontFamily: 'var(--font-mono)', fontSize: 10,
                          color: c.intScore.descentM > 40 ? 'var(--accent-orange)' : 'var(--accent-green)',
                          marginBottom: 4, lineHeight: 1.3, textAlign: 'center',
                        }}>
                          {c.intScore.descentM > 40 ? 'Descent in\nintervals' : 'Good\ninterval zone'}
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-4)', textAlign: 'right' }}>
                          interval zone:<br />+{c.intScore.climbM}m / -{c.intScore.descentM}m
                        </div>
                      </div>
                    )}
                  </div>
                  {c.intScore?.note && (
                    <div style={{ fontSize: 12, color: c.intScore.descentM > 40 ? 'var(--accent-orange)' : 'var(--text-3)', marginTop: 8, fontFamily: 'var(--font-mono)', lineHeight: 1.45, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8 }}>
                      {c.intScore.note}
                    </div>
                  )}
                </div>
              ))}

              {candidates.length > 0 && (
                <div style={{
                  display: 'flex',
                  gap: 7,
                  marginTop: 10,
                  position: 'sticky',
                  bottom: 8,
                  zIndex: 5,
                  padding: 8,
                  borderRadius: 10,
                  background: 'rgba(10,10,10,0.75)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}>
                  <button onClick={() => exportGpxFile(`${sport}-${zone}-${candidates[selected]?.distanceKm}km`, exportCoords(candidates[selected]?.coords || []))}
                    style={{ flex: 1, padding: '11px', borderRadius: 9, border: 'none', cursor: 'pointer', background: 'var(--brand)', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600 }}>
                    {isExportingGpx ? 'Preparing GPX...' : 'Download GPX'}
                  </button>
                  <button onClick={() => handleSaveRoute(`${sport} ${zone} ${candidates[selected]?.distanceKm}km`, exportCoords(candidates[selected]?.coords || []), candidates[selected]?.distanceKm, sport, [])}
                    style={{ padding: '11px 16px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', color: 'var(--text-1)', fontFamily: 'var(--font-mono)', fontSize: 14 }}>
                    Save
                  </button>
                </div>
              )}
              {saveMsg && <div style={{ fontSize: 13, color: 'var(--accent-green)', marginTop: 10, fontFamily: 'var(--font-mono)' }}>{saveMsg}</div>}
            </div>
          )}

          {/* DRAW TAB */}
          {tab === 'draw' && (
            <div>
              {editingRoute ? (
                <div style={{ marginBottom: 12, padding: '10px 13px', borderRadius: 10, background: 'rgba(247,127,58,0.1)', border: '1px solid rgba(247,127,58,0.3)' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent-orange)', marginBottom: 3 }}>EDITING</div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{editingRoute.name}</div>
                  <button onClick={clearDraw} style={{ fontSize: 12, marginTop: 6, padding: '4px 10px', borderRadius: 6, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>Cancel</button>
                </div>
              ) : (
                <div style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 12, lineHeight: 1.65, fontFamily: 'var(--font-sans)' }}>
                  Click the map to place waypoints. Segments snap to roads via {sport === 'Run' ? 'OSRM' : 'BRouter'}.
                </div>
              )}
              <div style={{
                marginBottom: 10,
                padding: '9px 11px',
                borderRadius: 8,
                background: 'rgba(77,127,232,0.08)',
                border: '1px solid rgba(77,127,232,0.2)',
                fontSize: 13,
                color: 'var(--text-2)',
                lineHeight: 1.45,
              }}>
                Click on the map to add waypoints. The route snaps to roads automatically. Click a pin on the map to remove it.
              </div>
              {waypoints.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  {waypoints.map((pt, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 4, border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: ROUTE_COLORS[i % 3], fontWeight: 700, minWidth: 20 }}>{i + 1}</div>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-1)' }}>{pt.name}</div>
                      <div style={{ display: 'flex', gap: 3 }}>
                        <button onClick={() => moveWaypoint(i, -1)} disabled={i === 0} style={{ padding: '3px 7px', fontSize: 11, borderRadius: 5, background: 'none', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-3)', cursor: 'pointer', opacity: i === 0 ? 0.3 : 1 }}>↑</button>
                        <button onClick={() => moveWaypoint(i, 1)} disabled={i === waypoints.length - 1} style={{ padding: '3px 7px', fontSize: 11, borderRadius: 5, background: 'none', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-3)', cursor: 'pointer', opacity: i === waypoints.length - 1 ? 0.3 : 1 }}>↓</button>
                        <button onClick={() => removeWaypoint(i)} style={{ padding: '3px 7px', fontSize: 11, borderRadius: 5, background: 'none', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--accent-red)', cursor: 'pointer' }}>×</button>
                      </div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--brand)', marginTop: 5 }}>
                    <span>{drawnDistKm} km · {waypoints.length} pts{routeType === 'outback' ? ` (${(drawnDistKm * 2).toFixed(1)} km total)` : ''}</span>
                    {drawLoading && <span style={{ color: 'var(--text-3)' }}>routing...</span>}
                  </div>
                </div>
              )}
              {waypoints.length > 1 && drawnCoords.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <input value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="Route name..."
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8, padding: '10px 12px', color: 'var(--text-0)', fontFamily: 'var(--font-mono)', fontSize: 14, outline: 'none' }} />
                  <div style={{ display: 'flex', gap: 7 }}>
                    <button onClick={() => exportGpxFile(saveName || `drawn-${drawnDistKm}km`, exportCoords(drawnCoords))}
                      style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', color: 'var(--text-1)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                      {isExportingGpx ? 'Preparing...' : 'GPX'}
                    </button>
                    <button onClick={() => handleSaveRoute(saveName, exportCoords(drawnCoords), routeType === 'outback' ? drawnDistKm * 2 : drawnDistKm, sport, waypoints)}
                      style={{ flex: 1, padding: '9px', borderRadius: 8, border: 'none', cursor: 'pointer', background: editingRoute ? 'var(--accent-orange)' : 'var(--brand)', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600 }}>
                      {editingRoute ? 'Save Changes' : 'Save'}
                    </button>
                  </div>
                </div>
              )}
              {waypoints.length > 0 && (
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  <button onClick={() => removeWaypoint(waypoints.length - 1)} style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer', background: 'none', color: 'var(--text-2)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    ↩ Undo last
                  </button>
                  <button onClick={clearDraw} style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer', background: 'none', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    Clear all
                  </button>
                </div>
              )}
              {saveMsg && <div style={{ fontSize: 13, color: 'var(--accent-green)', marginTop: 10, fontFamily: 'var(--font-mono)' }}>{saveMsg}</div>}
            </div>
          )}

          {/* SAVED TAB */}
          {tab === 'saved' && (
            <div>
              {savedRoutes.length === 0 ? (
                <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 14, fontFamily: 'var(--font-mono)' }}>
                  No saved routes yet.
                </div>
              ) : savedRoutes.map(r => (
                <div key={r.id} style={{
                  marginBottom: 10, borderRadius: 12, overflow: 'hidden',
                  background: previewRoute?.id === r.id ? 'rgba(77,127,232,0.08)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${previewRoute?.id === r.id ? 'rgba(77,127,232,0.35)' : 'rgba(255,255,255,0.07)'}`,
                  transition: 'all 0.15s',
                }}>
                  <div onClick={() => setPreviewRoute(previewRoute?.id === r.id ? null : r)} style={{ padding: '12px 14px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{r.name}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-3)', marginLeft: 8, flexShrink: 0 }}>{previewRoute?.id === r.id ? 'hide' : 'show'}</div>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>
                      {r.date} · {r.sport} · {r.zone}{r.surface && r.surface !== 'road' ? ` · ${r.surface}` : ''} · {r.distanceKm} km
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <RouteRating value={r.rating || 0} onChange={n => handleRateRoute(r.id, n)} />
                    </div>
                  </div>
                  {ratingRoute?.id === r.id && (
                    <div style={{ padding: '0 14px 12px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-3)', margin: '10px 0 6px' }}>Optional feedback — helps improve future routes</div>
                      <textarea defaultValue={r.feedback || ''} onChange={e => setRatingRoute(rv => ({ ...rv, feedbackText: e.target.value }))}
                        placeholder="What was good or bad about this route?"
                        style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, padding: '8px 10px', color: 'var(--text-0)', fontFamily: 'var(--font-mono)', fontSize: 13, resize: 'vertical', minHeight: 56, outline: 'none' }} />
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <button onClick={() => handleSaveFeedback(r.id, ratingRoute.feedbackText || r.feedback || '')}
                          style={{ flex: 1, padding: '7px', borderRadius: 7, border: 'none', cursor: 'pointer', background: 'var(--brand)', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>Save feedback</button>
                        <button onClick={() => setRatingRoute(null)}
                          style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', background: 'none', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>Skip</button>
                      </div>
                    </div>
                  )}
                  <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 5 }}>
                    <button onClick={() => { handleRateRoute(r.id, r.rating || 0); setRatingRoute({ id: r.id, rating: r.rating || 0 }); }}
                      style={{ fontSize: 12, padding: '5px 10px', borderRadius: 6, background: 'none', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>Rate</button>
                    <button onClick={() => handleEditRoute(r)}
                      style={{ fontSize: 12, padding: '5px 10px', borderRadius: 6, background: 'none', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>Edit</button>
                    <button onClick={() => exportGpxFile(r.name, r.coords)}
                      style={{ fontSize: 12, padding: '5px 10px', borderRadius: 6, background: 'none', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
                      {isExportingGpx ? 'Wait...' : 'GPX'}
                    </button>
                    <button onClick={() => handleDeleteRoute(r.id)}
                      style={{ fontSize: 12, padding: '5px 10px', borderRadius: 6, background: 'none', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--accent-red)', cursor: 'pointer', fontFamily: 'var(--font-mono)', marginLeft: 'auto' }}>Del</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right FABs ─────────────────────────────────────── */}
      <div style={{ position: 'absolute', top: 14, right: 14, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8, width: 'min(220px, calc(100vw - 28px))' }}>
        <Fab onClick={handleDetectLocation} disabled={detectingLoc}>
          {detectingLoc ? 'Locating...' : 'My Location'}
        </Fab>
        {startLat && !homeLat && (
          <Fab onClick={async () => { setHomeLat(startLat); setHomeLng(startLng); setHomeName(startName); const p = await persistence.getAthleteProfile(); await persistence.saveAthleteProfile({ ...(p || {}), homeLat: startLat, homeLng: startLng }); savePrefs({ homeLat: startLat, homeLng: startLng, homeName: startName }); }}>
            Set as Home
          </Fab>
        )}
        {mapPickMode && (
          <Fab onClick={() => setMapPickMode(null)} active>Cancel pick</Fab>
        )}

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '2px 0' }} />

        {/* POI category filters */}
        {POI_CATEGORIES.map(cat => {
          const isActive = activePoiCats.has(cat.id);
          const count = pois.filter(p => p.type === cat.id).length;
          return (
            <button key={cat.id} onClick={() => togglePoiCat(cat.id)} style={{
              ...GLASS,
              borderRadius: 12, padding: '10px 14px', cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 13,
              color: isActive ? cat.color : 'var(--text-2)',
              border: `1px solid ${isActive ? cat.color : 'rgba(255,255,255,0.07)'}`,
              background: isActive ? `${cat.color}1a` : 'rgba(10,10,10,0.90)',
              display: 'flex', alignItems: 'center', gap: 9,
              width: '100%', textAlign: 'left',
              transition: 'all 0.18s',
            }}>
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', lineHeight: 1, flexShrink: 0, minWidth: 22 }}>{cat.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.label}</div>
                {isActive && count > 0 && (
                  <div style={{ fontSize: 12, color: cat.color, opacity: 0.85, marginTop: 1 }}>{count} nearby - shown on map</div>
                )}
                {isActive && poisLoading && (
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>Loading...</div>
                )}
                {isActive && !poisLoading && count === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>None nearby. Move map.</div>
                )}
              </div>
              {isActive && (
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
              )}
            </button>
          );
        })}
      </div>

      {/* ── POI info card ──────────────────────────────────── */}
      {selectedPoi && (
        <PoiCard poi={selectedPoi} thumb={poiThumb} onClose={() => setSelectedPoi(null)} currentLocation={displayCurrentLocation} />
      )}

      {/* ── Map instruction banner ─────────────────────────── */}
      {(mapPickMode || (tab === 'draw' && !mapPickMode)) && (
        <div style={{
          position: 'absolute', bottom: selectedPoi ? 220 : 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 1000, pointerEvents: 'none',
          padding: '9px 22px', borderRadius: 22,
          background: mapPickMode ? 'rgba(77,127,232,0.9)' : editingRoute ? 'rgba(247,127,58,0.85)' : 'rgba(0,0,0,0.75)',
          color: '#fff', fontSize: 14, fontFamily: 'var(--font-mono)',
          backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
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
