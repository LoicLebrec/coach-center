import React, { useState, useCallback } from 'react';
import { format, parseISO } from 'date-fns';

const DEPARTMENTS = [
  { code: '01', name: 'Ain' }, { code: '02', name: 'Aisne' }, { code: '03', name: 'Allier' },
  { code: '04', name: 'Alpes-de-Haute-Provence' }, { code: '05', name: 'Hautes-Alpes' },
  { code: '06', name: 'Alpes-Maritimes' }, { code: '07', name: 'Ardèche' },
  { code: '08', name: 'Ardennes' }, { code: '09', name: 'Ariège' }, { code: '10', name: 'Aube' },
  { code: '11', name: 'Aude' }, { code: '12', name: 'Aveyron' },
  { code: '13', name: 'Bouches-du-Rhône' }, { code: '14', name: 'Calvados' },
  { code: '15', name: 'Cantal' }, { code: '16', name: 'Charente' },
  { code: '17', name: 'Charente-Maritime' }, { code: '18', name: 'Cher' },
  { code: '19', name: 'Corrèze' }, { code: '21', name: "Côte-d'Or" },
  { code: '22', name: "Côtes-d'Armor" }, { code: '23', name: 'Creuse' },
  { code: '24', name: 'Dordogne' }, { code: '25', name: 'Doubs' },
  { code: '26', name: 'Drôme' }, { code: '27', name: 'Eure' },
  { code: '28', name: 'Eure-et-Loir' }, { code: '29', name: 'Finistère' },
  { code: '30', name: 'Gard' }, { code: '31', name: 'Haute-Garonne' },
  { code: '32', name: 'Gers' }, { code: '33', name: 'Gironde' },
  { code: '34', name: 'Hérault' }, { code: '35', name: 'Ille-et-Vilaine' },
  { code: '36', name: 'Indre' }, { code: '37', name: 'Indre-et-Loire' },
  { code: '38', name: 'Isère' }, { code: '39', name: 'Jura' },
  { code: '40', name: 'Landes' }, { code: '41', name: 'Loir-et-Cher' },
  { code: '42', name: 'Loire' }, { code: '43', name: 'Haute-Loire' },
  { code: '44', name: 'Loire-Atlantique' }, { code: '45', name: 'Loiret' },
  { code: '46', name: 'Lot' }, { code: '47', name: 'Lot-et-Garonne' },
  { code: '48', name: 'Lozère' }, { code: '49', name: 'Maine-et-Loire' },
  { code: '50', name: 'Manche' }, { code: '51', name: 'Marne' },
  { code: '52', name: 'Haute-Marne' }, { code: '53', name: 'Mayenne' },
  { code: '54', name: 'Meurthe-et-Moselle' }, { code: '55', name: 'Meuse' },
  { code: '56', name: 'Morbihan' }, { code: '57', name: 'Moselle' },
  { code: '58', name: 'Nièvre' }, { code: '59', name: 'Nord' },
  { code: '60', name: 'Oise' }, { code: '61', name: 'Orne' },
  { code: '62', name: 'Pas-de-Calais' }, { code: '63', name: 'Puy-de-Dôme' },
  { code: '64', name: 'Pyrénées-Atlantiques' }, { code: '65', name: 'Hautes-Pyrénées' },
  { code: '66', name: 'Pyrénées-Orientales' }, { code: '67', name: 'Bas-Rhin' },
  { code: '68', name: 'Haut-Rhin' }, { code: '69', name: 'Rhône' },
  { code: '70', name: 'Haute-Saône' }, { code: '71', name: 'Saône-et-Loire' },
  { code: '72', name: 'Sarthe' }, { code: '73', name: 'Savoie' },
  { code: '74', name: 'Haute-Savoie' }, { code: '75', name: 'Paris' },
  { code: '76', name: 'Seine-Maritime' }, { code: '77', name: 'Seine-et-Marne' },
  { code: '78', name: 'Yvelines' }, { code: '79', name: 'Deux-Sèvres' },
  { code: '80', name: 'Somme' }, { code: '81', name: 'Tarn' },
  { code: '82', name: 'Tarn-et-Garonne' }, { code: '83', name: 'Var' },
  { code: '84', name: 'Vaucluse' }, { code: '85', name: 'Vendée' },
  { code: '86', name: 'Vienne' }, { code: '87', name: 'Haute-Vienne' },
  { code: '88', name: 'Vosges' }, { code: '89', name: 'Yonne' },
  { code: '90', name: 'Territoire de Belfort' }, { code: '91', name: 'Essonne' },
  { code: '92', name: 'Hauts-de-Seine' }, { code: '93', name: 'Seine-Saint-Denis' },
  { code: '94', name: 'Val-de-Marne' }, { code: '95', name: "Val-d'Oise" },
];

const FED_COLORS = {
  FFC: '#4d7fe8',
  FSGT: '#22c55e',
  UFOLEP: '#f97316',
  FFCT: '#a855f7',
};

const CAT_COLOR = {
  'elite open': '#ef4444',
  'open': '#f97316',
  'pro': '#eab308',
};

function fedBadge(fed) {
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
      padding: '2px 6px', borderRadius: 4,
      background: `${FED_COLORS[fed] || '#475569'}20`,
      color: FED_COLORS[fed] || '#94a3b8',
      letterSpacing: '0.05em',
    }}>{fed}</span>
  );
}

