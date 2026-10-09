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

// ── Sous-composants ───────────────────────────────────────────────────────────



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
    <div className="nutri-empty">
      <Picto name="cart" size={48} />
      <p>Une semaine de repas type, calée sur une semaine d’entraînement, et la liste des ingrédients à acheter.</p>
      <button type="button" className="btn btn-primary" onClick={generate}>Préparer ma liste de courses</button>
    </div>
  );

  if (state === 'loading') return (
    <div className="nutri-empty"><p>Préparation de la semaine…</p></div>
  );

  if (state === 'error') return (
    <div className="nutri-empty">
      <p>La liste n’a pas pu être préparée.</p>
      <button type="button" className="btn" onClick={generate}>Réessayer</button>
    </div>
  );

  return (
    <div>
      <div className="shop-head">
        <span className="shop-count">{checkedCount} / {totalCount} dans le panier</span>
        <div className="shop-actions">
          <button type="button" className="btn" onClick={copyList}>Copier la liste</button>
          <button type="button" className="btn" onClick={generate}>Autre semaine</button>
        </div>
      </div>

      <div className="shop-grid">
        {shopping.map(cat => (
          <section key={cat.category} className="shop-cat">
            <h4>{cat.category} <span>{cat.items.length}</span></h4>
            <ul>
              {cat.items.map(item => {
                const key  = item.name.toLowerCase();
                const done = checked.has(key);
                const measures = [...new Set(item.measures)].slice(0, 3).join(', ');
                return (
                  <li key={key}>
                    <label className={done ? 'is-done' : ''}>
                      <input type="checkbox" checked={done} onChange={() => toggle(key)} />
                      <span className="shop-item">{item.name}{measures && <small>{measures}</small>}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {weekPlan && (
        <div className="shop-week">
          <h4>La semaine type</h4>
          {weekPlan.map(({ day, load, meals }) => (
            <details key={day} className="shop-day" open={expandedDay === day}
              onToggle={e => { if (e.currentTarget.open) setExpandedDay(day); }}>
              <summary><span className="shop-day-name">{day}</span><span className="shop-day-load">{LOAD_LABELS[load]}</span></summary>
              <ul>
                {Object.entries(meals).map(([slot, recipe]) => {
                  const meta = MEAL_META[slot];
                  if (!meta) return null;
                  return (
                    <li key={slot}>
                      <Picto name={meta.icon} size={16} />
                      <span className="shop-slot">{meta.label}</span>
                      <span>{recipe ? recipe.name : '—'}</span>
                    </li>
                  );
                })}
              </ul>
            </details>
          ))}
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
  const isToday = date >= todayStr();
  const macros = [
    { key: 'carbs', label: 'Glucides', value: totals.carbs, target: needs.carbs },
    { key: 'protein', label: 'Protéines', value: totals.protein, target: needs.protein },
    { key: 'fat', label: 'Lipides', value: totals.fat, target: needs.fat },
  ];

  return (
    <div className="journal">
      <div className="journal-nav">
        <button type="button" className="btn" onClick={() => navDay(-1)} aria-label="Jour précédent">‹</button>
        <div className="journal-date">{formatDate(date)}{isToday && <small>Aujourd’hui</small>}</div>
        <button type="button" className="btn" onClick={() => navDay(1)} disabled={isToday} aria-label="Jour suivant">›</button>
      </div>

      <div className="journal-total">
        <p><strong>{totals.cal}</strong> / {needs.cal} kcal mangées</p>
        <div className="nutri-bar"><span className="m-carbs" style={{ width: `${Math.min(100, calRatio * 100)}%` }} /></div>
        <div className="journal-macros">
          {macros.map(m => (
            <div key={m.key}>
              <span><i className={`m-${m.key}`} />{m.label}</span>
              <strong>{m.value} / {m.target} g</strong>
            </div>
          ))}
        </div>
      </div>

      {entries.length === 0 && !showForm && <p className="journal-empty">Rien de noté pour ce jour.</p>}
      {entries.length > 0 && (
        <ul className="journal-list">
          {entries.map(entry => (
            <li key={entry.id}>
              <span className="journal-time">{entry.time}</span>
              <span className="journal-name">{entry.name}</span>
              <span className="journal-kcal">{entry.cal} kcal</span>
              <button type="button" className="journal-del" onClick={() => save(entries.filter(e => e.id !== entry.id))} aria-label={`Supprimer ${entry.name}`}>×</button>
            </li>
          ))}
        </ul>
      )}

      {showForm ? (
        <div className="journal-form">
          <label className="journal-field-wide">
            Repas ou aliment
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && addEntry()} autoFocus />
          </label>
          {[
            { key: 'cal', label: 'kcal' },
            { key: 'carbs', label: 'Glucides (g)' },
            { key: 'protein', label: 'Protéines (g)' },
            { key: 'fat', label: 'Lipides (g)' },
          ].map(f => (
            <label key={f.key}>
              {f.label}
              <input type="number" inputMode="numeric" value={form[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
            </label>
          ))}
          <div className="journal-form-actions">
            <button type="button" className="btn btn-primary" onClick={addEntry} disabled={!form.name || !form.cal}>Noter ce repas</button>
            <button type="button" className="btn" onClick={() => { setShowForm(false); setForm({ name: '', cal: '', carbs: '', protein: '', fat: '' }); }}>Annuler</button>
          </div>
        </div>
      ) : (
        <button type="button" className="journal-add" onClick={() => setShowForm(true)}>+ Noter un repas</button>
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

    </div>
  );
}
