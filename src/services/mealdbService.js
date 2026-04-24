/**
 * Nutrition recipes engine (LLM-first)
 *
 * Replaces TheMealDB with a structured LLM generation flow focused on:
 * - French / European everyday meals
 * - Simplicity and practical prep time
 * - Higher diversity, lower repetition
 *
 * If no LLM key is configured, falls back to local recipes so UI remains usable.
 */

import persistence from './persistence';
import { RECIPES } from '../data/nutritionRecipes';

const TTL = 4 * 3600 * 1000; // 4h
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

const SLOT_LABELS = {
    breakfast: 'petit-dejeuner',
    pre: 'pre-entrainement',
    during: 'pendant-sortie',
    post: 'post-entrainement',
    lunch: 'dejeuner',
    snack: 'collation',
    dinner: 'diner',
};

const SLOT_STYLE = {
    breakfast: 'rapide, digestible, base pain/avoine/oeufs/fruit, style francais/europeen',
    pre: 'facile a digerer, priorite glucides, peu de gras/fibres',
    post: 'recuperation: glucides + proteines, simple et concret',
    lunch: 'repas de travail, prep <= 25 min, ingredients accessibles supermarche FR',
    snack: 'collation utile, peu d ingredients, portable',
    dinner: 'diner familial, simple, legumes + proteines, budget raisonnable',
};

const ING_CATS = [
    { label: 'Viandes & Poissons', re: /poulet|dinde|boeuf|porc|jambon|thon|saumon|cabillaud|sardine|maquereau|oeuf|oeufs|tofu|tempeh|steak|escalope/i },
    { label: 'Oeufs & Produits laitiers', re: /oeuf|oeufs|lait|yaourt|skyr|fromage|mozzarella|feta|parmesan|beurre|creme|fromage blanc/i },
    { label: 'Feculents & Legumineuses', re: /riz|pates|semoule|couscous|quinoa|avoine|pain|lentilles|pois chiches|haricots|pommes? de terre|patate douce|tortilla/i },
    { label: 'Legumes', re: /tomate|oignon|ail|courgette|poivron|carotte|epinard|brocoli|salade|concombre|champignon|aubergine|haricots verts|poireau|chou/i },
    { label: 'Fruits', re: /banane|pomme|poire|orange|citron|fruits rouges|fraise|framboise|date|dattes|raisin|kiwi/i },
    { label: 'Epices & Herbes', re: /sel|poivre|paprika|cumin|curry|thym|origan|basilic|persil|coriandre|romarin|muscade/i },
    { label: 'Huiles & Condiments', re: /huile|vinaigre|moutarde|sauce soja|tamari|mayonnaise|pesto|harissa|ketchup/i },
    { label: 'Sucres & Divers', re: /miel|sucre|sirop|chocolat|cacahuete|amande|noix|graines/i },
];

let llmConfigCache = { ts: 0, value: null };

function cacheGet(key) {
    try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.ts || Date.now() - parsed.ts > TTL) {
            sessionStorage.removeItem(key);
            return null;
        }
        return parsed.data;
    } catch {
        return null;
    }
}