export default function RaceCalendar({ onAddToCalendar }) {
  const [searchDate, setSearchDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [department, setDepartment] = useState('');
  const [fed, setFed] = useState('');
  const [races, setRaces] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [added, setAdded] = useState(new Set());

  const search = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRaces(null);
    try {
      const params = new URLSearchParams();
      if (searchDate) params.set('date', searchDate);
      if (department) params.set('department', department);
      if (fed) params.set('fed', fed);
      const res = await fetch(`/api/races?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRaces(data);
    } catch (e) {
      setError('Impossible de charger le calendrier. Vérifiez la connexion.');
    } finally {
      setLoading(false);
    }
  }, [searchDate, department, fed]);

  const handleAdd = useCallback((race) => {
    if (!onAddToCalendar) return;
    onAddToCalendar({
      title: race.name,
      date: parseISO(race.date),
      type: 'Race',
      kind: 'race',
      notes: `${race.federation}${race.category ? ' · ' + race.category : ''}${race.department ? ' · Dép. ' + race.department : ''}\n${race.url}`,
      source: 'cyclisme-amateur',
    });
    setAdded(prev => new Set([...prev, race.id]));
  }, [onAddToCalendar]);

  return (
    <div className="card" style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="card-header">
        <span className="card-title">Calendrier des courses</span>
        <a
          href="https://www.cyclisme-amateur.com/course.php"
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent-cyan)' }}
        >
          cyclisme-amateur.com ↗
        </a>
      </div>

      {/* Search filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)' }}>Date</label>
          <input
            type="date"
            className="form-input"
            value={searchDate}
            onChange={e => setSearchDate(e.target.value)}
            style={{ minWidth: 150 }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)' }}>Département</label>
          <select
            className="form-input"
            value={department}
            onChange={e => setDepartment(e.target.value)}
            style={{ minWidth: 180 }}
          >
            <option value="">Tous les départements</option>
            {DEPARTMENTS.map(d => (
              <option key={d.code} value={d.code}>{d.code} — {d.name}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)' }}>Fédération</label>
          <select
            className="form-input"
            value={fed}
            onChange={e => setFed(e.target.value)}
          >
            <option value="">Toutes</option>
            <option value="FFC">FFC</option>
            <option value="FSGT">FSGT</option>
            <option value="UFOLEP">UFOLEP</option>
            <option value="FFCT">FFCT</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', opacity: 0 }}>.</label>
          <button
            className="btn btn-primary"
            onClick={search}
            disabled={loading}
            style={{ minWidth: 120 }}
          >
            {loading ? 'Recherche…' : 'Rechercher'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: '12px 14px', borderRadius: 8, marginBottom: 12,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          color: '#ef4444', fontSize: 13,
        }}>{error}</div>
      )}

      {/* No results */}
      {races !== null && races.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)', fontSize: 14 }}>
          Aucune course trouvée pour ce filtre.
          <div style={{ marginTop: 8, fontSize: 12 }}>
            Essayez une autre date ou supprimez les filtres.
          </div>
        </div>
      )}

      {/* Results */}
      {races !== null && races.length > 0 && (
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', marginBottom: 10 }}>
            {races.length} course{races.length > 1 ? 's' : ''} trouvée{races.length > 1 ? 's' : ''}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {races.map(race => {
              const isAdded = added.has(race.id);
              return (
                <div
                  key={race.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px', borderRadius: 10,
                    background: 'var(--bg-2)', border: '1px solid var(--border)',
                  }}
                >
                  {/* Date badge */}
                  <div style={{
                    flexShrink: 0, textAlign: 'center',
                    fontFamily: 'var(--font-mono)', lineHeight: 1.2,
                    minWidth: 44,
                  }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-0)' }}>
                      {race.date ? format(parseISO(race.date), 'd') : '—'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase' }}>
                      {race.date ? format(parseISO(race.date), 'MMM') : ''}
                    </div>
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-0)' }}>
                        {race.name}
                      </span>
                      {race.federation && fedBadge(race.federation)}
                      {race.category && (
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: 10,
                          color: CAT_COLOR[race.category?.toLowerCase()] || 'var(--text-3)',
                        }}>
                          {race.category}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      {race.department && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)' }}>
                          Dép. {race.department}
                        </span>
                      )}
                      <a
                        href={race.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent-cyan)' }}
                        onClick={e => e.stopPropagation()}
                      >
                        Détails ↗
                      </a>
                    </div>
                  </div>

                  {/* Add button */}
                  <button
                    className={isAdded ? 'btn' : 'btn btn-primary'}
                    style={{ flexShrink: 0, minWidth: 110, fontSize: 12 }}
                    onClick={() => handleAdd(race)}
                    disabled={isAdded}
                  >
                    {isAdded ? '✓ Ajouté' : '+ Mon calendrier'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Hint when no search done yet */}
      {races === null && !loading && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🚴</div>
          <div style={{ fontSize: 14 }}>Choisissez une date et cliquez sur Rechercher</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>
            Sources : FFC · FSGT · UFOLEP · FFCT
          </div>
        </div>
      )}
    </div>
  );
}
