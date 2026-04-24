import { useState, useEffect, useMemo, useCallback } from 'react';
import { calcDailyNeeds } from '../data/nutritionRecipes';
import { getFrenchSlotRecipes, buildFrenchWeekShoppingList } from '../data/frenchRecipes';

// ── Constantes ────────────────────────────────────────────────────────────────

const DIET_OPTIONS = [
  { key: 'omnivore',   label: 'Omnivore',   icon: '🥩' },
  { key: 'vegetarian', label: 'Végétarien', icon: '🥚' },
  { key: 'vegan',      label: 'Vegan',      icon: '🌱' },
];

const DIFFICULTY_OPTIONS = [
  { key: 'easy',   label: 'Facile',  color: '#22c55e' },
  { key: 'medium', label: 'Moyen',   color: '#f59e0b' },
  { key: 'hard',   label: 'Élaboré', color: '#ef4444' },
];

const MEAL_META = {
  breakfast: { label: 'Petit-déjeuner',    icon: '☀️',  color: '#f59e0b' },
  pre:       { label: 'Avant la sortie',   icon: '⚡',   color: '#22d3ee' },
  during:    { label: 'Pendant la sortie', icon: '🚴',   color: '#4d7fe8' },
  post:      { label: 'Récupération',      icon: '💪',   color: '#22c55e' },
  lunch:     { label: 'Déjeuner',          icon: '🍽️',  color: '#a78bfa' },
  snack:     { label: 'Collation',         icon: '🍌',   color: '#fb923c' },
  dinner:    { label: 'Dîner',             icon: '🌙',   color: '#7dd3fc' },
};

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