function cacheSet(key, data) {
    try {
        sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
    } catch { }
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function categoriseIngredient(name = '') {
    for (const { label, re } of ING_CATS) {
        if (re.test(name)) return label;
    }
    return 'Autres';
}

function normalizeDifficulty(difficulty) {
    if (!difficulty) return null;
    if (difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard') return difficulty;
    return null;
}

function extractJsonBlock(text = '') {
    const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) return fenced[1].trim();
    const arr = text.match(/\[[\s\S]*\]/);
    if (arr?.[0]) return arr[0].trim();
    return text.trim();
}

function sanitizeRecipe(raw, { slot, weightKg, idx = 0 }) {
    const safeName = String(raw?.name || '').trim() || `Recette ${idx + 1}`;
    const safeArea = String(raw?.area || 'France').trim() || 'France';
    const ingredients = Array.isArray(raw?.ingredients)
        ? raw.ingredients
            .map(ing => ({
                name: String(ing?.name || '').trim(),
                qty: String(ing?.qty || '').trim(),
                unit: '',
            }))
            .filter(ing => ing.name)
            .slice(0, 18)
        : [];

    const baseMacros = {
        cal: Math.max(180, Number(raw?.macros?.cal) || 480),
        carbs: Math.max(10, Number(raw?.macros?.carbs) || 60),
        protein: Math.max(5, Number(raw?.macros?.protein) || 20),
        fat: Math.max(2, Number(raw?.macros?.fat) || 14),
    };

    const scale = (weightKg || 70) / 70;

    return {
        id: `llm_${slot}_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 8)}`,
        name: safeName,
        thumb: null,
        category: SLOT_LABELS[slot] || slot,
        area: safeArea,
        time: Math.max(5, Math.min(90, Number(raw?.time) || 20)),
        macros: {
            cal: Math.round(baseMacros.cal * scale),
            carbs: Math.round(baseMacros.carbs * scale),
            protein: Math.round(baseMacros.protein * scale),
            fat: Math.round(baseMacros.fat * scale),
        },
        macrosEstimated: true,
        ingredients,
        steps: String(raw?.steps || '').trim().slice(0, 700) || 'Assembler les ingredients et ajuster selon votre faim.',
        note: String(raw?.note || '').trim() || 'Option pratique pour une journee chargee.',
        sourceUrl: null,
        sourceLabel: 'Coach IA',
        marmitonUrl: `https://www.marmiton.org/recettes/recherche.aspx?aqt=${encodeURIComponent(safeName)}`,
        youtubeUrl: null,
        fromApi: true,
    };
}

async function getLlmConfig() {
    if (llmConfigCache.value && Date.now() - llmConfigCache.ts < 5 * 60 * 1000) {
        return llmConfigCache.value;
    }

    const [provider, claudeKey, groqKey] = await Promise.all([
        persistence.getLlmProvider(),
        persistence.getClaudeApiKey(),
        persistence.getGroqApiKey(),
    ]);

    const value = {
        provider: provider || 'groq',
        claudeKey: claudeKey || null,
        groqKey: groqKey || null,
    };

    llmConfigCache = { ts: Date.now(), value };
    return value;
}

async function callClaude(systemPrompt, userPrompt, apiKey) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
            model: CLAUDE_MODEL,
            max_tokens: 1800,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
        }),
    });

    if (!response.ok) {
        let msg = `Claude API error ${response.status}`;
        try {
            const b = await response.json();
            msg = b?.error?.message || msg;
        } catch { }
        throw new Error(msg);
    }

    const data = await response.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    return text || '';
}

async function callGroq(systemPrompt, userPrompt, apiKey) {
    const response = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: GROQ_MODEL,
            max_tokens: 1800,
            temperature: 0.7,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
        }),
    });

    if (!response.ok) {
        let msg = `Groq API error ${response.status}`;
        try {
            const b = await response.json();
            msg = b?.error?.message || msg;
        } catch { }
        throw new Error(msg);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
}

function mapDiet(diet) {
    if (diet === 'omnivore') return 'omnivore';
    if (diet === 'vegetarian') return 'vegetarien';
    return 'vegan';
}

function loadRecentNames(slot, diet) {
    return cacheGet(`llm_recent_${slot}_${diet}`) || [];
}

function saveRecentNames(slot, diet, names) {
    cacheSet(`llm_recent_${slot}_${diet}`, names.slice(0, 30));
}

function fallbackFromLocalRecipes({ slot, diet, weightKg, count, difficulty }) {
    const dietKey = diet === 'omnivore' ? 'omni' : diet;
    const pool = RECIPES
        .filter(r => Array.isArray(r.meal) && r.meal.includes(slot))
        .filter(r => Array.isArray(r.diet) && r.diet.includes(dietKey))
        .map((r, idx) => sanitizeRecipe({
            name: r.name,
            area: 'France',
            time: r.time,
            macros: r.macros,
            ingredients: r.ingredients?.map(ing => ({
                name: ing.name,
                qty: `${ing.qty}${ing.unit ? ` ${ing.unit}` : ''}`.trim(),
            })),
            steps: r.steps,
            note: r.note || 'Recette locale (fallback hors IA).',
        }, { slot, weightKg, idx }));

    const filtered = normalizeDifficulty(difficulty)
        ? pool.filter(r => estimateDifficulty(r) === difficulty)
        : pool;

    return shuffle(filtered).slice(0, count);
}

