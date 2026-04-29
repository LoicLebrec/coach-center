// ── Nutrition recipe & calculation engine ────────────────────────────────────
//
// diet tags:  'omni' | 'vegetarian' | 'vegan'
// meal tags:  'breakfast' | 'lunch' | 'dinner' | 'pre' | 'post' | 'snack' | 'during'
// load tags:  'rest' | 'easy' | 'moderate' | 'hard' | 'long'
//
// macros are per serving (1 person), qty_base is for 70 kg athlete.
// Quantities are scaled linearly with weight & training load multiplier.

export const RECIPES = [

  // ─── PETIT-DÉJEUNER ────────────────────────────────────────────────────────

  {
    id: 'oatmeal-banana',
    name: 'Porridge banane-miel',
    diet: ['omni', 'vegetarian'],
    meal: ['breakfast'],
    load: ['easy', 'moderate', 'hard', 'long'],
    time: 10,
    macros: { cal: 520, carbs: 88, protein: 16, fat: 10 },
    ingredients: [
      { name: 'Flocons d\'avoine',   qty: 80,  unit: 'g' },
      { name: 'Lait demi-écrémé',    qty: 250, unit: 'ml' },
      { name: 'Banane',              qty: 1,   unit: 'pièce' },
      { name: 'Miel',                qty: 15,  unit: 'g' },
      { name: 'Amandes effilées',    qty: 15,  unit: 'g' },
    ],
    steps: 'Cuire les flocons dans le lait 4 min. Trancher la banane, ajouter le miel et les amandes.',
  },

  {
    id: 'oatmeal-banana-vegan',
    name: 'Porridge banane-sirop d\'érable',
    diet: ['vegan'],
    meal: ['breakfast'],
    load: ['easy', 'moderate', 'hard', 'long'],
    time: 10,
    macros: { cal: 510, carbs: 90, protein: 13, fat: 9 },
    ingredients: [
      { name: 'Flocons d\'avoine',   qty: 80,  unit: 'g' },
      { name: 'Lait d\'avoine',      qty: 300, unit: 'ml' },
      { name: 'Banane',              qty: 1,   unit: 'pièce' },
      { name: 'Sirop d\'érable',     qty: 15,  unit: 'g' },
      { name: 'Noix de cajou',       qty: 15,  unit: 'g' },
    ],
    steps: 'Cuire les flocons dans le lait d\'avoine 4 min. Ajouter banane, sirop et cajous.',
  },

  {
    id: 'eggs-toast',
    name: 'Œufs brouillés & pain complet',
    diet: ['omni', 'vegetarian'],
    meal: ['breakfast'],
    load: ['rest', 'easy'],
    time: 10,
    macros: { cal: 420, carbs: 38, protein: 28, fat: 16 },
    ingredients: [
      { name: 'Œufs',               qty: 3,   unit: 'pièces' },
      { name: 'Pain complet',        qty: 90,  unit: 'g' },
      { name: 'Fromage frais 0%',    qty: 50,  unit: 'g' },
      { name: 'Tomates cerises',     qty: 80,  unit: 'g' },
    ],
    steps: 'Brouiller les œufs à feu doux avec le fromage frais. Servir sur pain grillé avec tomates.',
  },

  {
    id: 'smoothie-bowl',
    name: 'Smoothie bowl fruits rouges',
    diet: ['vegan', 'vegetarian'],
    meal: ['breakfast'],
    load: ['rest', 'easy', 'moderate'],
    time: 8,
    macros: { cal: 460, carbs: 78, protein: 12, fat: 10 },
    ingredients: [
      { name: 'Fruits rouges surgelés', qty: 150, unit: 'g' },
      { name: 'Banane congelée',        qty: 80,  unit: 'g' },
      { name: 'Lait végétal',           qty: 100, unit: 'ml' },
      { name: 'Granola',                qty: 40,  unit: 'g' },
      { name: 'Graines de chia',        qty: 10,  unit: 'g' },
    ],
    steps: 'Mixer fruits et lait végétal. Verser dans un bol, garnir de granola et chia.',
  },

  {
    id: 'rice-cakes-jam',
    name: 'Galettes de riz & confiture',
    diet: ['omni', 'vegetarian', 'vegan'],
    meal: ['breakfast', 'pre'],
    load: ['moderate', 'hard', 'long'],
    time: 5,
    macros: { cal: 380, carbs: 78, protein: 5, fat: 2 },
    ingredients: [
      { name: 'Galettes de riz',     qty: 4,   unit: 'pièces' },
      { name: 'Confiture',           qty: 60,  unit: 'g' },
      { name: 'Jus d\'orange',       qty: 200, unit: 'ml' },
    ],
    steps: 'Tartiner les galettes de confiture. Accompagner d\'un grand verre de jus d\'orange.',
  },

  // ─── PRÉ-ENTRAÎNEMENT ──────────────────────────────────────────────────────

  {
    id: 'pre-pasta',
    name: 'Bol de pâtes pré-séance',
    diet: ['omni', 'vegetarian', 'vegan'],
    meal: ['pre'],
    load: ['moderate', 'hard', 'long'],
    time: 15,
    macros: { cal: 490, carbs: 95, protein: 14, fat: 5 },
    ingredients: [
      { name: 'Pâtes blanches',      qty: 100, unit: 'g (sec)' },
      { name: 'Sauce tomate',        qty: 100, unit: 'g' },
      { name: 'Parmesan',            qty: 15,  unit: 'g' },
      { name: 'Huile d\'olive',      qty: 5,   unit: 'ml' },
    ],
    steps: 'Cuire les pâtes al dente (10 min). Mélanger avec sauce tomate, huile et parmesan. Manger 2-3h avant l\'effort.',
  },

  {
    id: 'pre-banana-honey',
    name: 'Banane & pain de mie miel',
    diet: ['omni', 'vegetarian', 'vegan'],
    meal: ['pre'],
    load: ['easy', 'moderate', 'hard'],
    time: 3,
    macros: { cal: 310, carbs: 68, protein: 6, fat: 2 },
    ingredients: [
      { name: 'Banane mûre',         qty: 1,   unit: 'pièce' },
      { name: 'Pain de mie blanc',   qty: 60,  unit: 'g' },
      { name: 'Miel',                qty: 20,  unit: 'g' },
    ],
    steps: 'À consommer 45-60 min avant l\'entraînement. Facile à digérer et riche en glucides rapides.',
  },

  // ─── PENDANT (LONGUES SORTIES) ─────────────────────────────────────────────

  {
    id: 'during-rice-cakes',
    name: 'Rice cakes salés maison',
    diet: ['omni'],
    meal: ['during'],
    load: ['long'],
    time: 25,
    macros: { cal: 280, carbs: 55, protein: 8, fat: 4 },
    ingredients: [
      { name: 'Riz à sushi cuit',    qty: 200, unit: 'g' },
      { name: 'Bacon cuit',          qty: 30,  unit: 'g' },
      { name: 'Parmesan râpé',       qty: 20,  unit: 'g' },
      { name: 'Sel',                 qty: 1,   unit: 'pincée' },
    ],
    steps: 'Mélanger riz chaud + bacon + parmesan. Mouler dans film plastique en petits pavés. Laisser refroidir.',
    note: '~70-80g glucides/h, 1 rice cake toutes les 30-40 min',
  },

  {
    id: 'during-dates',
    name: 'Dattes & noix de cajou',
    diet: ['vegan', 'vegetarian', 'omni'],
    meal: ['during', 'snack'],
    load: ['long'],
    time: 2,
    macros: { cal: 260, carbs: 50, protein: 4, fat: 6 },
    ingredients: [
      { name: 'Dattes Medjool',      qty: 80,  unit: 'g' },
      { name: 'Noix de cajou',       qty: 20,  unit: 'g' },
    ],
    steps: 'Combiner dans un sachet. 1 datte toutes les 20-25 min sur le vélo.',
  },

  // ─── POST-ENTRAÎNEMENT ─────────────────────────────────────────────────────

  {
    id: 'post-chicken-rice',
    name: 'Riz, poulet & légumes rôtis',
    diet: ['omni'],
    meal: ['post', 'lunch', 'dinner'],
    load: ['moderate', 'hard', 'long'],
    time: 30,
    macros: { cal: 620, carbs: 75, protein: 48, fat: 12 },
    ingredients: [
      { name: 'Blanc de poulet',     qty: 180, unit: 'g' },
      { name: 'Riz basmati',         qty: 90,  unit: 'g (sec)' },
      { name: 'Courgette',           qty: 150, unit: 'g' },
      { name: 'Poivron rouge',       qty: 100, unit: 'g' },
      { name: 'Huile d\'olive',      qty: 15,  unit: 'ml' },
      { name: 'Sauce soja',          qty: 10,  unit: 'ml' },
    ],
    steps: 'Cuire le riz. Rôtir poulet et légumes 20 min à 200°C avec huile et sauce soja.',
  },

  {
    id: 'post-salmon',
    name: 'Saumon, quinoa & épinards',
    diet: ['omni'],
    meal: ['post', 'lunch', 'dinner'],
    load: ['moderate', 'hard', 'long'],
    time: 25,
    macros: { cal: 590, carbs: 55, protein: 45, fat: 20 },
    ingredients: [
      { name: 'Filet de saumon',     qty: 160, unit: 'g' },
      { name: 'Quinoa',              qty: 80,  unit: 'g (sec)' },
      { name: 'Épinards frais',      qty: 100, unit: 'g' },
      { name: 'Citron',              qty: 0.5, unit: 'pièce' },
      { name: 'Huile d\'olive',      qty: 10,  unit: 'ml' },
    ],
    steps: 'Cuire le quinoa 15 min. Poêler le saumon 3 min/côté. Faire tomber les épinards. Arroser de citron.',
  },

  {
    id: 'post-tofu-bowl',
    name: 'Buddha bowl tofu & riz complet',
    diet: ['vegan'],
    meal: ['post', 'lunch', 'dinner'],
    load: ['moderate', 'hard', 'long'],
    time: 25,
    macros: { cal: 580, carbs: 72, protein: 28, fat: 18 },
    ingredients: [
      { name: 'Tofu ferme',          qty: 180, unit: 'g' },
      { name: 'Riz complet',         qty: 90,  unit: 'g (sec)' },
      { name: 'Edamame',             qty: 80,  unit: 'g' },
      { name: 'Avocat',              qty: 60,  unit: 'g' },
      { name: 'Sauce tahini',        qty: 25,  unit: 'g' },
      { name: 'Graines de sésame',   qty: 10,  unit: 'g' },
    ],
    steps: 'Cuire le riz. Griller le tofu à la poêle avec sauce soja. Assembler avec edamame, avocat, tahini.',
  },

  {
    id: 'post-eggs-veggies',
    name: 'Omelette protéinée & salade',
    diet: ['vegetarian'],
    meal: ['post', 'lunch'],
    load: ['easy', 'moderate'],
    time: 15,
    macros: { cal: 450, carbs: 30, protein: 35, fat: 20 },
    ingredients: [
      { name: 'Œufs',               qty: 4,   unit: 'pièces' },
      { name: 'Fromage de chèvre',   qty: 50,  unit: 'g' },
      { name: 'Pain complet',        qty: 60,  unit: 'g' },
      { name: 'Salade mélangée',     qty: 80,  unit: 'g' },
      { name: 'Vinaigrette',         qty: 15,  unit: 'ml' },
    ],
    steps: 'Fouetter les œufs, cuire l\'omelette, garnir de chèvre. Servir avec pain et salade.',
  },

  {
    id: 'post-lentils',
    name: 'Lentilles corail, patate douce & coriandre',
    diet: ['vegan', 'vegetarian'],
    meal: ['post', 'dinner'],
    load: ['moderate', 'hard'],
    time: 30,
    macros: { cal: 540, carbs: 80, protein: 22, fat: 10 },
    ingredients: [
      { name: 'Lentilles corail',    qty: 100, unit: 'g (sec)' },
      { name: 'Patate douce',        qty: 200, unit: 'g' },
      { name: 'Lait de coco',        qty: 100, unit: 'ml' },
      { name: 'Cumin, curcuma',      qty: 2,   unit: 'c.à.c' },
      { name: 'Coriandre fraîche',   qty: 10,  unit: 'g' },
    ],
    steps: 'Cuire lentilles et patate douce dés 20 min avec épices. Ajouter lait de coco, mijoter 5 min. Garnir de coriandre.',
  },

  // ─── DÉJEUNER / DÎNER REPOS ────────────────────────────────────────────────

  {
    id: 'rest-salad',
    name: 'Salade niçoise légère',
    diet: ['omni'],
    meal: ['lunch', 'dinner'],
    load: ['rest', 'easy'],
    time: 15,
    macros: { cal: 410, carbs: 28, protein: 35, fat: 18 },
    ingredients: [
      { name: 'Thon en boîte',       qty: 130, unit: 'g' },
      { name: 'Œufs durs',           qty: 2,   unit: 'pièces' },
      { name: 'Haricots verts',      qty: 120, unit: 'g' },
      { name: 'Tomates',             qty: 150, unit: 'g' },
      { name: 'Olives noires',       qty: 30,  unit: 'g' },
      { name: 'Huile d\'olive',      qty: 15,  unit: 'ml' },
    ],
    steps: 'Cuire les haricots verts 5 min. Assembler tous les ingrédients. Assaisonner à l\'huile d\'olive.',
  },

  {
    id: 'rest-soup-vegan',
    name: 'Soupe miso, tofu & nouilles soba',
    diet: ['vegan', 'vegetarian'],
    meal: ['lunch', 'dinner'],
    load: ['rest', 'easy'],
    time: 15,
    macros: { cal: 360, carbs: 48, protein: 18, fat: 9 },
    ingredients: [
      { name: 'Pâte de miso',        qty: 30,  unit: 'g' },
      { name: 'Tofu soyeux',         qty: 120, unit: 'g' },
      { name: 'Nouilles soba',       qty: 70,  unit: 'g (sec)' },
      { name: 'Algue wakamé',        qty: 5,   unit: 'g (sec)' },
      { name: 'Ciboule',             qty: 20,  unit: 'g' },
    ],
    steps: 'Cuire les soba. Dissoudre le miso dans 600ml d\'eau chaude (ne pas bouillir). Ajouter tofu, wakamé, soba.',
  },

  {
    id: 'hard-pasta-bolognese',
    name: 'Pâtes bolognaise (veille de course)',
    diet: ['omni'],
    meal: ['dinner'],
    load: ['hard', 'long'],
    time: 35,
    macros: { cal: 780, carbs: 110, protein: 45, fat: 16 },
    ingredients: [
      { name: 'Pâtes complètes',     qty: 130, unit: 'g (sec)' },
      { name: 'Bœuf haché 5%',       qty: 150, unit: 'g' },
      { name: 'Sauce tomate',        qty: 200, unit: 'g' },
      { name: 'Oignon',              qty: 80,  unit: 'g' },
      { name: 'Parmesan',            qty: 20,  unit: 'g' },
      { name: 'Huile d\'olive',      qty: 10,  unit: 'ml' },
    ],
    steps: 'Faire revenir oignon + bœuf 8 min. Ajouter sauce tomate, mijoter 15 min. Cuire pâtes. Mélanger, parsemer de parmesan.',
  },

  {
    id: 'hard-pasta-vegan',
    name: 'Pâtes arrabiata aux pois chiches',
    diet: ['vegan', 'vegetarian'],
    meal: ['dinner'],
    load: ['hard', 'long'],
    time: 25,
    macros: { cal: 710, carbs: 112, protein: 26, fat: 12 },
    ingredients: [
      { name: 'Pâtes',               qty: 130, unit: 'g (sec)' },
      { name: 'Pois chiches cuits',   qty: 120, unit: 'g' },
      { name: 'Sauce tomate pimentée',qty: 200, unit: 'g' },
      { name: 'Huile d\'olive',       qty: 15,  unit: 'ml' },
      { name: 'Levure maltée',        qty: 15,  unit: 'g' },
    ],
    steps: 'Cuire pâtes. Faire revenir pois chiches dans huile 3 min, ajouter sauce. Mélanger, parsemer de levure.',
  },

  // ─── SNACKS ────────────────────────────────────────────────────────────────

  {
    id: 'snack-yogurt',
    name: 'Yaourt grec & fruits secs',
    diet: ['omni', 'vegetarian'],
    meal: ['snack'],
    load: ['rest', 'easy', 'moderate'],
    time: 2,
    macros: { cal: 280, carbs: 30, protein: 20, fat: 8 },
    ingredients: [
      { name: 'Yaourt grec 0%',      qty: 200, unit: 'g' },
      { name: 'Miel',                qty: 15,  unit: 'g' },
      { name: 'Noix mélangées',      qty: 20,  unit: 'g' },
    ],
    steps: 'Mélanger yaourt et miel. Garnir de noix.',
  },

  {
    id: 'snack-energy-balls',
    name: 'Energy balls avoine-cacao',
    diet: ['vegan', 'vegetarian', 'omni'],
    meal: ['snack', 'pre'],
    load: ['moderate', 'hard'],
    time: 15,
    macros: { cal: 240, carbs: 36, protein: 6, fat: 8 },
    ingredients: [
      { name: 'Flocons d\'avoine',   qty: 60,  unit: 'g' },
      { name: 'Beurre de cacahuète', qty: 40,  unit: 'g' },
      { name: 'Cacao en poudre',     qty: 10,  unit: 'g' },
      { name: 'Sirop d\'agave',      qty: 20,  unit: 'g' },
    ],
    steps: 'Mélanger tous les ingrédients. Former 6 boules. Réfrigérer 30 min. Se conserve 5 jours.',
  },
];