function RecipeCard({ recipe, expanded, onToggle, onShuffle, poolSize, poolIdx }) {
  const { name, difficulty, area, time, macros, macrosEstimated, ingredients, steps, note } = recipe;
  return (
    <div style={{
      background: 'var(--bg-2)',
      border: `1px solid ${expanded ? 'rgba(34,211,238,0.35)' : 'var(--border)'}`,
      borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.15s',
    }}>
      {/* Ligne principale */}
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <button onClick={onToggle} style={{
          flex: 1, display: 'flex', flexDirection: 'column', gap: 7, padding: '12px 14px',
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-0)' }}>{name}</span>
            {area && <span style={{ fontSize: 12, color: 'var(--text-4)' }}>{area}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <DifficultyBadge difficulty={difficulty} />
            <span style={{ fontSize: 12, color: 'var(--text-4)' }}>⏱ {time} min</span>
            <span style={{ ...monoVal('#f59e0b'), fontSize: 12 }}>{macros.cal} kcal{macrosEstimated ? '*' : ''}</span>
            <span style={{ ...monoVal('#4d7fe8'), fontSize: 12 }}>G {macros.carbs}g</span>
            <span style={{ ...monoVal('#22c55e'), fontSize: 12 }}>P {macros.protein}g</span>
            <span style={{ ...monoVal('#f97316'), fontSize: 12 }}>L {macros.fat}g</span>
          </div>
        </button>

        <div style={{ display: 'flex', borderLeft: '1px solid var(--border)' }}>
          <button onClick={e => { e.stopPropagation(); onShuffle(); }} title="Autre recette"
            style={{ padding: '0 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text-3)' }}>
            🔀
          </button>
          <button onClick={onToggle} style={{
            padding: '0 12px', background: 'none', border: 'none', borderLeft: '1px solid var(--border)',
            cursor: 'pointer', color: 'var(--text-4)', fontSize: 12,
          }}>
            {expanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {poolSize > 1 && (
        <div style={{ padding: '0 14px 8px', fontSize: 11, color: 'var(--text-4)' }}>
          {poolIdx + 1} / {poolSize} recettes disponibles
        </div>
      )}

      {/* Détail expandé */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px 16px' }}>
          <div style={{ ...sectionLabel, marginBottom: 8 }}>Ingrédients</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 20px', marginBottom: 14 }}>
            {ingredients.map((ing, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                <span style={{ color: 'var(--text-2)' }}>{ing.name}</span>
                {ing.qty && <span style={monoVal('var(--accent-cyan)')}>{ing.qty}</span>}
              </div>
            ))}
          </div>
          <div style={{ ...sectionLabel, marginBottom: 6 }}>Préparation</div>
          <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.75, margin: '0 0 10px', whiteSpace: 'pre-line' }}>
            {steps}
          </p>
          {note && (
            <div style={{ padding: '9px 13px', borderRadius: 8, background: 'rgba(34,211,238,0.07)', border: '1px solid rgba(34,211,238,0.18)', fontSize: 13, color: 'var(--accent-cyan)', lineHeight: 1.6 }}>
              💡 {note}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MealSlot({ slotKey, diet, weightKg, difficulty, staticRecipes = null }) {
  const { label, icon, color } = MEAL_META[slotKey] || {};

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
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color }}>{label}</span>
      </div>
      {!current ? (
        <div style={{ fontSize: 13, color: 'var(--text-4)', padding: '8px 0' }}>
          Aucune recette {difficulty ? `"${DIFFICULTY_OPTIONS.find(o => o.key === difficulty)?.label}"` : ''} pour ce créneau.
        </div>
      ) : (
        <RecipeCard
          recipe={current}
          expanded={expanded}
          onToggle={() => setExpanded(e => !e)}
          onShuffle={handleShuffle}
          poolSize={pool.length}
          poolIdx={idx}
        />
      )}
    </div>
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
        return `☐ ${item.name}${measures ? ' — ' + measures : ''}`;
      }),
    ]);
    navigator.clipboard?.writeText(lines.join('\n')).catch(() => {});
  };

  const checkedCount = shopping.reduce((s, cat) => s + cat.items.filter(i => checked.has(i.name.toLowerCase())).length, 0);
  const totalCount   = shopping.reduce((s, cat) => s + cat.items.length, 0);

  if (state === 'idle') return (
    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
      <div style={{ fontSize: 44, marginBottom: 16 }}>🛒</div>
      <div style={{ fontSize: 15, color: 'var(--text-2)', marginBottom: 6, lineHeight: 1.6 }}>
        Génère un plan repas pour une semaine type et la liste d'ingrédients agrégée.
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-4)', marginBottom: 24 }}>
        Repos · Facile · Intensif · Modéré · Facile · Longue sortie · Repos
      </div>
      <button onClick={generate} style={{
        padding: '11px 28px', borderRadius: 10, background: 'var(--accent-cyan)', color: '#000',
        border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer',
      }}>
        Générer la liste de courses
      </button>
    </div>
  );

  if (state === 'loading') return (
    <div style={{ textAlign: 'center', padding: '48px 20px' }}>
      <div style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--accent-cyan)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 16px' }} />
      <div style={{ fontSize: 14, color: 'var(--text-3)' }}>Génération du plan semaine…</div>
    </div>
  );

  if (state === 'error') return (
    <div style={{ textAlign: 'center', padding: 24, color: '#ef4444', fontSize: 14 }}>
      Erreur.{' '}
      <button onClick={generate} style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer', textDecoration: 'underline', fontSize: 14 }}>
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
          }}>📋 Copier</button>
          <button onClick={generate} style={{
            padding: '7px 14px', borderRadius: 8, background: 'var(--bg-3)', border: '1px solid var(--border)',
            color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
          }}>🔄 Régénérer</button>
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
                      {done && <span style={{ color: '#000', fontSize: 10, fontWeight: 800 }}>✓</span>}
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
                          <span style={{ fontSize: 13 }}>{meta.icon}</span>
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
  const calColor = calRatio < 0.5 ? '#4d7fe8' : calRatio > 1.1 ? '#ef4444' : '#22c55e';

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
            <div style={{ fontSize: 11, color: 'var(--accent-cyan)', marginTop: 2 }}>Aujourd'hui</div>
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
            { label: 'Glucides',  value: totals.carbs,   target: needs.carbs,   color: '#4d7fe8' },
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
        <div style={{ background: 'var(--bg-2)', border: '1px solid var(--accent-cyan)', borderRadius: 12, padding: 16, marginBottom: 12 }}>
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
              flex: 1, padding: '10px', borderRadius: 8, background: 'var(--accent-cyan)', color: '#000',
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