async function generateRecipesLLM({ slot, diet, weightKg, count, difficulty }) {
    const llm = await getLlmConfig();
    const apiKey = llm.provider === 'claude' ? llm.claudeKey : llm.groqKey;
    if (!apiKey) throw new Error('NO_LLM_KEY');

    const recentNames = loadRecentNames(slot, diet);
    const difficultyHint = difficulty ? difficulty : 'mixte';

    const systemPrompt = [
        'Tu es un chef nutritionniste francais specialise endurance.',
        'Tu proposes UNIQUEMENT des recettes simples, realistes, europeennes et variees.',
        'Pas de recettes exotiques inutiles. Pas de redondance.',
        'Retourne STRICTEMENT un JSON valide sans texte autour.',
    ].join(' ');

    const userPrompt = [
        `Genere ${count} recettes pour le slot ${SLOT_LABELS[slot] || slot}.`,
        `Regime: ${mapDiet(diet)}.`,
        `Difficulte cible: ${difficultyHint}.`,
        `Style attendu: ${SLOT_STYLE[slot] || 'simple et pratique'}.`,
        `Poids athlete de reference: ${Math.round(weightKg)} kg (macros approx).`,
        'Contexte: personne active avec travail/famille, cuisine rapide.',
        'IMPORTANT: Evite ces noms deja servis et toute variante proche:',
        recentNames.length ? recentNames.join(' | ') : '(aucun)',
        'Noms de recettes en francais.',
        'Chaque recette doit etre DIFFERENTE en base (pas juste changement d ingredient mineur).',
        'Format JSON attendu:',
        '[{"name":"...","area":"France|Italie|Espagne|Portugal|Grece","time":20,"macros":{"cal":520,"carbs":70,"protein":25,"fat":14},"ingredients":[{"name":"...","qty":"..."}],"steps":"...","note":"..."}]',
        'Contraintes: 5 a 10 ingredients, etapes courtes, ingredients trouvables en supermarche FR.',
        'Pas de markdown.',
    ].join('\n');

    const rawText = llm.provider === 'claude'
        ? await callClaude(systemPrompt, userPrompt, apiKey)
        : await callGroq(systemPrompt, userPrompt, apiKey);

    const jsonText = extractJsonBlock(rawText);
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed)) throw new Error('Invalid LLM recipe payload');

    const recipes = parsed
        .map((item, idx) => sanitizeRecipe(item, { slot, weightKg, idx }))
        .filter(r => r.name && r.ingredients.length > 0);

    const filtered = normalizeDifficulty(difficulty)
        ? recipes.filter(r => estimateDifficulty(r) === difficulty)
        : recipes;

    if (!filtered.length) throw new Error('No valid recipes from LLM');

    const nextRecent = [...filtered.map(r => r.name), ...recentNames]
        .filter(Boolean)
        .slice(0, 30);
    saveRecentNames(slot, diet, nextRecent);

    return filtered.slice(0, count);
}

/**
 * Estimate recipe difficulty from ingredient count + instruction length.
 * Returns 'easy' | 'medium' | 'hard'
 */
export function estimateDifficulty(recipe) {
    const n = Array.isArray(recipe?.ingredients) ? recipe.ingredients.length : 0;
    const l = String(recipe?.steps || '').length;
    if (n <= 7 && l <= 280) return 'easy';
    if (n >= 13 || l >= 520) return 'hard';
    return 'medium';
}

/**
 * Fetch `count` diverse meals for a slot, with optional difficulty filter.
 * LLM-first with cached responses; local fallback if no LLM key or API failure.
 */
