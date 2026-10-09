import { useState, useEffect, useMemo, useCallback } from 'react';
import { calcDailyNeeds } from '../data/nutritionRecipes';
import { getFrenchSlotRecipes, buildFrenchWeekShoppingList } from '../data/frenchRecipes';
import Picto from './Pictos';

// ── Constantes ────────────────────────────────────────────────────────────────

const DIET_OPTIONS = [
  { key: 'omnivore',   label: 'Omnivore',   icon: 'plate' },
  { key: 'vegetarian', label: 'Végétarien', icon: 'egg' },
  { key: 'vegan',      label: 'Vegan',      icon: 'leaf' },
];

const DIFFICULTY_OPTIONS = [
  { key: 'easy',   label: 'Facile',  color: '#22c55e' },
  { key: 'medium', label: 'Moyen',   color: '#f59e0b' },
  { key: 'hard',   label: 'Élaboré', color: '#ef4444' },
];

const MEAL_META = {
  breakfast: { label: 'Petit-déjeuner',    icon: 'sun',  color: '#f59e0b' },
  pre:       { label: 'Avant la sortie',   icon: 'bolt',   color: '#f97316' },
  during:    { label: 'Pendant la sortie', icon: 'bike',   color: '#f97316' },
  post:      { label: 'Récupération',      icon: 'recover',   color: '#22c55e' },
  lunch:     { label: 'Déjeuner',          icon: 'plate',  color: '#a78bfa' },
  snack:     { label: 'Collation',         icon: 'apple',   color: '#fb923c' },
  dinner:    { label: 'Dîner',             icon: 'moon',   color: '#7dd3fc' },
};

const DAY_TITLES = { rest: 'Jour de repos', easy: 'Journée facile', moderate: 'Journée modérée', hard: 'Journée intense', long: 'Longue sortie' };
const LOAD_COLORS = { rest: '#64748b', easy: '#22c55e', moderate: '#f59e0b', hard: '#f97316', long: '#ef4444' };
const LOAD_LABELS = { rest: 'Repos',   easy: 'Facile',  moderate: 'Modéré',  hard: 'Intensif', long: 'Longue sortie' };

const DURING_STATIC = [
  {
    id: 'static_rice_cakes', name: 'Rice cakes salés maison', difficulty: 'medium',
    time: 25, macros: { cal: 280, carbs: 55, protein: 8, fat: 4 }, macrosEstimated: false,
    ingredients: [
      { name: 'Riz à sushi cuit', qty: '200 g' },
      { name: 'Bacon ou jambon',  qty: '30 g'  },
      { name: 'Parmesan râpé',    qty: '20 g'  },
    ],
    steps: 'Mélanger riz chaud, garniture et fromage. Mouler dans du film plastique en pavés de 80 g. Réfrigérer. Consommer 1 pavé toutes les 30–40 min.',
    note: 'Objectif : 60–90 g glucides/h après 45 min de sortie.',
  },
  {
    id: 'static_dates', name: 'Dattes et noix de cajou', difficulty: 'easy',
    time: 2, macros: { cal: 260, carbs: 50, protein: 4, fat: 6 }, macrosEstimated: false,
    ingredients: [
      { name: 'Dattes Medjool', qty: '80 g' },
      { name: 'Noix de cajou',  qty: '20 g' },
    ],
    steps: 'Combiner dans un sachet réutilisable. 1–2 dattes toutes les 20 min sur le vélo.',
    note: 'Option vegan, facile à emporter en poche de jersey.',
  },
];

// ── Helpers de style ──────────────────────────────────────────────────────────

const sectionLabel = {
  fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
  letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10,
};

const monoVal = (color = 'var(--text-1)') => ({
  fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color,
});

const pill = (color, active) => ({
  padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
  fontWeight: active ? 600 : 400, border: `1px solid ${active ? color : 'var(--border)'}`,
  background: active ? `${color}18` : 'transparent',
  color: active ? color : 'var(--text-3)', transition: 'all 0.15s',
});