export default function NutritionCoach({ athlete, activities = [] }) {
  const [diet,       setDiet]       = useState('omnivore');
  const [difficulty, setDifficulty] = useState(null);
  const [activeTab,  setActiveTab]  = useState('menu');

  const weight = athlete?.icu_weight || athlete?.weight || 70;
  const needs  = useMemo(() => calcDailyNeeds(athlete, activities), [athlete, activities]);

  const showPre    = ['moderate', 'hard', 'long'].includes(needs.loadLevel);
  const showDuring = needs.loadLevel === 'long';
  const showPost   = ['moderate', 'hard', 'long'].includes(needs.loadLevel);

  const leftSlots  = ['breakfast', ...(showPre ? ['pre'] : []), ...(showDuring ? ['during'] : []), 'lunch'];
  const rightSlots = ['snack', ...(showPost ? ['post'] : []), 'dinner'];

  const tabs = [
    { key: 'menu',    label: 'Menu du jour',     icon: '🍽️' },
    { key: 'courses', label: 'Liste de courses', icon: '🛒' },
    { key: 'journal', label: 'Mon journal',      icon: '📔' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 48 }}>

      <div className="page-header">
        <div className="page-title">Nutrition Coach</div>
        <div className="page-subtitle">Besoins adaptés à votre charge · Recettes françaises · Journal alimentaire</div>
      </div>

      {/* Panneau de contrôle */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>

        <div className="card" style={{ padding: '16px 18px', marginBottom: 0 }}>
          <div style={sectionLabel}>Régime alimentaire</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {DIET_OPTIONS.map(opt => (
              <button key={opt.key} onClick={() => setDiet(opt.key)} style={{
                flex: 1, padding: '10px 6px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
                border: `1px solid ${diet === opt.key ? 'var(--accent-cyan)' : 'var(--border)'}`,
                background: diet === opt.key ? 'rgba(34,211,238,0.1)' : 'transparent',
                color: diet === opt.key ? 'var(--accent-cyan)' : 'var(--text-3)',
                transition: 'all 0.15s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}>
                <span style={{ fontSize: 20 }}>{opt.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: '16px 18px', marginBottom: 0 }}>
          <div style={sectionLabel}>Difficulté des recettes</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => setDifficulty(null)} style={pill('var(--accent-cyan)', difficulty === null)}>
              Toutes
            </button>
            {DIFFICULTY_OPTIONS.map(opt => (
              <button key={opt.key} onClick={() => setDifficulty(d => d === opt.key ? null : opt.key)}
                style={pill(opt.color, difficulty === opt.key)}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: '16px 18px', marginBottom: 0 }}>
          <div style={sectionLabel}>Contexte du jour</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={tag(LOAD_COLORS[needs.loadLevel])}>{needs.loadLabel}</span>
            {needs.durationH > 0 && (
              <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{needs.durationH}h · TSS {needs.tss}</span>
            )}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
            Poids :{' '}
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-1)' }}>{weight} kg</span>
            {!athlete?.icu_weight && !athlete?.weight && (
              <span style={{ fontSize: 11, color: '#f97316', marginLeft: 8 }}>valeur par défaut</span>
            )}
          </div>
        </div>
      </div>

      {/* Objectifs macros */}
      <div className="card" style={{ padding: '18px 20px', marginBottom: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
          <span style={sectionLabel}>Objectifs journaliers</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: '#f59e0b', letterSpacing: '-0.03em' }}>
              {needs.cal.toLocaleString('fr')}
            </span>
            <span style={{ fontSize: 14, color: 'var(--text-3)' }}>kcal / jour</span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 28px' }}>
          <MacroProgress label="Glucides"  value={needs.carbs}   max={400} color="#4d7fe8" />
          <MacroProgress label="Protéines" value={needs.protein} max={200} color="#22c55e" />
          <MacroProgress label="Lipides"   value={needs.fat}     max={120} color="#f97316" />
        </div>
      </div>

      {/* Sélecteur d'onglets */}
      <div style={{ display: 'flex', alignSelf: 'flex-start', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        {tabs.map((tab, i) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: '9px 20px', display: 'flex', alignItems: 'center', gap: 7,
            background: activeTab === tab.key ? 'rgba(34,211,238,0.1)' : 'transparent',
            border: 'none', borderRight: i < tabs.length - 1 ? '1px solid var(--border)' : 'none',
            color: activeTab === tab.key ? 'var(--accent-cyan)' : 'var(--text-3)',
            fontSize: 13, fontWeight: activeTab === tab.key ? 600 : 400,
            cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
          }}>
            <span style={{ fontSize: 14 }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ Menu du jour ═══ */}
      {activeTab === 'menu' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}>
          <div className="card" style={{ padding: '16px 18px', marginBottom: 0 }}>
            <div style={{ ...sectionLabel, marginBottom: 16 }}>Matin &amp; Midi</div>
            {leftSlots.map(slot => (
              <MealSlot
                key={`${slot}-${diet}-${difficulty}`}
                slotKey={slot} diet={diet} weightKg={weight} difficulty={difficulty}
                staticRecipes={slot === 'during' ? DURING_STATIC : null}
              />
            ))}
          </div>

          <div className="card" style={{ padding: '16px 18px', marginBottom: 0 }}>
            <div style={{ ...sectionLabel, marginBottom: 16 }}>Après-midi &amp; Soir</div>
            {rightSlots.map(slot => (
              <MealSlot
                key={`${slot}-${diet}-${difficulty}`}
                slotKey={slot} diet={diet} weightKg={weight} difficulty={difficulty}
              />
            ))}

            <div style={{ padding: '13px 16px', borderRadius: 10, background: 'rgba(77,127,232,0.07)', border: '1px solid rgba(77,127,232,0.18)', marginTop: 6 }}>
              <div style={{ ...sectionLabel, color: '#4d7fe8', marginBottom: 6 }}>💧 Hydratation</div>
              <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.7 }}>
                {needs.loadLevel === 'long'
                  ? `≥ ${Math.round(weight * 0.05)} L. Pendant : 500–700 ml/h avec électrolytes si > 2h.`
                  : needs.loadLevel === 'rest' || needs.loadLevel === 'easy'
                  ? `≥ ${Math.round(weight * 0.033)} L d'eau par jour.`
                  : `≥ ${Math.round(weight * 0.04)} L. Pendant l'effort : 400–600 ml/h.`}
              </p>
            </div>

            {needs.loadLevel !== 'rest' && (
              <div style={{ padding: '13px 16px', borderRadius: 10, background: 'rgba(34,211,238,0.05)', border: '1px solid rgba(34,211,238,0.14)', marginTop: 10 }}>
                <div style={{ ...sectionLabel, color: 'var(--accent-cyan)', marginBottom: 6 }}>⏱ Timing nutritionnel</div>
                <ul style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, paddingLeft: 18, lineHeight: 2 }}>
                  <li>Repas pré-séance : <strong>2–3h avant</strong> ou collation 45 min</li>
                  {needs.loadLevel === 'long' && <li>Pendant : <strong>60–90 g glucides/h</strong> dès 45 min</li>}
                  <li>Fenêtre de récupération : <strong>30 min</strong> après l'effort</li>
                  <li>Dîner : <strong>protéines + légumes</strong>, glucides modérés</li>
                </ul>
              </div>
            )}
          </div>
        </div>
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