// ── Nutritional calculation ───────────────────────────────────────────────────

/**
 * Estimate today's caloric needs from athlete profile + training data.
 * Returns { cal, carbs, protein, fat, loadLevel, loadLabel }
 */
export function calcDailyNeeds(athlete, recentActivities = []) {
  const weight = athlete?.icu_weight || athlete?.weight || 70;
  const ftp    = athlete?.icu_ftp    || 200;

  // Base metabolic rate (simplified Mifflin)
  const bmr = weight * 24;

  // Find today's or yesterday's training session (local dates, not UTC)
  const today = new Date();
  const pad = n => String(n).padStart(2, '0');
  const localDate = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const todayStr = localDate(today);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const ystStr = localDate(yesterday);

  const todayActs = recentActivities.filter(a =>
    (a.start_date_local || '').slice(0,10) === todayStr ||
    (a.start_date_local || '').slice(0,10) === ystStr
  );

  // Sum TSS / duration of relevant sessions
  const totalTss      = todayActs.reduce((s, a) => s + (a.icu_training_load || 0), 0);
  const totalDuration = todayActs.reduce((s, a) => s + (a.moving_time || a.elapsed_time || 0), 0) / 3600;

  // Determine load level
  let loadLevel, loadLabel, extra = 0;
  if (totalTss === 0 && totalDuration < 0.3) {
    loadLevel = 'rest';    loadLabel = 'Repos';          extra = 0;
  } else if (totalTss <= 50 || totalDuration <= 1) {
    loadLevel = 'easy';    loadLabel = 'Facile';         extra = Math.round(totalDuration * 450);
  } else if (totalTss <= 100 || totalDuration <= 2) {
    loadLevel = 'moderate';loadLabel = 'Modéré';         extra = Math.round(totalDuration * 550);
  } else if (totalTss <= 170 || totalDuration <= 3.5) {
    loadLevel = 'hard';    loadLabel = 'Intense';        extra = Math.round(totalDuration * 650);
  } else {
    loadLevel = 'long';    loadLabel = 'Longue sortie';  extra = Math.round(totalDuration * 700);
  }

  const totalCal = Math.round(bmr + extra);

  // Macro ratios by load
  const ratios = {
    rest:     { carbs: 0.40, protein: 0.28, fat: 0.32 },
    easy:     { carbs: 0.50, protein: 0.25, fat: 0.25 },
    moderate: { carbs: 0.55, protein: 0.22, fat: 0.23 },
    hard:     { carbs: 0.60, protein: 0.20, fat: 0.20 },
    long:     { carbs: 0.65, protein: 0.17, fat: 0.18 },
  };

  const r = ratios[loadLevel];
  return {
    cal:      totalCal,
    carbs:    Math.round((totalCal * r.carbs)   / 4),
    protein:  Math.round((totalCal * r.protein) / 4),
    fat:      Math.round((totalCal * r.fat)     / 9),
    loadLevel,
    loadLabel,
    tss:        Math.round(totalTss),
    durationH:  Math.round(totalDuration * 10) / 10,
  };
}

