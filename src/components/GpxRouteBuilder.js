import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Fix default leaflet marker icons (webpack issue)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// ── Helpers ─────────────────────────────────────────────────
const SPEED_KMPH = {
  Ride: { Z1: 20, Z2: 27, Z3: 32, Z4: 36, Z5: 40 },
  Run:  { Z1: 7,  Z2: 10, Z3: 13, Z4: 15, Z5: 17 },
};

function estimateDistanceKm(sport, zone, durationMin) {
  const speeds = SPEED_KMPH[sport] || SPEED_KMPH.Ride;
  const speed = speeds[zone] || 27;
  return Math.round((speed * durationMin) / 60 * 10) / 10;
}

// Move point by bearing (degrees) and distance (km)
function geodesicOffset(lat, lng, bearingDeg, distanceKm) {
  const R = 6371;
  const d = distanceKm / R;
  const b = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lng2 = lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: (lat2 * 180) / Math.PI, lng: ((lng2 * 180) / Math.PI + 540) % 360 - 180 };
}

// Generate N waypoints around a circle of radius km, starting at `rotation` degrees
function circleWaypoints(lat, lng, radiusKm, rotation, n = 3) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const angle = rotation + (i / n) * 360;
    pts.push(geodesicOffset(lat, lng, angle, radiusKm));
  }
  return pts;
}

// Haversine distance between two points (km)
function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Total distance of a GeoJSON line coordinate array [[lng,lat], ...]
function routeDistanceKm(coords) {
  let d = 0;
  for (let i = 1; i < coords.length; i++) {
    d += haversineKm({ lat: coords[i - 1][1], lng: coords[i - 1][0] }, { lat: coords[i][1], lng: coords[i][0] });
  }
  return d;
}

