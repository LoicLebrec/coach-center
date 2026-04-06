import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, GeoJSON as LeafletGeoJSON, CircleMarker, Popup, useMap } from 'react-leaflet';
import { format, parseISO, addDays, startOfToday, startOfWeek, differenceInDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { fetchRaces } from '../services/racesService';
import HelpPopup from './HelpPopup';

// ── GeoJSON ────────────────────────────────────────────────────────────────
const GEOJSON_URL =
  'https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements-version-simplifiee.geojson';

// ── Region → departments ───────────────────────────────────────────────────
const REGIONS = {
  'Île-de-France':          ['75','77','78','91','92','93','94','95'],
  'Auvergne-Rhône-Alpes':   ['01','03','07','15','26','38','42','43','63','69','73','74'],
  'Bourgogne-Franche-Comté':['21','25','39','58','70','71','89','90'],
  'Bretagne':               ['22','29','35','56'],
  'Centre-Val de Loire':    ['18','28','36','37','41','45'],
  'Grand Est':              ['08','10','51','52','54','55','57','67','68','88'],
  'Hauts-de-France':        ['02','59','60','62','80'],
  'Normandie':              ['14','27','50','61','76'],
  'Nouvelle-Aquitaine':     ['16','17','19','23','24','33','40','47','64','79','86','87'],
  'Occitanie':              ['09','11','12','30','31','32','34','46','48','65','66','81','82'],
  'Pays de la Loire':       ['44','49','53','72','85'],
  "PACA":                   ['04','05','06','13','83','84'],
  'Corse':                  ['2A','2B'],
};

const DEPT_NAMES = {
  '01':'Ain','02':'Aisne','03':'Allier','04':'Alpes-de-Haute-Provence',
  '05':'Hautes-Alpes','06':'Alpes-Maritimes','07':'Ardèche','08':'Ardennes',
  '09':'Ariège','10':'Aube','11':'Aude','12':'Aveyron','13':'Bouches-du-Rhône',
  '14':'Calvados','15':'Cantal','16':'Charente','17':'Charente-Maritime',
  '18':'Cher','19':'Corrèze','21':"Côte-d'Or",'22':"Côtes-d'Armor",
  '23':'Creuse','24':'Dordogne','25':'Doubs','26':'Drôme','27':'Eure',
  '28':'Eure-et-Loir','29':'Finistère','2A':'Corse-du-Sud','2B':'Haute-Corse',
  '30':'Gard','31':'Haute-Garonne','32':'Gers','33':'Gironde','34':'Hérault',
  '35':'Ille-et-Vilaine','36':'Indre','37':'Indre-et-Loire','38':'Isère',
  '39':'Jura','40':'Landes','41':'Loir-et-Cher','42':'Loire',
  '43':'Haute-Loire','44':'Loire-Atlantique','45':'Loiret','46':'Lot',
  '47':'Lot-et-Garonne','48':'Lozère','49':'Maine-et-Loire','50':'Manche',
  '51':'Marne','52':'Haute-Marne','53':'Mayenne','54':'Meurthe-et-Moselle',
  '55':'Meuse','56':'Morbihan','57':'Moselle','58':'Nièvre','59':'Nord',
  '60':'Oise','61':'Orne','62':'Pas-de-Calais','63':'Puy-de-Dôme',
  '64':'Pyrénées-Atlantiques','65':'Hautes-Pyrénées','66':'Pyrénées-Orientales',
  '67':'Bas-Rhin','68':'Haut-Rhin','69':'Rhône','70':'Haute-Saône',
  '71':'Saône-et-Loire','72':'Sarthe','73':'Savoie','74':'Haute-Savoie',
  '75':'Paris','76':'Seine-Maritime','77':'Seine-et-Marne','78':'Yvelines',
  '79':'Deux-Sèvres','80':'Somme','81':'Tarn','82':'Tarn-et-Garonne',
  '83':'Var','84':'Vaucluse','85':'Vendée','86':'Vienne',
  '87':'Haute-Vienne','88':'Vosges','89':'Yonne','90':'Territoire de Belfort',
  '91':'Essonne','92':'Hauts-de-Seine','93':'Seine-Saint-Denis',
  '94':'Val-de-Marne','95':"Val-d'Oise",
};

const FED_COLORS = {
  FFC: '#4d7fe8', FSGT: '#22c55e', UFOLEP: '#f97316', FFCT: '#a855f7',
};

// ── Department centroid coordinates [lat, lng] ──────────────────────────────
const DEPT_CENTROIDS = {
  '01':[46.21,5.22],'02':[49.55,3.61],'03':[46.34,3.12],'04':[44.10,6.24],
  '05':[44.70,6.37],'06':[43.92,7.18],'07':[44.80,4.54],'08':[49.72,4.72],
  '09':[42.92,1.52],'10':[48.32,4.11],'11':[43.12,2.35],'12':[44.32,2.68],
  '13':[43.52,5.43],'14':[49.10,-0.35],'15':[45.05,2.65],'16':[45.70,0.16],
  '17':[45.83,-0.73],'18':[47.08,2.42],'19':[45.37,1.88],'21':[47.31,4.83],
  '22':[48.42,-2.75],'23':[46.00,2.03],'24':[45.03,0.88],'25':[47.12,6.37],
  '26':[44.73,5.10],'27':[49.12,1.07],'28':[48.43,1.38],'29':[48.24,-4.12],
  '30':[44.00,4.13],'31':[43.45,1.45],'32':[43.64,0.58],'33':[44.83,-0.57],
  '34':[43.60,3.55],'35':[48.09,-1.68],'36':[46.59,1.58],'37':[47.19,0.68],
  '38':[45.18,5.72],'39':[46.73,5.57],'40':[44.00,-0.69],'41':[47.59,1.31],
  '42':[45.60,4.32],'43':[45.12,3.92],'44':[47.32,-1.70],'45':[47.91,2.31],
  '46':[44.60,1.66],'47':[44.35,0.53],'48':[44.55,3.48],'49':[47.39,-0.56],
  '50':[49.09,-1.27],'51':[49.05,4.35],'52':[48.09,5.32],'53':[48.06,-0.60],
  '54':[48.69,6.18],'55':[48.89,5.38],'56':[47.91,-2.77],'57':[49.05,6.82],
  '58':[47.14,3.67],'59':[50.52,3.12],'60':[49.32,2.52],'61':[48.55,0.08],
  '62':[50.52,2.49],'63':[45.73,3.12],'64':[43.35,-0.78],'65':[43.10,0.17],
  '66':[42.74,2.55],'67':[48.58,7.48],'68':[47.89,7.26],'69':[45.74,4.66],
  '70':[47.60,6.18],'71':[46.52,4.72],'72':[47.93,0.20],'73':[45.48,6.43],
  '74':[46.00,6.41],'75':[48.86,2.33],'76':[49.60,1.10],'77':[48.64,2.94],
  '78':[48.81,1.81],'79':[46.50,-0.45],'80':[49.92,2.31],'81':[43.90,2.10],
  '82':[44.02,1.30],'83':[43.39,6.22],'84':[43.95,5.29],'85':[46.67,-1.27],
  '86':[46.58,0.37],'87':[45.82,1.27],'88':[48.18,6.47],'89':[47.73,3.57],
  '90':[47.64,6.87],'91':[48.52,2.28],'92':[48.89,2.22],'93':[48.91,2.42],
  '94':[48.79,2.47],'95':[49.08,2.10],'2A':[41.86,9.02],'2B':[42.35,9.25],
};

// ── Date helpers ──────────────────────────────────────────────────────────────
function localDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const DATE_PRESETS = [
  { label: '2 sem', days: 14 },
  { label: '1 mois', days: 31 },
  { label: '3 mois', days: 92 },
  { label: '6 mois', days: 184 },
  { label: 'Tout', days: 400 },
];

// ── Nominatim geocoder (lazy, rate-limited, session-cached) ──────────────────
const geocodeCache = {}; // city_dept → [lat, lng] | null

async function geocodeCity(city, dept, countryCode = 'fr') {
  const key = `${city}|${dept}`;
  if (key in geocodeCache) return geocodeCache[key];
  try {
    const q = encodeURIComponent(`${city}, France`);
    const url = `https://nominatim.openstreetmap.org/search?q=${q}&countrycodes=${countryCode}&limit=1&format=json`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'fr', 'User-Agent': 'CoachCenterApp/1.0' } });
    if (!res.ok) { geocodeCache[key] = null; return null; }
    const data = await res.json();
    if (data.length > 0) {
      const coords = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
      geocodeCache[key] = coords;
      return coords;
    }
  } catch { /* ignore */ }
  geocodeCache[key] = null;
  return null;
}