/**
 * Scale recipe ingredient quantities for a given body weight.
 * Base quantities are calibrated for 70 kg.
 */
export function scaleRecipe(recipe, weightKg = 70) {
  const factor = weightKg / 70;
  return {
    ...recipe,
    ingredients: recipe.ingredients.map(ing => ({
      ...ing,
      qty: typeof ing.qty === 'number'
        ? Math.round(ing.qty * factor * 10) / 10
        : ing.qty,
    })),
    macros: {
      cal:     Math.round(recipe.macros.cal     * factor),
      carbs:   Math.round(recipe.macros.carbs   * factor),
      protein: Math.round(recipe.macros.protein * factor),
      fat:     Math.round(recipe.macros.fat     * factor),
    },
  };
}

/**
 * Build a day meal plan: pick best recipes for each slot.
 * Returns { breakfast, pre, during, post, lunch, dinner, snack }
 */
export function buildMealPlan(diet, loadLevel, weightKg = 70) {
  const dietKey = diet === 'omnivore' ? 'omni' : diet;

  const eligible = (mealTag) =>
    RECIPES
      .filter(r => r.diet.includes(dietKey) && r.meal.includes(mealTag) && r.load.includes(loadLevel))
      .map(r => scaleRecipe(r, weightKg));

  const pick = (arr, n = 1) => arr.slice(0, n);

  const showPre    = ['moderate', 'hard', 'long'].includes(loadLevel);
  const showDuring = ['long'].includes(loadLevel);
  const showPost   = ['moderate', 'hard', 'long'].includes(loadLevel);

  return {
    breakfast: pick(eligible('breakfast'), 1),
    pre:       showPre    ? pick(eligible('pre'),    1) : [],
    during:    showDuring ? pick(eligible('during'),  1) : [],
    post:      showPost   ? pick(eligible('post'),    1) : [],
    lunch:     pick(eligible('lunch'),   1),
    dinner:    pick(eligible('dinner'),  1),
    snack:     pick(eligible('snack'),   1),
  };
}