export async function fetchSlotMeals({ slot, diet, weightKg = 70, count = 4, difficulty = null }) {
    const safeDifficulty = normalizeDifficulty(difficulty);
    const cacheKey = `llm_slot_${slot}_${diet}_${Math.round(weightKg)}_${safeDifficulty || 'all'}_${count}`;
    const hit = cacheGet(cacheKey);
    if (hit?.length) return hit;

    try {
        const recipes = await generateRecipesLLM({ slot, diet, weightKg, count, difficulty: safeDifficulty });
        cacheSet(cacheKey, recipes);
        return recipes;
    } catch {
        const fallback = fallbackFromLocalRecipes({ slot, diet, weightKg, count, difficulty: safeDifficulty });
        if (fallback.length) {
            cacheSet(cacheKey, fallback);
            return fallback;
        }
        return [];
    }
}

/**
 * Prewarm LLM/provider configuration cache.
 */
export async function prewarmCache() {
    await getLlmConfig();
}

const WEEK_TEMPLATE = [
    { day: 'Lundi', load: 'easy', slots: ['breakfast', 'lunch', 'dinner'] },
    { day: 'Mardi', load: 'hard', slots: ['breakfast', 'pre', 'lunch', 'post', 'dinner'] },
    { day: 'Mercredi', load: 'rest', slots: ['breakfast', 'lunch', 'dinner'] },
    { day: 'Jeudi', load: 'moderate', slots: ['breakfast', 'lunch', 'post', 'dinner'] },
    { day: 'Vendredi', load: 'easy', slots: ['breakfast', 'lunch', 'dinner'] },
    { day: 'Samedi', load: 'long', slots: ['breakfast', 'pre', 'lunch', 'post', 'dinner'] },
    { day: 'Dimanche', load: 'rest', slots: ['breakfast', 'lunch', 'dinner'] },
];

/**
 * Generate a week plan and a grouped shopping list.
 * Uses one LLM batch per slot (not per day) to reduce token/cost usage.
 */
export async function buildWeekShoppingList({ diet, weightKg = 70, difficulty = null, onProgress }) {
    const slots = ['breakfast', 'pre', 'lunch', 'post', 'dinner'];
    const slotPools = new Map();

    for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const recipes = await fetchSlotMeals({ slot, diet, weightKg, count: 6, difficulty });
        slotPools.set(slot, recipes);
        if (onProgress) onProgress(Math.round(((i + 1) / slots.length) * 70));
    }

    const pickFor = (slot, dayIdx) => {
        const pool = slotPools.get(slot) || [];
        if (!pool.length) return null;
        return pool[dayIdx % pool.length] || null;
    };

    const weekPlan = WEEK_TEMPLATE.map((dayDef, dayIdx) => ({
        day: dayDef.day,
        load: dayDef.load,
        meals: Object.fromEntries(dayDef.slots.map(slot => [slot, pickFor(slot, dayIdx)])),
    }));

    const ingMap = new Map();
    for (const { day, meals } of weekPlan) {
        for (const [, recipe] of Object.entries(meals)) {
            if (!recipe) continue;
            for (const ing of recipe.ingredients || []) {
                const key = String(ing.name || '').toLowerCase().trim();
                if (!key) continue;
                if (!ingMap.has(key)) {
                    ingMap.set(key, {
                        name: ing.name,
                        measures: [],
                        recipes: [],
                        category: categoriseIngredient(ing.name),
                    });
                }
                const item = ingMap.get(key);
                if (ing.qty && String(ing.qty).trim()) item.measures.push(String(ing.qty).trim());
                item.recipes.push(`${day} (${recipe.name})`);
            }
        }
    }

    const grouped = new Map();
    for (const item of ingMap.values()) {
        if (!grouped.has(item.category)) grouped.set(item.category, []);
        grouped.get(item.category).push(item);
    }

    const catOrder = [...ING_CATS.map(c => c.label), 'Autres'];
    const shoppingList = catOrder
        .filter(cat => grouped.has(cat))
        .map(cat => ({
            category: cat,
            items: grouped.get(cat).sort((a, b) => a.name.localeCompare(b.name)),
        }));

    if (onProgress) onProgress(100);
    return { weekPlan, shoppingList };
}