// ── MapZoomer ─────────────────────────────────────────────────────────────
function MapZoomer({ bounds }) {
  const map = useMap();
  const prev = useRef(null);
  useEffect(() => {
    if (bounds && bounds !== prev.current) {
      prev.current = bounds;
      map.fitBounds(bounds, { padding: [30, 30], animate: true });
    }
  }, [bounds, map]);
  return null;
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function RaceCalendar({ onAddToCalendar, plannedEvents = [] }) {
  const [geoJson, setGeoJson] = useState(null);
  const [allRaces, setAllRaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedDept, setSelectedDept] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [fedFilter, setFedFilter] = useState('');
  const [mapBounds, setMapBounds] = useState(null);

  const [saveModal, setSaveModal] = useState(null);
  const [taperEnabled, setTaperEnabled] = useState(true);
  const [savedIds, setSavedIds] = useState(new Set());
  const [rangePreset, setRangePreset] = useState(1); // index into DATE_PRESETS, default 1 mois
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [cityCoords, setCityCoords] = useState({}); // "city|dept" → [lat, lng]

  const geoLayerRef = useRef(null);
  const geocodeQueueRef = useRef(null);
  const today = startOfToday();

  const rangeStart = customStart || localDateStr(today);
  const rangeEnd = customEnd || localDateStr(addDays(today, DATE_PRESETS[rangePreset]?.days ?? 31));

  // ── Load GeoJSON ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(GEOJSON_URL)
      .then(r => r.json())
      .then(setGeoJson)
      .catch(() => setError('Carte non disponible.'));
  }, []);

  // ── Load races ────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchRaces()
      .then(data => setAllRaces(data))
      .catch(() => setError('Impossible de charger les courses. Vérifiez votre connexion.'))
      .finally(() => setLoading(false));
  }, []);

  // ── Lazy geocoding: resolve city names → precise [lat, lng] ──────────────
  useEffect(() => {
    if (allRaces.length === 0) return;
    // Cancel previous queue
    if (geocodeQueueRef.current) clearTimeout(geocodeQueueRef.current);

    // Collect unique city|dept pairs that have a city but no cached coords
    const toGeocode = [];
    const seen = new Set();
    for (const r of allRaces) {
      if (!r.city || !r.department) continue;
      const key = `${r.city}|${r.department}`;
      if (seen.has(key) || key in geocodeCache) continue;
      seen.add(key);
      toGeocode.push({ city: r.city, dept: r.department, key });
    }
    if (toGeocode.length === 0) return;

    // Process one at a time with 300ms delay (Nominatim rate limit: 1 req/s)
    let i = 0;
    const processNext = async () => {
      if (i >= toGeocode.length) return;
      const { city, dept, key } = toGeocode[i++];
      const coords = await geocodeCity(city, dept);
      if (coords) {
        setCityCoords(prev => ({ ...prev, [key]: coords }));
      }
      geocodeQueueRef.current = setTimeout(processNext, 350);
    };
    geocodeQueueRef.current = setTimeout(processNext, 500);

    return () => { if (geocodeQueueRef.current) clearTimeout(geocodeQueueRef.current); };
  }, [allRaces]);

  // ── Race counts by date (within range) ───────────────────────────────────
  const countByDate = useMemo(() => {
    const m = {};
    allRaces.forEach(r => {
      if (!r.date) return;
      if (r.date < rangeStart || r.date > rangeEnd) return;
      if (selectedDept && r.department !== selectedDept) return;
      if (fedFilter && r.federation !== fedFilter) return;
      m[r.date] = (m[r.date] || 0) + 1;
    });
    return m;
  }, [allRaces, selectedDept, fedFilter, rangeStart, rangeEnd]);

  // ── Race counts by dept (within range) ───────────────────────────────────
  const countByDept = useMemo(() => {
    const m = {};
    allRaces.forEach(r => {
      if (!r.department) return;
      if (r.date < rangeStart || r.date > rangeEnd) return;
      if (fedFilter && r.federation !== fedFilter) return;
      if (selectedDate && r.date !== selectedDate) return;
      m[r.department] = (m[r.department] || 0) + 1;
    });
    return m;
  }, [allRaces, fedFilter, selectedDate, rangeStart, rangeEnd]);

  // ── Filtered races (within range) ────────────────────────────────────────
  const filteredRaces = useMemo(() => allRaces.filter(r => {
    if (!r.date) return false;
    if (r.date < rangeStart || r.date > rangeEnd) return false;
    if (selectedDept && r.department !== selectedDept) return false;
    if (selectedDate && r.date !== selectedDate) return false;
    if (fedFilter && r.federation !== fedFilter) return false;
    return true;
  }), [allRaces, selectedDept, selectedDate, fedFilter, rangeStart, rangeEnd]);

  // ── Race markers: group by precise city coords (or dept centroid fallback) ──
  const raceMarkers = useMemo(() => {
    const m = {};
    filteredRaces.forEach(r => {
      const cityKey = r.city && r.department ? `${r.city}|${r.department}` : null;
      const precise = cityKey ? (cityCoords[cityKey] || geocodeCache[cityKey] || null) : null;
      const fallback = r.department ? DEPT_CENTROIDS[r.department] : null;
      const coords = precise || fallback;
      if (!coords) return;
      // Use precise coords as key if available, else dept
      const markerKey = precise ? cityKey : `dept:${r.department}`;
      if (!m[markerKey]) m[markerKey] = { coords, races: [], precise: !!precise, dept: r.department };
      m[markerKey].races.push(r);
    });
    return Object.values(m);
  }, [filteredRaces, cityCoords]);

  // ── Calendar grid: weeks covering the selected range ─────────────────────
  const calendarWeeks = useMemo(() => {
    const start = parseISO(rangeStart);
    const end = parseISO(rangeEnd);
    const weekStart = startOfWeek(start, { weekStartsOn: 1 });
    const weeks = [];
    let w = 0;
    while (true) {
      const wStart = addDays(weekStart, w * 7);
      if (wStart > end) break;
      if (w > 52) break; // safety cap
      const days = [];
      for (let d = 0; d < 7; d++) {
        const date = addDays(wStart, d);
        const key = format(date, 'yyyy-MM-dd');
        days.push({ date, key, count: countByDate[key] || 0, inRange: key >= rangeStart && key <= rangeEnd });
      }
      const weekTotal = days.reduce((s, d) => s + d.count, 0);
      weeks.push({ days, weekTotal });
      w++;
    }
    return weeks;
  }, [countByDate, rangeStart, rangeEnd]);

  // ── Map style ─────────────────────────────────────────────────────────────
  const styleFeature = useCallback((feature) => {
    const code = feature?.properties?.code;
    const count = countByDept[code] || 0;
    const isSelected = code === selectedDept;
    const inRegion = selectedRegion
      ? (REGIONS[selectedRegion] || []).includes(code)
      : true;

    let fill = '#1e293b';
    if (count >= 5) fill = '#1d4ed8';
    else if (count >= 3) fill = '#2563eb';
    else if (count >= 1) fill = '#3b82f6';

    return {
      fillColor: isSelected ? '#22d3ee' : fill,
      fillOpacity: isSelected ? 0.9 : inRegion ? (count > 0 ? 0.75 : 0.25) : 0.1,
      color: isSelected ? '#22d3ee' : '#334155',
      weight: isSelected ? 2.5 : 0.8,
    };
  }, [countByDept, selectedDept, selectedRegion]);

  // ── Map events ────────────────────────────────────────────────────────────
  const onEachFeature = useCallback((feature, layer) => {
    const code = feature?.properties?.code;
    const name = DEPT_NAMES[code] || feature?.properties?.nom || code;
    const count = countByDept[code] || 0;

    layer.bindTooltip(
      `<b>${code} — ${name}</b>${count > 0 ? `<br/>${count} course${count > 1 ? 's' : ''}` : ''}`,
      { sticky: true }
    );

    layer.on({
      click: (e) => {
        setSelectedDept(prev => prev === code ? null : code);
        setSelectedDate(null);
        setSelectedRegion(null);
        setMapBounds(e.target.getBounds());
      },
      mouseover: (e) => {
        e.target.setStyle({ fillOpacity: 0.95, weight: 2 });
        e.target.bringToFront();
      },
      mouseout: (e) => {
        e.target.setStyle(styleFeature(feature));
      },
    });
  }, [countByDept, styleFeature]);

  // ── Save race ─────────────────────────────────────────────────────────────
  const handleSaveRace = useCallback(() => {
    if (!saveModal || !onAddToCalendar) return;
    const race = saveModal;

    onAddToCalendar({
      title: race.name,
      date: parseISO(race.date),
      type: 'Race',
      kind: 'race',
      notes: [
        `Fédération: ${race.federation}`,
        race.category ? `Catégorie: ${race.category}` : null,
        race.department ? `Département: ${race.department} — ${DEPT_NAMES[race.department] || ''}` : null,
        `Source: ${race.url}`,
      ].filter(Boolean).join('\n'),
      source: 'cyclisme-amateur',
      isTargetRace: true,
      preparationEnabled: taperEnabled,
    });

    if (taperEnabled) {
      const raceDate = parseISO(race.date);
      const taperDate = addDays(raceDate, -10);
      if (differenceInDays(taperDate, today) >= 0) {
        onAddToCalendar({
          title: `⚡ Affûtage — ${race.name}`,
          date: taperDate,
          type: 'Note',
          kind: 'training',
          notes: `Début de l'affûtage. Volume -35%, garder 2 efforts courts et intenses.`,
          source: 'auto-taper',
        });
      }
      onAddToCalendar({
        title: `💤 Récupération — ${race.name}`,
        date: addDays(raceDate, 1),
        type: 'Note',
        kind: 'training',
        notes: `Récupération post-course. Z1/Z2 uniquement pendant 4-5 jours.`,
        source: 'auto-recovery',
      });
    }

    setSavedIds(prev => new Set([...prev, race.id]));
    setSaveModal(null);
  }, [saveModal, taperEnabled, onAddToCalendar, today]);

  const alreadySaved = useCallback((race) => {
    if (savedIds.has(race.id)) return true;
    return plannedEvents.some(e =>
      e.source === 'cyclisme-amateur' && (e.notes || '').includes(race.url)
    );
  }, [savedIds, plannedEvents]);

  const daysUntil = (dateStr) => {
    const d = differenceInDays(parseISO(dateStr), today);
    if (d === 0) return "Aujourd'hui";
    if (d === 1) return 'Demain';
    return `J-${d}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Filters bar ── */}
      <div className="card" style={{ padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Federation */}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-4)', marginRight: 2 }}>Fédération :</span>
        {['', 'FFC', 'FSGT', 'UFOLEP', 'FFCT'].map(f => (
          <button key={f} onClick={() => setFedFilter(f)} style={{
            padding: '4px 11px', borderRadius: 6, fontSize: 11, fontFamily: 'var(--font-mono)',
            fontWeight: 700, cursor: 'pointer', border: '1px solid',
            borderColor: fedFilter === f ? (FED_COLORS[f] || 'var(--accent-cyan)') : 'var(--border)',
            background: fedFilter === f ? `${FED_COLORS[f] || 'var(--accent-cyan)'}25` : 'var(--bg-2)',
            color: fedFilter === f ? (FED_COLORS[f] || 'var(--accent-cyan)') : 'var(--text-3)',
            transition: 'all 0.15s',
          }}>
            {f || 'Toutes'}
          </button>
        ))}

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

        {/* Date range presets */}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-4)' }}>Période :</span>
        {DATE_PRESETS.map((p, i) => (
          <button key={p.label} onClick={() => { setRangePreset(i); setCustomStart(''); setCustomEnd(''); setSelectedDate(null); }} style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 11, fontFamily: 'var(--font-mono)',
            fontWeight: 600, cursor: 'pointer', border: '1px solid',
            borderColor: rangePreset === i && !customStart ? 'var(--accent-cyan)' : 'var(--border)',
            background: rangePreset === i && !customStart ? 'rgba(34,211,238,0.12)' : 'var(--bg-2)',
            color: rangePreset === i && !customStart ? 'var(--accent-cyan)' : 'var(--text-3)',
            transition: 'all 0.15s',
          }}>
            {p.label}
          </button>
        ))}

        {/* Custom date pickers */}
        <input type="date" value={customStart} onChange={e => { setCustomStart(e.target.value); setSelectedDate(null); }}
          style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, color: customStart ? 'var(--text-1)' : 'var(--text-4)', fontSize: 11, padding: '3px 7px', fontFamily: 'var(--font-mono)', cursor: 'pointer' }}
        />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-4)' }}>→</span>
        <input type="date" value={customEnd} onChange={e => { setCustomEnd(e.target.value); setSelectedDate(null); }}
          style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, color: customEnd ? 'var(--text-1)' : 'var(--text-4)', fontSize: 11, padding: '3px 7px', fontFamily: 'var(--font-mono)', cursor: 'pointer' }}
        />
        {(customStart || customEnd) && (
          <button onClick={() => { setCustomStart(''); setCustomEnd(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
            ✕ réinitialiser
          </button>
        )}

        {/* Active filters */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {selectedDept && (
            <span style={{
              padding: '4px 10px', borderRadius: 20, fontSize: 11,
              background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.3)',
              color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {selectedDept} — {DEPT_NAMES[selectedDept]}
              <button onClick={() => { setSelectedDept(null); setMapBounds(null); }}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1 }}>✕</button>
            </span>
          )}
          {selectedDate && (
            <span style={{
              padding: '4px 10px', borderRadius: 20, fontSize: 11,
              background: 'rgba(77,127,232,0.12)', border: '1px solid rgba(77,127,232,0.3)',
              color: '#4d7fe8', fontFamily: 'var(--font-mono)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {format(parseISO(selectedDate), 'd MMM', { locale: fr })}
              <button onClick={() => setSelectedDate(null)}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1 }}>✕</button>
            </span>
          )}
        </div>
      </div>

      {/* ── Map + calendar grid side by side ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}>

        {/* ── LEFT: France map ── */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 700, color: 'var(--text-0)', display: 'flex', alignItems: 'center' }}>
              Carte des courses
              <HelpPopup title="Carte des courses"
                content={[
                  { heading: 'Lecture de la carte', text: 'Chaque département est coloré selon le nombre de courses : bleu clair (1–2), bleu moyen (3–4), bleu foncé (5+). Cliquez un département pour filtrer la liste.' },
                  { heading: 'Sources', text: 'Données issues de cyclisme-amateur.com (FFC, FSGT, UFOLEP, FFCT) et du calendrier officiel competitions.ffc.fr.' },
                ]}
                tips={['Utilisez les boutons de région en bas pour zoomer rapidement', 'Combinez filtre département + filtre fédération pour affiner', 'Cliquez à nouveau sur un département sélectionné pour le désélectionner']}
              />
            </span>
            {loading && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-4)' }}>chargement…</span>}
          </div>

          {geoJson ? (
            <MapContainer
              center={[46.5, 2.5]}
              zoom={5}
              style={{ height: 400, width: '100%', background: '#0f172a' }}
              scrollWheelZoom={false}
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; OpenStreetMap &copy; CARTO'
                opacity={0.35}
              />
              <LeafletGeoJSON
                key={`${selectedDept}|${selectedDate}|${fedFilter}|${allRaces.length}`}
                data={geoJson}
                style={styleFeature}
                onEachFeature={onEachFeature}
                ref={geoLayerRef}
              />
              {mapBounds && <MapZoomer bounds={mapBounds} />}

              {/* Race dots — precise city location or dept centroid fallback */}
              {raceMarkers.map((marker, mi) => {
                const { coords, races, precise, dept } = marker;
                const count = races.length;
                const isSelected = dept === selectedDept;
                const radius = precise
                  ? Math.min(5 + count * 1.2, 12)   // smaller when precise
                  : Math.min(8 + count * 1.5, 20);  // bigger centroid blob
                const fedColor = isSelected ? '#22d3ee'
                  : races.length === 1 ? (FED_COLORS[races[0]?.federation] || '#f97316')
                  : '#f97316';
                return (
                  <CircleMarker
                    key={mi}
                    center={coords}
                    radius={radius}
                    pathOptions={{
                      fillColor: fedColor,
                      fillOpacity: precise ? 0.9 : 0.55,
                      color: isSelected ? '#fff' : precise ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.3)',
                      weight: isSelected ? 2 : precise ? 1 : 0.5,
                    }}
                    eventHandlers={{
                      click: () => {
                        setSelectedDept(prev => prev === dept ? null : dept);
                        setSelectedDate(null);
                        setSelectedRegion(null);
                        setMapBounds(null);
                      }
                    }}
                  >
                    <Popup>
                      <div style={{ fontFamily: 'sans-serif', fontSize: 12, minWidth: 170 }}>
                        <div style={{ fontWeight: 700, marginBottom: 2 }}>
                          {races[0]?.city || (dept ? `${dept} — ${DEPT_NAMES[dept] || dept}` : '—')}
                          {!precise && dept && <span style={{ fontWeight: 400, color: '#888', fontSize: 10 }}> (centroïde)</span>}
                        </div>
                        <div style={{ color: '#888', marginBottom: 6, fontSize: 11 }}>{count} course{count > 1 ? 's' : ''}</div>
                        {races.slice(0, 6).map(r => (
                          <div key={r.id} style={{ borderTop: '1px solid #eee', paddingTop: 4, marginTop: 4 }}>
                            <div style={{ fontWeight: 600 }}>{r.name}</div>
                            <div style={{ color: '#888', fontSize: 10 }}>
                              {r.date} · {r.federation}{r.discipline ? ` · ${r.discipline}` : ''}
                            </div>
                          </div>
                        ))}
                        {races.length > 6 && <div style={{ color: '#888', marginTop: 4, fontSize: 10 }}>+{races.length - 6} autres…</div>}
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          ) : (
            <div style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)', fontSize: 13 }}>
              {error ? error : 'Chargement de la carte…'}
            </div>
          )}

          {/* Map legend */}
          <div style={{ padding: '8px 14px', display: 'flex', gap: 14, flexWrap: 'wrap', borderTop: '1px solid var(--border)', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-4)', letterSpacing: '0.06em' }}>DÉPARTEMENTS</span>
            {[
              { color: '#3b82f6', label: '1–2' },
              { color: '#2563eb', label: '3–4' },
              { color: '#1d4ed8', label: '5+' },
              { color: '#22d3ee', label: 'Sélectionné' },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>{label}</span>
              </div>
            ))}
            <div style={{ width: 1, height: 14, background: 'var(--border)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-4)', letterSpacing: '0.06em' }}>POINTS</span>
            {Object.entries(FED_COLORS).map(([fed, color]) => (
              <div key={fed} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>{fed}</span>
              </div>
            ))}
          </div>

          {/* Region quick-select */}
          <div style={{ padding: '8px 14px 12px', display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {Object.keys(REGIONS).map(region => (
              <button key={region} onClick={() => {
                setSelectedRegion(prev => prev === region ? null : region);
                setSelectedDept(null);
                setMapBounds(null);
              }} style={{
                padding: '3px 9px', borderRadius: 5, fontSize: 10,
                fontFamily: 'var(--font-mono)', cursor: 'pointer', border: '1px solid',
                borderColor: selectedRegion === region ? 'var(--accent-cyan)' : 'var(--border)',
                background: selectedRegion === region ? 'rgba(34,211,238,0.1)' : 'var(--bg-3)',
                color: selectedRegion === region ? 'var(--accent-cyan)' : 'var(--text-4)',
                transition: 'all 0.12s',
              }}>
                {region}
              </button>
            ))}
          </div>
        </div>

        {/* ── RIGHT: Calendar grid + race list ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Calendar grid */}
          <div className="card" style={{ padding: '12px 14px' }}>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 700, color: 'var(--text-0)', marginBottom: 10, display: 'flex', alignItems: 'center' }}>
              Choisir une date
              <HelpPopup title="Calendrier des courses"
                content={[
                  { heading: 'Lire le calendrier', text: 'Les cellules bleues ont des courses ce jour-là. Le chiffre indique le nombre. Le badge à gauche est le total de la semaine.' },
                  { heading: 'Filtrer', text: 'Cliquez une date pour voir uniquement les courses ce jour-là. Combinez avec le filtre fédération en haut.' },
                ]}
                tips={['Les en-têtes de mois apparaissent automatiquement quand le mois change', 'Le calendrier couvre les 16 prochaines semaines', 'Cliquez à nouveau sur une date sélectionnée pour revenir à toutes les dates']}
              />
            </div>

            {/* Day headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '28px repeat(7, 1fr)', gap: 3, marginBottom: 4 }}>
              <div />
              {['L','M','M','J','V','S','D'].map((d, i) => (
                <div key={i} style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-4)', padding: '2px 0' }}>
                  {d}
                </div>
              ))}
            </div>

            {/* Week rows */}
            {calendarWeeks.map(({ days, weekTotal }, wi) => {
              // Show month label when month changes
              const firstDay = days[0];
              const prevWeekFirst = wi > 0 ? calendarWeeks[wi - 1].days[0] : null;
              const showMonth = wi === 0 || format(firstDay.date, 'MM') !== format(prevWeekFirst.date, 'MM');
              return (
                <React.Fragment key={wi}>
                  {showMonth && (
                    <div style={{ gridColumn: '1 / -1', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--accent-blue)', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '6px 2px 3px', marginTop: wi > 0 ? 4 : 0 }}>
                      {format(firstDay.date, 'MMMM yyyy', { locale: fr })}
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '28px repeat(7, 1fr)', gap: 3, marginBottom: 3 }}>
                    {/* Week total */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {weekTotal > 0 && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent-blue)', fontWeight: 700, background: 'rgba(77,127,232,0.15)', borderRadius: 4, padding: '1px 4px' }}>
                          {weekTotal}
                        </span>
                      )}
                    </div>
                    {days.map(({ date, key, count, inRange }) => {
                      const isSelected = selectedDate === key;
                      const isTodayCell = key === format(today, 'yyyy-MM-dd');
                      const isPast = date < today;
                      const hasRaces = count > 0;
                      const outOfRange = !inRange;
                      return (
                        <div
                          key={key}
                          onClick={() => hasRaces && inRange && setSelectedDate(prev => prev === key ? null : key)}
                          title={hasRaces ? `${count} course${count > 1 ? 's' : ''} le ${format(date, 'd MMMM', { locale: fr })}` : ''}
                          style={{
                            padding: '5px 2px', borderRadius: 7, textAlign: 'center',
                            cursor: hasRaces && inRange ? 'pointer' : 'default',
                            background: isSelected ? 'var(--accent-cyan)'
                              : hasRaces ? 'rgba(77,127,232,0.18)'
                              : 'var(--bg-2)',
                            border: `1px solid ${isSelected ? 'var(--accent-cyan)' : isTodayCell ? 'rgba(255,255,255,0.3)' : 'transparent'}`,
                            opacity: outOfRange ? 0.2 : isPast && !isSelected ? 0.45 : 1,
                            transition: 'all 0.12s',
                          }}
                        >
                          <div style={{
                            fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700, lineHeight: 1.2,
                            color: isSelected ? '#000' : isTodayCell ? 'var(--accent-cyan)' : 'var(--text-0)',
                          }}>
                            {format(date, 'd')}
                          </div>
                          {hasRaces ? (
                            <div style={{
                              fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, marginTop: 1,
                              color: isSelected ? '#000' : 'var(--accent-cyan)',
                            }}>
                              {count > 9 ? '9+' : count}
                            </div>
                          ) : (
                            <div style={{ height: 14 }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </React.Fragment>
              );
            })}
          </div>

          {/* Race list */}
          <div className="card" style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 700, color: 'var(--text-0)', display: 'flex', alignItems: 'center' }}>
                {selectedDate
                  ? format(parseISO(selectedDate), "EEEE d MMMM", { locale: fr })
                  : selectedDept
                    ? `${selectedDept} — ${DEPT_NAMES[selectedDept] || ''}`
                    : 'Courses à venir'}
                <HelpPopup title="Liste des courses"
                  content={[
                    { heading: 'Ajouter une course', text: 'Cliquez le bouton vert "+" pour ajouter la course à votre calendrier. Vous pouvez activer l\'affûtage automatique (J-10) et la récupération post-course.' },
                    { heading: 'Affûtage automatique', text: 'Si activé, un bloc d\'affûtage est créé 10 jours avant la course et une note de récupération le lendemain.' },
                  ]}
                  tips={['Filtrez par département ou fédération pour cibler vos courses', 'Cliquez une date sur le calendrier pour voir uniquement les courses de ce jour', 'Les courses sauvegardées apparaissent en vert']}
                />
              </span>
              {filteredRaces.length > 0 && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-cyan)', fontWeight: 700 }}>
                  {filteredRaces.length} course{filteredRaces.length > 1 ? 's' : ''}
                </span>
              )}
              {(selectedDate || selectedDept) && (
                <button onClick={() => { setSelectedDate(null); setSelectedDept(null); setMapBounds(null); }}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                  Tout afficher
                </button>
              )}
            </div>

            {error && !loading && (
              <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 13, marginBottom: 10 }}>
                {error}
              </div>
            )}

            {loading && (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-4)', fontSize: 13 }}>
                Chargement des courses…
              </div>
            )}

            {!loading && !error && filteredRaces.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-4)' }}>
                <div style={{ fontSize: 26, marginBottom: 8 }}>🚴</div>
                <div style={{ fontSize: 13 }}>
                  {selectedDate || selectedDept ? 'Aucune course pour cette sélection.' : 'Aucune course chargée.'}
                </div>
              </div>
            )}

            <div style={{ overflowY: 'auto', maxHeight: 440 }}>
              {/* Group races by date for better readability */}
              {(() => {
                const races = filteredRaces.slice(0, 80);
                // Group by date
                const groups = [];
                let currentGroup = null;
                races.forEach(race => {
                  if (!currentGroup || currentGroup.date !== race.date) {
                    currentGroup = { date: race.date, races: [] };
                    groups.push(currentGroup);
                  }
                  currentGroup.races.push(race);
                });

                return groups.map(group => {
                  const dateObj = group.date ? parseISO(group.date) : null;
                  const daysLeft = dateObj ? differenceInDays(dateObj, today) : null;
                  const isWeekend = dateObj ? [0, 6].includes(dateObj.getDay()) : false;

                  return (
                    <div key={group.date || Math.random()}>
                      {/* Date header */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '7px 4px 4px',
                        borderBottom: '1px solid var(--border)',
                        marginBottom: 2,
                        position: 'sticky', top: 0,
                        background: 'var(--bg-1)',
                        zIndex: 1,
                      }}>
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                          color: isWeekend ? 'var(--accent-cyan)' : 'var(--text-1)',
                          textTransform: 'uppercase', letterSpacing: '0.06em',
                        }}>
                          {dateObj ? format(dateObj, 'EEEE d MMMM', { locale: fr }) : '—'}
                        </span>
                        {daysLeft !== null && daysLeft >= 0 && daysLeft <= 30 && (
                          <span style={{
                            fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                            color: daysLeft <= 7 ? '#f97316' : 'var(--text-4)',
                          }}>
                            {daysLeft === 0 ? "Aujourd'hui" : daysLeft === 1 ? 'Demain' : `J-${daysLeft}`}
                          </span>
                        )}
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-4)', marginLeft: 'auto' }}>
                          {group.races.length} course{group.races.length > 1 ? 's' : ''}
                        </span>
                      </div>

                      {/* Race rows for this date */}
                      {group.races.map(race => {
                        const saved = alreadySaved(race);
                        const fedColor = FED_COLORS[race.federation] || '#94a3b8';
                        return (
                          <div key={race.id} style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '6px 4px',
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                            background: saved ? 'rgba(34,197,94,0.04)' : 'transparent',
                            borderRadius: 4,
                          }}
                          onMouseEnter={e => { if (!saved) e.currentTarget.style.background = 'var(--bg-2)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = saved ? 'rgba(34,197,94,0.04)' : 'transparent'; }}
                          >
                            {/* Fed badge */}
                            <span style={{
                              flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 9,
                              fontWeight: 800, padding: '2px 5px', borderRadius: 3,
                              background: `${fedColor}22`, color: fedColor,
                              minWidth: 44, textAlign: 'center', letterSpacing: '0.04em',
                            }}>
                              {race.federation || '—'}
                            </span>

                            {/* Name */}
                            <a
                              href={race.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                flex: 1, minWidth: 0,
                                fontSize: 12, fontWeight: 600,
                                color: saved ? '#22c55e' : 'var(--text-0)',
                                textDecoration: 'none',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}
                              title={race.name}
                            >
                              {race.name}
                            </a>

                            {/* Dept */}
                            {race.department && (
                              <span style={{
                                flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 10,
                                color: 'var(--text-4)', minWidth: 22, textAlign: 'right',
                              }}>
                                {race.department}
                              </span>
                            )}

                            {/* Discipline or category */}
                            {(race.discipline || race.category) && (
                              <span style={{
                                flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 9,
                                color: 'var(--text-3)', maxWidth: 70,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>
                                {race.discipline || race.category}
                              </span>
                            )}

                            {/* Add button */}
                            <button
                              disabled={saved}
                              onClick={() => { setSaveModal(race); setTaperEnabled(true); }}
                              title={saved ? 'Déjà ajoutée' : 'Ajouter au calendrier'}
                              style={{
                                flexShrink: 0, width: 24, height: 24,
                                borderRadius: 6, fontSize: 13, lineHeight: 1,
                                fontWeight: 700, cursor: saved ? 'default' : 'pointer',
                                border: `1px solid ${saved ? 'rgba(34,197,94,0.4)' : 'rgba(34,211,238,0.35)'}`,
                                background: saved ? 'rgba(34,197,94,0.1)' : 'rgba(34,211,238,0.08)',
                                color: saved ? '#22c55e' : 'var(--accent-cyan)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'all 0.12s',
                              }}
                              onMouseEnter={e => { if (!saved) { e.currentTarget.style.background = 'rgba(34,211,238,0.2)'; } }}
                              onMouseLeave={e => { if (!saved) { e.currentTarget.style.background = 'rgba(34,211,238,0.08)'; } }}
                            >
                              {saved ? '✓' : '+'}
                            </button>
                          </div>
                        );
                      })}
                      <div style={{ height: 6 }} />
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* ── Save modal ── */}
      {saveModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}
          onClick={() => setSaveModal(null)}
        >
          <div
            style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, maxWidth: 400, width: '100%' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-0)', marginBottom: 4 }}>Ajouter cette course</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', marginBottom: 14 }}>
              Informations sauvegardées dans votre calendrier
            </div>

            <div style={{ background: 'var(--bg-2)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, borderLeft: '3px solid var(--accent-cyan)' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-0)', marginBottom: 6 }}>{saveModal.name}</div>
              {saveModal.date && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-2)', marginBottom: 3 }}>
                  📅 {format(parseISO(saveModal.date), 'EEEE d MMMM yyyy', { locale: fr })}
                  <span style={{ marginLeft: 8, color: 'var(--accent-cyan)' }}>{daysUntil(saveModal.date)}</span>
                </div>
              )}
              {saveModal.department && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-3)', marginBottom: 3 }}>
                  📍 {saveModal.department} — {DEPT_NAMES[saveModal.department] || ''}
                </div>
              )}
              {saveModal.federation && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: FED_COLORS[saveModal.federation] || 'var(--text-3)' }}>
                  🏅 {saveModal.federation}{saveModal.category ? ` · ${saveModal.category}` : ''}
                </div>
              )}
            </div>

            {/* Taper toggle */}
            <div
              onClick={() => setTaperEnabled(p => !p)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                background: taperEnabled ? 'rgba(34,211,238,0.07)' : 'var(--bg-2)',
                border: `1px solid ${taperEnabled ? 'rgba(34,211,238,0.3)' : 'var(--border)'}`,
                marginBottom: 16, transition: 'all 0.2s',
              }}
            >
              <div style={{
                width: 20, height: 20, borderRadius: 5, flexShrink: 0, marginTop: 1,
                border: `2px solid ${taperEnabled ? 'var(--accent-cyan)' : 'var(--border)'}`,
                background: taperEnabled ? 'var(--accent-cyan)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {taperEnabled && <span style={{ color: '#000', fontSize: 12, fontWeight: 900, lineHeight: 1 }}>✓</span>}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-0)' }}>Activer la préparation course</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', marginTop: 3, lineHeight: 1.5 }}>
                  Ajoute un rappel affûtage J-10 + récupération J+1.<br />
                  Le plan IA s'adaptera automatiquement.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => setSaveModal(null)}>Annuler</button>
              <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSaveRace}>
                Sauvegarder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
