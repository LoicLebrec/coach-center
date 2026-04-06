import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, GeoJSON as LeafletGeoJSON, useMap } from 'react-leaflet';
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

  const geoLayerRef = useRef(null);
  const today = startOfToday();

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

  // ── Race counts by date ───────────────────────────────────────────────────
  const countByDate = useMemo(() => {
    const m = {};
    allRaces.forEach(r => {
      if (!r.date) return;
      if (selectedDept && r.department !== selectedDept) return;
      if (fedFilter && r.federation !== fedFilter) return;
      m[r.date] = (m[r.date] || 0) + 1;
    });
    return m;
  }, [allRaces, selectedDept, fedFilter]);

  // ── Race counts by dept ───────────────────────────────────────────────────
  const countByDept = useMemo(() => {
    const m = {};
    allRaces.forEach(r => {
      if (!r.department) return;
      if (fedFilter && r.federation !== fedFilter) return;
      if (selectedDate && r.date !== selectedDate) return;
      m[r.department] = (m[r.department] || 0) + 1;
    });
    return m;
  }, [allRaces, fedFilter, selectedDate]);

  // ── Filtered races ────────────────────────────────────────────────────────
  const filteredRaces = useMemo(() => allRaces.filter(r => {
    if (selectedDept && r.department !== selectedDept) return false;
    if (selectedDate && r.date !== selectedDate) return false;
    if (fedFilter && r.federation !== fedFilter) return false;
    return true;
  }), [allRaces, selectedDept, selectedDate, fedFilter]);

  // ── Calendar grid: 16 weeks starting from Monday of current week ─────────
  const calendarWeeks = useMemo(() => {
    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    const weeks = [];
    for (let w = 0; w < 16; w++) {
      const days = [];
      for (let d = 0; d < 7; d++) {
        const date = addDays(weekStart, w * 7 + d);
        const key = format(date, 'yyyy-MM-dd');
        days.push({ date, key, count: countByDate[key] || 0 });
      }
      const weekTotal = days.reduce((s, d) => s + d.count, 0);
      weeks.push({ days, weekTotal });
    }
    return weeks;
  }, [countByDate, today]);

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

      {/* ── Federation filter ── */}
      <div className="card" style={{ padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-3)', marginRight: 4 }}>Fédération :</span>
        {['', 'FFC', 'FSGT', 'UFOLEP', 'FFCT'].map(f => (
          <button key={f} onClick={() => setFedFilter(f)} style={{
            padding: '5px 14px', borderRadius: 7, fontSize: 12, fontFamily: 'var(--font-mono)',
            fontWeight: 700, cursor: 'pointer', border: '1px solid',
            borderColor: fedFilter === f ? (FED_COLORS[f] || 'var(--accent-cyan)') : 'var(--border)',
            background: fedFilter === f ? `${FED_COLORS[f] || 'var(--accent-cyan)'}25` : 'var(--bg-2)',
            color: fedFilter === f ? (FED_COLORS[f] || 'var(--accent-cyan)') : 'var(--text-3)',
            transition: 'all 0.15s',
          }}>
            {f || 'Toutes'}
          </button>
        ))}

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
            </MapContainer>
          ) : (
            <div style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)', fontSize: 13 }}>
              {error ? error : 'Chargement de la carte…'}
            </div>
          )}

          {/* Map legend */}
          <div style={{ padding: '8px 14px', display: 'flex', gap: 12, flexWrap: 'wrap', borderTop: '1px solid var(--border)' }}>
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
                    {days.map(({ date, key, count }) => {
                      const isSelected = selectedDate === key;
                      const isTodayCell = key === format(today, 'yyyy-MM-dd');
                      const isPast = date < today;
                      const hasRaces = count > 0;
                      return (
                        <div
                          key={key}
                          onClick={() => hasRaces && setSelectedDate(prev => prev === key ? null : key)}
                          title={hasRaces ? `${count} course${count > 1 ? 's' : ''} le ${format(date, 'd MMMM', { locale: fr })}` : ''}
                          style={{
                            padding: '5px 2px', borderRadius: 7, textAlign: 'center',
                            cursor: hasRaces ? 'pointer' : 'default',
                            background: isSelected ? 'var(--accent-cyan)'
                              : hasRaces ? 'rgba(77,127,232,0.18)'
                              : 'var(--bg-2)',
                            border: `1px solid ${isSelected ? 'var(--accent-cyan)' : isTodayCell ? 'rgba(255,255,255,0.3)' : 'transparent'}`,
                            opacity: isPast && !isSelected ? 0.4 : 1,
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 420, overflowY: 'auto' }}>
              {filteredRaces.slice(0, 60).map(race => {
                const saved = alreadySaved(race);
                const daysLeft = race.date ? differenceInDays(parseISO(race.date), today) : null;
                return (
                  <div key={race.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 10,
                    background: 'var(--bg-2)',
                    border: `1px solid ${saved ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`,
                  }}>
                    {/* Date pill */}
                    {race.date && (
                      <div style={{
                        flexShrink: 0, minWidth: 38, textAlign: 'center',
                        background: 'var(--bg-3)', borderRadius: 8, padding: '5px 6px',
                      }}>
                        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 17, fontWeight: 800, color: 'var(--text-0)', lineHeight: 1 }}>
                          {format(parseISO(race.date), 'd')}
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-4)', textTransform: 'uppercase' }}>
                          {format(parseISO(race.date), 'MMM', { locale: fr })}
                        </div>
                      </div>
                    )}

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {race.name}
                        </span>
                        {daysLeft !== null && daysLeft <= 14 && (
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#f97316', fontWeight: 700, flexShrink: 0 }}>
                            {daysUntil(race.date)}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                        {race.federation && (
                          <span style={{
                            fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                            padding: '1px 6px', borderRadius: 4,
                            background: `${FED_COLORS[race.federation] || '#47556920'}25`,
                            color: FED_COLORS[race.federation] || '#94a3b8',
                          }}>{race.federation}</span>
                        )}
                        {race.category && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>{race.category}</span>}
                        {race.department && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-4)' }}>Dép. {race.department}</span>}
                        <a href={race.url} target="_blank" rel="noopener noreferrer"
                          style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent-cyan)' }}>
                          Détails ↗
                        </a>
                      </div>
                    </div>

                    {/* Add button */}
                    <button
                      disabled={saved}
                      onClick={() => { setSaveModal(race); setTaperEnabled(true); }}
                      style={{
                        flexShrink: 0, padding: '6px 10px', borderRadius: 7, fontSize: 11,
                        fontWeight: 700, cursor: saved ? 'default' : 'pointer',
                        border: '1px solid',
                        borderColor: saved ? 'rgba(34,197,94,0.5)' : 'var(--accent-cyan)',
                        background: saved ? 'rgba(34,197,94,0.1)' : 'rgba(34,211,238,0.1)',
                        color: saved ? '#22c55e' : 'var(--accent-cyan)',
                        transition: 'all 0.15s',
                      }}
                    >
                      {saved ? '✓' : '+'}
                    </button>
                  </div>
                );
              })}
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