const tag = (color) => ({
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '3px 9px', borderRadius: 99, fontSize: 12, fontWeight: 600,
  background: `${color}18`, color, border: `1px solid ${color}30`,
});

// ── Sous-composants ───────────────────────────────────────────────────────────

function MacroProgress({ label, value, max, color }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{label}</span>
        <span style={monoVal(color)}>{value} g</span>
      </div>
      <div style={{ height: 5, borderRadius: 99, background: 'var(--bg-3)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 99, background: color, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  );
}

function DifficultyBadge({ difficulty }) {
  const opt = DIFFICULTY_OPTIONS.find(o => o.key === difficulty) || DIFFICULTY_OPTIONS[0];
  return <span style={tag(opt.color)}>{opt.label}</span>;
}

function RecipeCard({ recipe, expanded, onToggle, onShuffle, canShuffle }) {
  const { name, difficulty, time, macros, macrosEstimated, ingredients, steps, note } = recipe;
  const level = DIFFICULTY_OPTIONS.find(o => o.key === difficulty)?.label;
  return (
    <div className={`meal-card${expanded ? ' is-open' : ''}`}>
      <div className="meal-row">
        <button type="button" className="meal-main" onClick={onToggle} aria-expanded={expanded}>
          <span className="meal-name">{name}</span>
          <span className="meal-meta">{time} min · {macros.cal} kcal{macrosEstimated ? ' (estimé)' : ''}{level ? ` · ${level.toLowerCase()}` : ''}</span>
        </button>
        {canShuffle && (
          <button type="button" className="meal-swap" onClick={onShuffle} title="Proposer une autre recette">
            <Picto name="shuffle" size={16} /> <span>Autre idée</span>
          </button>
        )}
      </div>
      {expanded && (
        <div className="meal-detail">
          <p className="meal-macros">Glucides {macros.carbs} g · Protéines {macros.protein} g · Lipides {macros.fat} g</p>
          <div className="meal-subtitle">Ingrédients</div>
          <ul className="meal-ingredients">
            {ingredients.map((ing, i) => (
              <li key={i}><span>{ing.name}</span>{ing.qty && <span className="meal-qty">{ing.qty}</span>}</li>
            ))}
          </ul>
          <div className="meal-subtitle">Préparation</div>
          <p className="meal-steps">{steps}</p>
          {note && <p className="meal-note">{note}</p>}
        </div>
      )}
    </div>
  );
}

function MealSlot({ slotKey, diet, weightKg, difficulty, staticRecipes = null }) {
  const { label, icon } = MEAL_META[slotKey] || {};

  const pool = useMemo(() => {
    if (staticRecipes) return staticRecipes;
    return getFrenchSlotRecipes({ slot: slotKey, diet, weightKg, count: 6, difficulty });
  }, [slotKey, diet, weightKg, difficulty, staticRecipes]);

  const [idx, setIdx]           = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => { setIdx(0); setExpanded(false); }, [slotKey, diet, difficulty]);

  const handleShuffle = useCallback(() => {
    setExpanded(false);
    setIdx(i => (i + 1) % Math.max(pool.length, 1));
  }, [pool.length]);

  const current = pool[idx] || null;

  return (
    <li className="meal">
      <div className="meal-slot"><Picto name={icon} size={20} /> {label}</div>
      {!current ? (
        <p className="meal-empty">Pas de recette de ce niveau pour ce repas. Choisis « Toutes » dans Recettes.</p>
      ) : (
        <RecipeCard
          recipe={current}
          expanded={expanded}
          onToggle={() => setExpanded(e => !e)}
          onShuffle={handleShuffle}
          canShuffle={pool.length > 1}
        />
      )}
    </li>
  );
}

// ── Liste de courses ──────────────────────────────────────────────────────────

function ShoppingList({ diet, weightKg, difficulty }) {
  const [state, setState]          = useState('idle');
  const [weekPlan, setWeekPlan]    = useState(null);
  const [shopping, setShopping]    = useState([]);
  const [checked, setChecked]      = useState(new Set());
  const [expandedDay, setExpandedDay] = useState(null);

  const generate = () => {
    setState('loading');
    setTimeout(() => {
      try {
        const { weekPlan: wp, shoppingList } = buildFrenchWeekShoppingList({ diet, weightKg, difficulty });
        setWeekPlan(wp);
        setShopping(shoppingList);
        setChecked(new Set());
        setState('done');
      } catch {
        setState('error');
      }
    }, 80);
  };

  const toggle = key => setChecked(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const copyList = () => {
    const lines = shopping.flatMap(cat => [
      `\n${cat.category}`,
      ...cat.items.map(item => {
        const measures = [...new Set(item.measures)].join(', ');
        return `- ${item.name}${measures ? ' — ' + measures : ''}`;
      }),
    ]);
    navigator.clipboard?.writeText(lines.join('\n')).catch(() => {});
  };

  const checkedCount = shopping.reduce((s, cat) => s + cat.items.filter(i => checked.has(i.name.toLowerCase())).length, 0);
  const totalCount   = shopping.reduce((s, cat) => s + cat.items.length, 0);

  if (state === 'idle') return (
    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
      <div style={{ marginBottom: 16 }}><Picto name="cart" size={48} /></div>
      <div style={{ fontSize: 15, color: 'var(--text-2)', marginBottom: 6, lineHeight: 1.6 }}>
        Génère un plan repas pour une semaine type et la liste d'ingrédients agrégée.
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-4)', marginBottom: 24 }}>
        Repos · Facile · Intensif · Modéré · Facile · Longue sortie · Repos
      </div>
      <button onClick={generate} style={{
        padding: '11px 28px', borderRadius: 10, background: 'var(--accent-orange)', color: '#fff',
        border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer',
      }}>
        Générer la liste de courses
      </button>
    </div>
  );

  if (state === 'loading') return (
    <div style={{ textAlign: 'center', padding: '48px 20px' }}>
      <div style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--accent-orange)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 16px' }} />
      <div style={{ fontSize: 14, color: 'var(--text-3)' }}>Génération du plan semaine…</div>
    </div>
  );

  if (state === 'error') return (
    <div style={{ textAlign: 'center', padding: 24, color: '#ef4444', fontSize: 14 }}>
      Erreur.{' '}
      <button onClick={generate} style={{ background: 'none', border: 'none', color: 'var(--accent-orange)', cursor: 'pointer', textDecoration: 'underline', fontSize: 14 }}>
        Réessayer
      </button>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <span style={{ fontSize: 13, color: 'var(--text-3)' }}>
          {checkedCount} / {totalCount} articles cochés
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={copyList} style={{
            padding: '7px 14px', borderRadius: 8, background: 'var(--bg-3)', border: '1px solid var(--border)',
            color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
          }}>Copier</button>
          <button onClick={generate} style={{
            padding: '7px 14px', borderRadius: 8, background: 'var(--bg-3)', border: '1px solid var(--border)',
            color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
          }}>Régénérer</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 28 }}>
        {shopping.map(cat => (
          <div key={cat.category} style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '9px 13px', borderBottom: '1px solid var(--border)', background: 'var(--bg-3)' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>{cat.category}</span>
              <span style={{ fontSize: 11, color: 'var(--text-4)', marginLeft: 6 }}>({cat.items.length})</span>
            </div>
            <div style={{ padding: '6px 4px' }}>
              {cat.items.map(item => {
                const key  = item.name.toLowerCase();
                const done = checked.has(key);
                const measures = [...new Set(item.measures)].slice(0, 3).join(', ');
                return (
                  <div key={key} onClick={() => toggle(key)} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 9, padding: '5px 10px',
                    cursor: 'pointer', borderRadius: 6, transition: 'background 0.1s',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-3)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{
                      width: 16, height: 16, borderRadius: 4, marginTop: 2, flexShrink: 0, transition: 'all 0.15s',
                      border: `2px solid ${done ? '#22c55e' : 'var(--border)'}`,
                      background: done ? '#22c55e' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {done && <span style={{ color: '#fff', fontSize: 10, fontWeight: 800 }}>✓</span>}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, color: done ? 'var(--text-4)' : 'var(--text-1)', textDecoration: done ? 'line-through' : 'none', fontWeight: 500 }}>
                        {item.name}
                      </div>
                      {measures && <div style={{ fontSize: 11, color: 'var(--text-4)' }}>{measures}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {weekPlan && (
        <div>
          <div style={{ ...sectionLabel, marginBottom: 10 }}>Plan semaine type</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {weekPlan.map(({ day, load, meals }) => (
              <div key={day} style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                <button onClick={() => setExpandedDay(d => d === day ? null : day)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                  background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', minWidth: 84 }}>{day}</span>
                  <span style={tag(LOAD_COLORS[load])}>{LOAD_LABELS[load]}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-4)' }}>
                    {expandedDay === day ? '▲' : '▼'}
                  </span>
                </button>
                {expandedDay === day && (
                  <div style={{ padding: '2px 14px 10px', borderTop: '1px solid var(--border)' }}>
                    {Object.entries(meals).map(([slot, recipe]) => {
                      const meta = MEAL_META[slot];
                      if (!meta) return null;
                      return (
                        <div key={slot} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <Picto name={meta.icon} size={16} />
                          <span style={{ fontSize: 12, color: meta.color, minWidth: 120 }}>{meta.label}</span>
                          <span style={{ fontSize: 13, color: recipe ? 'var(--text-2)' : 'var(--text-4)', fontStyle: recipe ? 'normal' : 'italic' }}>
                            {recipe ? recipe.name : '—'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Journal alimentaire ───────────────────────────────────────────────────────

function JournalAlimentaire({ needs }) {
  const todayStr = () => new Date().toISOString().split('T')[0];
  const [date, setDate]          = useState(todayStr);
  const [entries, setEntries]    = useState([]);
  const [showForm, setShowForm]  = useState(false);
  const [form, setForm]          = useState({ name: '', cal: '', carbs: '', protein: '', fat: '' });

  useEffect(() => {
    const raw = localStorage.getItem(`nc_journal_${date}`);
    setEntries(raw ? JSON.parse(raw) : []);
    setShowForm(false);
  }, [date]);

  const save = newEntries => {
    setEntries(newEntries);
    localStorage.setItem(`nc_journal_${date}`, JSON.stringify(newEntries));
  };

  const addEntry = () => {
    if (!form.name || !form.cal) return;
    save([...entries, {
      id: Date.now().toString(),
      time: new Date().toTimeString().slice(0, 5),
      name: form.name,
      cal:     parseInt(form.cal)     || 0,
      carbs:   parseInt(form.carbs)   || 0,
      protein: parseInt(form.protein) || 0,
      fat:     parseInt(form.fat)     || 0,
    }]);
    setForm({ name: '', cal: '', carbs: '', protein: '', fat: '' });
    setShowForm(false);
  };

  const navDay = delta => {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    if (d <= new Date()) setDate(d.toISOString().split('T')[0]);
  };

  const formatDate = d => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const totals = entries.reduce((acc, e) => ({
    cal: acc.cal + e.cal, carbs: acc.carbs + e.carbs,
    protein: acc.protein + e.protein, fat: acc.fat + e.fat,
  }), { cal: 0, carbs: 0, protein: 0, fat: 0 });

  const calRatio = totals.cal / (needs.cal || 2000);
  const calColor = calRatio < 0.5 ? '#f97316' : calRatio > 1.1 ? '#ef4444' : '#22c55e';

  const inputStyle = {
    width: '100%', padding: '9px 12px', background: 'var(--bg-3)', border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text-0)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  return (
    <div>
      {/* Navigation de date */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => navDay(-1)} style={{
          width: 34, height: 34, borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--border)',
          color: 'var(--text-2)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>◀</button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', textTransform: 'capitalize' }}>
            {formatDate(date)}
          </div>
          {date === todayStr() && (
            <div style={{ fontSize: 11, color: 'var(--accent-orange)', marginTop: 2 }}>Aujourd'hui</div>
          )}
        </div>
        <button onClick={() => navDay(1)} disabled={date >= todayStr()} style={{
          width: 34, height: 34, borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--border)',
          color: 'var(--text-2)', cursor: date >= todayStr() ? 'default' : 'pointer', fontSize: 14,
          opacity: date >= todayStr() ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>▶</button>
      </div>

      {/* Bilan vs objectifs */}
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Calories consommées</span>
          <div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 700, color: calColor }}>{totals.cal}</span>
            <span style={{ fontSize: 13, color: 'var(--text-4)', marginLeft: 6 }}>/ {needs.cal} kcal</span>
          </div>
        </div>
        <div style={{ height: 6, borderRadius: 99, background: 'var(--bg-3)', overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ height: '100%', borderRadius: 99, background: calColor, width: `${Math.min(100, calRatio * 100)}%`, transition: 'width 0.4s' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          {[
            { label: 'Glucides',  value: totals.carbs,   target: needs.carbs,   color: '#f97316' },
            { label: 'Protéines', value: totals.protein, target: needs.protein, color: '#22c55e' },
            { label: 'Lipides',   value: totals.fat,     target: needs.fat,     color: '#f97316' },
          ].map(m => (
            <div key={m.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{m.label}</span>
                <span style={{ ...monoVal(m.color), fontSize: 11 }}>{m.value}/{m.target}g</span>
              </div>
              <div style={{ height: 4, borderRadius: 99, background: 'var(--bg-3)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 99, background: m.color, width: `${Math.min(100, (m.value / m.target) * 100)}%`, transition: 'width 0.4s' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Liste des repas */}
      <div style={{ marginBottom: 12 }}>
        {entries.length === 0 && !showForm && (
          <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--text-4)', fontSize: 14 }}>
            Aucun repas enregistré pour ce jour
          </div>
        )}
        {entries.map(entry => (
          <div key={entry.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
            background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 6,
          }}>
            <span style={{ fontSize: 12, color: 'var(--text-4)', minWidth: 38, fontFamily: 'var(--font-mono)' }}>{entry.time}</span>
            <span style={{ flex: 1, fontSize: 14, color: 'var(--text-0)', fontWeight: 500 }}>{entry.name}</span>
            <div style={{ display: 'flex', gap: 10, flexShrink: 0, alignItems: 'center' }}>
              <span style={{ ...monoVal('#f59e0b'), fontSize: 12 }}>{entry.cal} kcal</span>
              <span style={{ fontSize: 11, color: 'var(--text-4)' }}>G{entry.carbs} P{entry.protein} L{entry.fat}</span>
            </div>
            <button onClick={() => save(entries.filter(e => e.id !== entry.id))} style={{
              background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer',
              fontSize: 18, padding: '0 2px', lineHeight: 1, flexShrink: 0,
            }}>×</button>
          </div>
        ))}
      </div>

      {/* Formulaire */}
      {showForm && (
        <div style={{ background: 'var(--bg-2)', border: '1px solid var(--accent-orange)', borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Nom du repas ou de l'aliment"
            style={{ ...inputStyle, marginBottom: 10 }}
            onKeyDown={e => e.key === 'Enter' && addEntry()}
            autoFocus
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
            {[
              { key: 'cal',     placeholder: 'kcal *' },
              { key: 'carbs',   placeholder: 'Glucides g' },
              { key: 'protein', placeholder: 'Protéines g' },
              { key: 'fat',     placeholder: 'Lipides g' },
            ].map(f => (
              <input key={f.key} type="number" value={form[f.key]} placeholder={f.placeholder}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                style={inputStyle} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={addEntry} disabled={!form.name || !form.cal} style={{
              flex: 1, padding: '10px', borderRadius: 8, background: 'var(--accent-orange)', color: '#fff',
              border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              opacity: (!form.name || !form.cal) ? 0.5 : 1,
            }}>Ajouter</button>
            <button onClick={() => { setShowForm(false); setForm({ name: '', cal: '', carbs: '', protein: '', fat: '' }); }} style={{
              padding: '10px 18px', borderRadius: 8, background: 'var(--bg-3)', border: '1px solid var(--border)',
              color: 'var(--text-3)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
            }}>Annuler</button>
          </div>
        </div>
      )}

      {!showForm && (
        <button onClick={() => setShowForm(true)} style={{
          width: '100%', padding: '11px', borderRadius: 10, background: 'transparent',
          border: '2px dashed var(--border)', color: 'var(--text-4)', fontSize: 14, cursor: 'pointer',
          transition: 'all 0.15s', fontFamily: 'inherit',
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.color = 'var(--text-2)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-4)'; }}
        >
          + Ajouter un repas
        </button>
      )}
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function NutritionCoach({ athlete, activities = [], plannedEvents = [] }) {
  const [diet,       setDiet]       = useState('omnivore');
  const [difficulty, setDifficulty] = useState(null);
  const [activeTab,  setActiveTab]  = useState('menu');

  const weight = athlete?.icu_weight || athlete?.weight || 70;
  const needs  = useMemo(() => calcDailyNeeds(athlete, activities, plannedEvents), [athlete, activities, plannedEvents]);

  const showPre    = ['moderate', 'hard', 'long'].includes(needs.loadLevel);
  const showDuring = needs.loadLevel === 'long';
  const showPost   = ['moderate', 'hard', 'long'].includes(needs.loadLevel);

  // Chronological, assuming a morning ride.
  const slots = ['breakfast', ...(showPre ? ['pre'] : []), ...(showDuring ? ['during'] : []), ...(showPost ? ['post'] : []), 'lunch', 'snack', 'dinner'];

  const tabs = [
    { key: 'menu',    label: 'Menu du jour' },
    { key: 'courses', label: 'Courses de la semaine' },
    { key: 'journal', label: 'Journal' },
  ];

  const kcalOf = { carbs: needs.carbs * 4, protein: needs.protein * 4, fat: needs.fat * 9 };
  const kcalSum = kcalOf.carbs + kcalOf.protein + kcalOf.fat || 1;
  const water = needs.loadLevel === 'long' ? weight * 0.05 : ['rest', 'easy'].includes(needs.loadLevel) ? weight * 0.033 : weight * 0.04;

  return (
    <div className="nutri">
      <div className="page-header">
        <div className="page-title">Nutrition</div>
        <div className="page-subtitle">Ce que tu manges aujourd’hui, calé sur ta séance</div>
      </div>

      <section className="card nutri-today">
        <div className="nutri-today-head">
          <div>
            <div className="nutri-day">
              <Picto name={needs.loadLevel === 'rest' ? 'moon' : needs.loadLevel === 'easy' ? 'leaf' : 'bolt'} size={22} />
              {DAY_TITLES[needs.loadLevel] || 'Aujourd’hui'}
              {needs.durationH > 0 && <span className="nutri-day-sub"> · {needs.durationH} h de vélo</span>}
            </div>
            <p className="nutri-target"><strong>{needs.cal.toLocaleString('fr')} kcal</strong> à viser aujourd’hui</p>
          </div>
        </div>
        <div className="nutri-bar" role="img" aria-label={`Glucides ${needs.carbs} g, protéines ${needs.protein} g, lipides ${needs.fat} g`}>
          <span className="m-carbs" style={{ width: `${(kcalOf.carbs / kcalSum) * 100}%` }} />
          <span className="m-protein" style={{ width: `${(kcalOf.protein / kcalSum) * 100}%` }} />
          <span className="m-fat" style={{ width: `${(kcalOf.fat / kcalSum) * 100}%` }} />
        </div>
        <div className="nutri-legend">
          <span><i className="m-carbs" />Glucides <strong>{needs.carbs} g</strong></span>
          <span><i className="m-protein" />Protéines <strong>{needs.protein} g</strong></span>
          <span><i className="m-fat" />Lipides <strong>{needs.fat} g</strong></span>
        </div>
        {needs.tomorrowPlan && (
          <p className="nutri-tomorrow">
            Demain : {needs.tomorrowPlan.title || 'entraînement'}{needs.preloading ? '. Ce soir, recharge en glucides.' : '.'}
          </p>
        )}
        <details className="nutri-how">
          <summary>Comment c’est calculé</summary>
          <p>
            Base {needs.bmr} kcal{needs.trainingKcal > 0 ? ` + ${needs.trainingKcal} kcal brûlées à l’entraînement` : ''}.
            {' '}{weight} kg{!athlete?.icu_weight && !athlete?.weight ? ' (valeur par défaut, à régler dans ton profil)' : ''}
            {athlete?.icu_ftp ? `, FTP ${athlete.icu_ftp} W` : ''}.
          </p>
          {needs.explanation && <p>{needs.explanation}</p>}
        </details>
      </section>

      <div className="nutri-controls">
        <div className="nutri-tabs" role="tablist">
          {tabs.map(tab => (
            <button key={tab.key} type="button" role="tab" aria-selected={activeTab === tab.key}
              className={activeTab === tab.key ? 'is-on' : ''} onClick={() => setActiveTab(tab.key)}>
              {tab.label}
            </button>
          ))}
        </div>
        <div className="nutri-prefs">
          <label>
            Régime
            <select value={diet} onChange={e => setDiet(e.target.value)}>
              {DIET_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </label>
          <label>
            Recettes
            <select value={difficulty || ''} onChange={e => setDifficulty(e.target.value || null)}>
              <option value="">Toutes</option>
              {DIFFICULTY_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      {/* ═══ Menu du jour ═══ */}
      {activeTab === 'menu' && (
        <>
          <ol className="meals">
            {slots.map(slot => (
              <MealSlot
                key={`${slot}-${diet}-${difficulty}`}
                slotKey={slot} diet={diet} weightKg={weight} difficulty={difficulty}
                staticRecipes={slot === 'during' ? DURING_STATIC : null}
              />
            ))}
          </ol>

          <section className="card nutri-tips">
            <h3><Picto name="drop" size={20} /> Boire</h3>
            <p>
              Au moins {Math.round(water * 10) / 10} L sur la journée.
              {needs.loadLevel === 'long' ? ' Sur le vélo : 500 à 700 ml par heure, avec électrolytes au-delà de 2 h.'
                : !['rest', 'easy'].includes(needs.loadLevel) ? ' Sur le vélo : 400 à 600 ml par heure.' : ''}
            </p>
            {needs.loadLevel !== 'rest' && (
              <>
                <h3><Picto name="recover" size={20} /> Quand manger</h3>
                <ul>
                  <li>Repas 2 à 3 h avant la sortie, ou une collation 45 min avant.</li>
                  {needs.loadLevel === 'long' && <li>Sur le vélo : 60 à 90 g de glucides par heure dès 45 min.</li>}
                  <li>Dans les 30 min après : glucides + protéines.</li>
                  <li>Le soir : protéines et légumes, glucides modérés.</li>
                </ul>
              </>
            )}
          </section>
        </>
      )}

      {/* ═══ Liste de courses ═══ */}
      {activeTab === 'courses' && (
        <div className="card" style={{ padding: '18px 20px', marginBottom: 0 }}>
          <ShoppingList key={`${diet}-${difficulty}`} diet={diet} weightKg={weight} difficulty={difficulty} />
        </div>
      )}

      {/* ═══ Journal alimentaire ═══ */}
      {activeTab === 'journal' && (
        <div className="card" style={{ padding: '18px 20px', marginBottom: 0 }}>
          <JournalAlimentaire needs={needs} />
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