// Call OSRM trip endpoint (public, no key)
async function fetchOsrmRoute(startLat, startLng, waypoints, sport) {
  const profile = sport === 'Run' ? 'foot' : 'bike';
  // Add start as the first and last waypoint to close the loop
  const allPts = [{ lat: startLat, lng: startLng }, ...waypoints, { lat: startLat, lng: startLng }];
  const coords = allPts.map(p => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
  const url = `https://router.project-osrm.org/trip/v1/${profile}/${coords}?roundtrip=false&source=first&destination=last&overview=full&geometries=geojson`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const data = await res.json();
  if (data.code !== 'Ok' || !data.trips?.length) throw new Error('No route found');
  return data.trips[0]; // { geometry: { coordinates: [[lng,lat],...] }, distance (meters), duration (seconds) }
}

// Score a candidate route
function scoreRoute(candidate, targetKm) {
  const actualKm = candidate.distanceKm;
  const deviation = Math.abs(actualKm - targetKm) / targetKm;
  const distScore = Math.max(0, 1 - deviation * 2); // 0% deviation = 1.0, 50% = 0.0

  // Smoothness: fewer coordinates per km = more main roads (simpler geometry)
  // More coordinates per km = more winding paths / cycle-specific routes (better for cycling)
  const coordDensity = candidate.coords.length / actualKm;
  // Optimal density for cycling: 40-120 per km (urban cycling paths)
  const densityScore = Math.min(1, coordDensity / 80);

  return {
    total: distScore * 0.6 + densityScore * 0.4,
    distScore,
    densityScore,
    deviation,
  };
}

// Build justification text
function buildJustification(candidate, targetKm, rank) {
  const { distanceKm, score } = candidate;
  const pct = Math.round(score.deviation * 100);
  const quality = score.total >= 0.75 ? 'Excellent' : score.total >= 0.5 ? 'Good' : 'Acceptable';

  const lines = [];
  if (rank === 0) lines.push('Best match to your training target.');
  lines.push(`Route: ${distanceKm.toFixed(1)} km (target ${targetKm} km${pct > 0 ? `, ${pct}% deviation` : ', perfect match'}).`);
  lines.push(`OSRM cycling profile — prefers dedicated cycle paths and low-traffic roads over main roads.`);
  lines.push(`Road-following quality: ${quality} (${Math.round(score.total * 100)}/100).`);
  if (score.densityScore > 0.6) lines.push('High path density detected — likely urban cycling infrastructure.');
  else lines.push('Open road routing — suitable for road cycling.');
  return lines.join(' ');
}

// Convert OSRM GeoJSON coords to GPX string
function coordsToGpx(name, coords) {
  const pts = coords.map(([lng, lat]) => `    <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="CoachCenter APEX" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${name}</name><time>${new Date().toISOString()}</time></metadata>
  <trk><name>${name}</name><trkseg>\n${pts}\n  </trkseg></trk>
</gpx>`;
}

function downloadGpx(name, coords) {
  const gpx = coordsToGpx(name, coords);
  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.gpx`;
  a.click();
  URL.revokeObjectURL(url);
}

// Leaflet helper: auto-fit map bounds to displayed routes
function FitBounds({ candidates }) {
  const map = useMap();
  useEffect(() => {
    if (!candidates?.length) return;
    const allCoords = candidates.flatMap(c => c.coords.map(([lng, lat]) => [lat, lng]));
    if (allCoords.length > 0) {
      try { map.fitBounds(allCoords, { padding: [24, 24] }); } catch (_) {}
    }
  }, [candidates, map]);
  return null;
}

const ROUTE_COLORS = ['#3b82f6', '#22c55e', '#f97316'];
const ROUTE_LABELS = ['Route A', 'Route B', 'Route C'];

// Load preferences from localStorage
function loadPrefs() {
  try { return JSON.parse(localStorage.getItem('apex-gpx-prefs') || '{}'); } catch (_) { return {}; }
}
function savePrefs(prefs) {
  try { localStorage.setItem('apex-gpx-prefs', JSON.stringify(prefs)); } catch (_) {}
}

export default function GpxRouteBuilder({ athlete }) {
  const prefs = loadPrefs();

  const [sport, setSport] = useState(prefs.sport || 'Ride');
  const [zone, setZone] = useState(prefs.zone || 'Z2');
  const [duration, setDuration] = useState(prefs.duration || 90);
  const [lat, setLat] = useState(prefs.lat || '');
  const [lng, setLng] = useState(prefs.lng || '');
  const [locStatus, setLocStatus] = useState(prefs.lat ? `Saved location: ${Number(prefs.lat).toFixed(4)}°, ${Number(prefs.lng).toFixed(4)}°` : '');
  const [candidates, setCandidates] = useState([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Persist prefs on change
  useEffect(() => {
    savePrefs({ sport, zone, duration, lat, lng });
  }, [sport, zone, duration, lat, lng]);

  const targetKm = estimateDistanceKm(sport, zone, Number(duration));

  const handleGetLocation = () => {
    if (!navigator.geolocation) { setLocStatus('Geolocation not supported.'); return; }
    setLocStatus('Detecting...');
    navigator.geolocation.getCurrentPosition(
      pos => {
        const la = pos.coords.latitude.toFixed(5);
        const ln = pos.coords.longitude.toFixed(5);
        setLat(la); setLng(ln);
        setLocStatus(`Location set: ${Number(la).toFixed(4)}°, ${Number(ln).toFixed(4)}°`);
      },
      () => setLocStatus('Could not get location — enter coordinates manually.'),
      { timeout: 8000 }
    );
  };

  const handleGenerate = async () => {
    const la = parseFloat(lat);
    const ln = parseFloat(lng);
    if (isNaN(la) || isNaN(ln)) { setError('Set your starting location first.'); return; }
    setError(null);
    setLoading(true);
    setCandidates([]);

    const radius = targetKm / (2 * Math.PI);

    // Try 3 rotations: 0°, 40°, 80° for variety
    const rotations = [0, 40, 80];

    try {
      const results = await Promise.allSettled(
        rotations.map(rot => {
          const wpts = circleWaypoints(la, ln, radius, rot, 3);
          return fetchOsrmRoute(la, ln, wpts, sport);
        })
      );

      const valid = results
        .map((r, i) => {
          if (r.status !== 'fulfilled') return null;
          const trip = r.value;
          const coords = trip.geometry.coordinates;
          const distanceKm = Math.round(routeDistanceKm(coords) * 10) / 10;
          const score = scoreRoute({ coords, distanceKm }, targetKm);
          return { id: i, label: ROUTE_LABELS[i], coords, distanceKm, durationMin: Math.round(trip.duration / 60), score, rotation: rotations[i] };
        })
        .filter(Boolean)
        .sort((a, b) => b.score.total - a.score.total);

      if (!valid.length) throw new Error('No routes returned. Try a different location or distance.');
      setCandidates(valid);
      setSelected(0);
    } catch (err) {
      setError(err.message || 'Route generation failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!candidates[selected]) return;
    const c = candidates[selected];
    const name = `APEX-${sport}-${zone}-${c.distanceKm}km`;
    downloadGpx(name, c.coords);
  };

  const mapCenter = lat && lng ? [parseFloat(lat), parseFloat(lng)] : [48.8566, 2.3522];

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header">
        <span className="card-title">GPX Route Generator</span>
        <span className="card-badge">OSRM · Road-following</span>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <select className="form-input" style={{ flex: 1, minWidth: 100 }} value={sport} onChange={e => setSport(e.target.value)}>
          <option value="Ride">Cycling</option>
          <option value="Run">Running</option>
        </select>
        <select className="form-input" style={{ flex: 1, minWidth: 100 }} value={zone} onChange={e => setZone(e.target.value)}>
          <option value="Z1">Z1 — Recovery</option>
          <option value="Z2">Z2 — Endurance</option>
          <option value="Z3">Z3 — Tempo</option>
          <option value="Z4">Z4 — Threshold</option>
          <option value="Z5">Z5 — VO2 Max</option>
        </select>
        <input className="form-input" style={{ flex: 1, minWidth: 80 }} type="number" min="20" max="300" value={duration} onChange={e => setDuration(e.target.value)} placeholder="Duration (min)" />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input className="form-input" style={{ flex: 1 }} placeholder="Latitude" value={lat} onChange={e => setLat(e.target.value)} />
        <input className="form-input" style={{ flex: 1 }} placeholder="Longitude" value={lng} onChange={e => setLng(e.target.value)} />
        <button className="btn" onClick={handleGetLocation}>My Location</button>
      </div>

      {locStatus && (
        <div style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>{locStatus}</div>
      )}

      <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12 }}>
        Target: <strong style={{ color: 'var(--accent-blue)' }}>{targetKm} km</strong> — {sport} {zone} · {duration} min
      </div>

      <button className="btn btn-primary" onClick={handleGenerate} disabled={loading} style={{ width: '100%', marginBottom: 12 }}>
        {loading ? 'Fetching routes from OSRM...' : 'Generate Routes'}
      </button>

      {error && <div className="error-banner" style={{ marginBottom: 12 }}><span className="error-tag">[ERR]</span> {error}</div>}

      {/* Map preview */}
      {(lat && lng) && (
        <div style={{ height: 320, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 12 }}>
          <MapContainer center={mapCenter} zoom={12} style={{ height: '100%', width: '100%' }} zoomControl={true}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {candidates.map((c, i) => (
              <Polyline
                key={c.id}
                positions={c.coords.map(([ln, la]) => [la, ln])}
                pathOptions={{
                  color: ROUTE_COLORS[i % ROUTE_COLORS.length],
                  weight: i === selected ? 4 : 2,
                  opacity: i === selected ? 1 : 0.4,
                }}
                eventHandlers={{ click: () => setSelected(i) }}
              />
            ))}
            {lat && lng && <Marker position={[parseFloat(lat), parseFloat(lng)]} />}
            {candidates.length > 0 && <FitBounds candidates={candidates} />}
          </MapContainer>
        </div>
      )}

      {/* Route options */}
      {candidates.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {candidates.map((c, i) => (
              <button
                key={c.id}
                onClick={() => setSelected(i)}
                style={{
                  flex: 1, minWidth: 100,
                  padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                  background: i === selected ? `${ROUTE_COLORS[i]}20` : 'var(--bg-2)',
                  border: `2px solid ${i === selected ? ROUTE_COLORS[i] : 'var(--border)'}`,
                  textAlign: 'left',
                }}
              >
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: ROUTE_COLORS[i], marginBottom: 2 }}>
                  {c.label} {i === 0 ? '★ BEST' : ''}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text-0)' }}>
                  {c.distanceKm} km
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>
                  {c.durationMin} min · score {Math.round(c.score.total * 100)}/100
                </div>
              </button>
            ))}
          </div>

          {/* Justification for selected route */}
          {candidates[selected] && (
            <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderLeft: `3px solid ${ROUTE_COLORS[selected]}`, borderRadius: 8, padding: '12px 14px', marginBottom: 12, fontSize: 12, color: 'var(--text-1)', lineHeight: 1.7, fontFamily: 'var(--font-sans)' }}>
              {buildJustification(candidates[selected], targetKm, selected)}
            </div>
          )}

          <button className="btn btn-primary" onClick={handleDownload} style={{ width: '100%' }}>
            Download {candidates[selected]?.label} GPX ({candidates[selected]?.distanceKm} km)
          </button>
        </>
      )}

      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
        Routes generated by OSRM · cycling profile prefers dedicated paths · road-following, not geometric
      </div>
    </div>
  );
}
