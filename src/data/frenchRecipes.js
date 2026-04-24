/**
 * Base de données de recettes françaises de nutrition sportive.
 * Recettes inspirées Marmiton, adaptées à l'effort cycliste.
 * diet tags: 'omni' | 'vegetarian' | 'vegan'
 */

const shuffle = arr => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ── Recettes ──────────────────────────────────────────────────────────────────
// macros = pour 70 kg, 1 portion (seront scalés au poids réel)

const RECIPES = [

  /* ═══════════════ PETIT-DÉJEUNER ═══════════════ */
  {
    id: 'fr_pb01', name: "Porridge d'avoine aux fruits rouges",
    slots: ['breakfast'], diet: ['omni','vegetarian','vegan'],
    difficulty: 'easy', time: 10, area: 'Français',
    macros: { cal: 380, carbs: 58, protein: 12, fat: 9 },
    ingredients: [
      { name: "Flocons d'avoine",           qty: '80 g' },
      { name: 'Lait végétal (avoine)',       qty: '250 ml' },
      { name: 'Fruits rouges (fraises, myrtilles)', qty: '100 g' },
      { name: "Miel ou sirop d'agave",      qty: '1 c.s.' },
      { name: 'Graines de chia',            qty: '1 c.s.' },
    ],
    steps: "Verser les flocons d'avoine et le lait dans une petite casserole. Chauffer à feu moyen 5 min en remuant régulièrement jusqu'à consistance crémeuse. Verser dans un bol, déposer les fruits rouges, arroser de miel et parsemer de chia.",
  },
  {
    id: 'fr_pb02', name: "Œufs brouillés à l'avocat sur pain complet",
    slots: ['breakfast'], diet: ['omni','vegetarian'],
    difficulty: 'easy', time: 10, area: 'Français',
    macros: { cal: 420, carbs: 32, protein: 22, fat: 22 },
    ingredients: [
      { name: 'Œufs',              qty: '3' },
      { name: 'Avocat mûr',        qty: '½' },
      { name: 'Pain complet',      qty: '2 tranches' },
      { name: 'Beurre',            qty: '1 noisette' },
      { name: "Piment d'Espelette, sel, poivre", qty: '' },
    ],
    steps: "Faire griller le pain. Écraser l'avocat avec une pincée de sel. Battre les œufs et cuire à feu doux avec le beurre en remuant sans arrêt (3–4 min) pour obtenir des œufs crémeux. Tartiner le pain d'avocat, déposer les œufs brouillés, assaisonner.",
  },
  {
    id: 'fr_pb03', name: 'Pancakes protéinés au fromage blanc',
    slots: ['breakfast'], diet: ['omni','vegetarian'],
    difficulty: 'medium', time: 20, area: 'Français',
    macros: { cal: 440, carbs: 52, protein: 28, fat: 10 },
    ingredients: [
      { name: 'Fromage blanc 0 %',     qty: '200 g' },
      { name: "Flocons d'avoine mixés",qty: '80 g' },
      { name: 'Œufs',                 qty: '2' },
      { name: 'Levure chimique',       qty: '1 c.c.' },
      { name: 'Banane mûre',          qty: '1' },
      { name: 'Huile de coco',        qty: '1 c.c.' },
    ],
    steps: "Écraser la banane. Mélanger fromage blanc, œufs, banane, flocons mixés et levure. Laisser reposer 5 min. Cuire dans une poêle légèrement huilée : 2–3 min par face à feu moyen-doux (2 c.s. de pâte par pancake). Servir avec fruits frais.",
  },
  {
    id: 'fr_pb04', name: "Tartines beurre d'amande et banane",
    slots: ['breakfast'], diet: ['omni','vegetarian','vegan'],
    difficulty: 'easy', time: 5, area: 'Français',
    macros: { cal: 390, carbs: 54, protein: 10, fat: 14 },
    ingredients: [
      { name: 'Pain complet au levain', qty: '2 tranches' },
      { name: "Beurre d'amande",       qty: '2 c.s.' },
      { name: 'Banane',               qty: '1' },
      { name: "Sirop d'érable",       qty: '1 c.c.' },
      { name: 'Cannelle',             qty: '1 pincée' },
    ],
    steps: "Griller le pain. Tartiner de beurre d'amande. Couper la banane en rondelles et déposer sur les tartines. Arroser de sirop d'érable, saupoudrer de cannelle.",
  },
  {
    id: 'fr_pb05', name: "Müesli aux fruits secs et lait d'amande",
    slots: ['breakfast'], diet: ['omni','vegetarian','vegan'],
    difficulty: 'easy', time: 5, area: 'Français',
    macros: { cal: 360, carbs: 50, protein: 10, fat: 13 },
    ingredients: [
      { name: "Flocons d'avoine",     qty: '60 g' },
      { name: 'Raisins secs et cranberries', qty: '30 g' },
      { name: 'Amandes et noix concassées',  qty: '20 g' },
      { name: 'Graines de courge',   qty: '1 c.s.' },
      { name: "Lait d'amande froid", qty: '200 ml' },
      { name: 'Pomme râpée',         qty: '½' },
    ],
    steps: "Mélanger flocons, fruits secs, noix et graines dans un bol. Verser le lait froid. Râper la demi-pomme par-dessus. Laisser tremper 5 min ou préparer la veille (overnight).",
  },
  {
    id: 'fr_pb06', name: 'Omelette aux champignons et fines herbes',
    slots: ['breakfast'], diet: ['omni','vegetarian'],
    difficulty: 'easy', time: 12, area: 'Français',
    macros: { cal: 290, carbs: 5, protein: 22, fat: 20 },
    ingredients: [
      { name: 'Œufs',               qty: '3' },
      { name: 'Champignons de Paris', qty: '100 g' },
      { name: 'Ciboulette',         qty: '1 c.s.' },
      { name: 'Persil haché',       qty: '1 c.s.' },
      { name: 'Beurre',             qty: '1 noisette' },
    ],
    steps: "Émincer les champignons, les poêler à feu vif 3–4 min. Battre les œufs avec sel, poivre et herbes. Verser dans la poêle avec champignons. Cuire à feu moyen en soulevant les bords, puis plier en deux.",
  },

  /* ═══════════════ PRÉ-ENTRAÎNEMENT ═══════════════ */
  {
    id: 'fr_pre01', name: "Smoothie banane-avoine-miel",
    slots: ['pre'], diet: ['omni','vegetarian','vegan'],
    difficulty: 'easy', time: 5, area: 'Français',
    macros: { cal: 340, carbs: 68, protein: 8, fat: 4 },
    ingredients: [
      { name: 'Banane mûre',             qty: '1 grande' },
      { name: "Flocons d'avoine",        qty: '40 g' },
      { name: "Lait végétal ou demi-écrémé", qty: '250 ml' },
      { name: 'Miel',                    qty: '1 c.s.' },
    ],
    steps: "Mettre tous les ingrédients dans un blender. Mixer 30 sec. Consommer 60–90 min avant la séance pour un apport glucidique progressif.",
  },
  {
    id: 'fr_pre02', name: 'Riz blanc et jambon fumé',
    slots: ['pre'], diet: ['omni'],
    difficulty: 'easy', time: 15, area: 'Français',
    macros: { cal: 380, carbs: 72, protein: 18, fat: 4 },
    ingredients: [
      { name: 'Riz blanc',    qty: '120 g cru' },
      { name: 'Jambon fumé',  qty: '60 g' },
      { name: 'Sauce soja légère', qty: '1 c.s.' },
    ],
    steps: "Cuire le riz 12 min à l'eau salée. Égoutter, assaisonner de sauce soja. Couper le jambon en lamelles, mélanger au riz. Consommer 90 min avant l'effort.",
  },
  {
    id: 'fr_pre03', name: "Energy balls dattes-avoine-amandes",
    slots: ['pre','snack'], diet: ['omni','vegetarian','vegan'],
    difficulty: 'easy', time: 15, area: 'Français',
    macros: { cal: 300, carbs: 50, protein: 8, fat: 9 },
    ingredients: [
      { name: 'Dattes Medjool dénoyautées', qty: '150 g' },
      { name: "Flocons d'avoine",          qty: '80 g' },
      { name: 'Amandes',                   qty: '40 g' },
      { name: 'Cacao en poudre',           qty: '1 c.s.' },
      { name: 'Sel',                       qty: '1 pincée' },
    ],
    steps: "Mixer les dattes jusqu'à obtenir une pâte. Ajouter amandes, flocons, cacao et sel. Mixer par impulsions. Former des boules (taille golf). Réfrigérer 30 min. Se conserve 1 semaine au frigo.",
  },
  {
    id: 'fr_pre04', name: 'Pain complet confiture-beurre',
    slots: ['pre'], diet: ['omni','vegetarian'],
    difficulty: 'easy', time: 5, area: 'Français',
    macros: { cal: 260, carbs: 48, protein: 7, fat: 5 },
    ingredients: [
      { name: 'Pain complet',     qty: '2 tranches' },
      { name: 'Beurre doux',     qty: '10 g' },
      { name: 'Confiture',       qty: '2 c.s.' },
    ],
    steps: "Griller légèrement le pain. Beurrer et tartiner de confiture. Option : ajouter une banane en rondelles. Idéal 1h avant une séance modérée.",
  },
  {
    id: 'fr_pre05', name: "Riz au lait d'avoine avant sortie",
    slots: ['pre'], diet: ['omni','vegetarian','vegan'],
    difficulty: 'easy', time: 20, area: 'Français',
    macros: { cal: 350, carbs: 65, protein: 7, fat: 6 },
    ingredients: [
      { name: 'Riz blanc rond',         qty: '80 g cru' },
      { name: "Lait végétal d'avoine",  qty: '300 ml' },
      { name: 'Sucre',                  qty: '1 c.s.' },
      { name: 'Cannelle',               qty: '1 pincée' },
      { name: 'Vanille',                qty: '½ c.c.' },
    ],
    steps: "Porter le lait à frémissement, ajouter le riz et le sucre. Cuire à feu doux 18–20 min en remuant souvent. Hors du feu, ajouter vanille et cannelle. Peut se manger tiède ou froid.",
  },

  /* ═══════════════ RÉCUPÉRATION (POST) ═══════════════ */
  {
    id: 'fr_po01', name: "Blanc de poulet grillé aux herbes, quinoa",
    slots: ['post'], diet: ['omni'],
    difficulty: 'medium', time: 25, area: 'Français',
    macros: { cal: 490, carbs: 40, protein: 48, fat: 10 },
    ingredients: [
      { name: 'Blanc de poulet',     qty: '180 g' },
      { name: 'Quinoa',             qty: '80 g cru' },
      { name: 'Herbes de Provence', qty: '1 c.c.' },
      { name: "Huile d'olive",       qty: '1 c.s.' },
      { name: 'Citron',             qty: '½' },
      { name: 'Ail',               qty: '1 gousse' },
    ],
    steps: "Cuire le quinoa 15 min à l'eau salée. Badigeonner le poulet d'huile, ail écrasé et herbes. Griller 6–7 min par face. Laisser reposer 3 min avant de trancher. Servir sur le quinoa avec un filet de citron.",
  },
  {
    id: 'fr_po02', name: 'Skyr aux fruits, granola et miel',
    slots: ['post','breakfast','snack'], diet: ['omni','vegetarian'],
    difficulty: 'easy', time: 5, area: 'Français',
    macros: { cal: 340, carbs: 48, protein: 24, fat: 6 },
    ingredients: [
      { name: 'Skyr nature',      qty: '200 g' },
      { name: 'Granola nature',   qty: '40 g' },
      { name: 'Banane ou mangue', qty: '1' },
      { name: 'Miel',            qty: '1 c.s.' },
      { name: 'Fruits rouges',   qty: '50 g' },
    ],
    steps: "Verser le skyr dans un bol. Couper les fruits et déposer dessus. Parsemer de granola et arroser de miel. À consommer dans les 30 min après l'effort.",
  },
  {
    id: 'fr_po03', name: 'Omelette jambon-fromage et salade verte',
    slots: ['post'], diet: ['omni'],
    difficulty: 'easy', time: 12, area: 'Français',
    macros: { cal: 390, carbs: 6, protein: 36, fat: 24 },
    ingredients: [
      { name: 'Œufs',            qty: '3' },
      { name: 'Jambon blanc',    qty: '60 g' },
      { name: 'Emmental râpé',  qty: '30 g' },
      { name: 'Beurre',         qty: '1 noisette' },
      { name: 'Salade verte',   qty: '1 poignée' },
    ],
    steps: "Battre les œufs avec sel et poivre. Faire chauffer la poêle avec le beurre. Verser les œufs. Quand les bords prennent, ajouter jambon en dés et emmental. Plier en deux. Cuire 1 min de plus. Servir avec la salade assaisonnée.",
  },
  {
    id: 'fr_po04', name: 'Smoothie récupération cacao-banane',
    slots: ['post'], diet: ['omni','vegetarian'],
    difficulty: 'easy', time: 5, area: 'Français',
    macros: { cal: 360, carbs: 54, protein: 20, fat: 6 },
    ingredients: [
      { name: 'Lait demi-écrémé',        qty: '300 ml' },
      { name: 'Banane mûre',            qty: '1' },
      { name: 'Cacao en poudre non sucré', qty: '1 c.s.' },
      { name: 'Fromage blanc',          qty: '100 g' },
      { name: 'Miel',                   qty: '1 c.c.' },
    ],
    steps: "Mettre tous les ingrédients dans un blender. Mixer 30 sec. Consommer idéalement dans les 20–30 min après l'entraînement.",
  },
  {
    id: 'fr_po05', name: 'Saumon grillé et patate douce rôtie',
    slots: ['post','dinner'], diet: ['omni'],
    difficulty: 'medium', time: 30, area: 'Français',
    macros: { cal: 480, carbs: 40, protein: 38, fat: 16 },
    ingredients: [
      { name: 'Pavé de saumon',  qty: '160 g' },
      { name: 'Patate douce',   qty: '200 g' },
      { name: "Huile d'olive",   qty: '1 c.s.' },
      { name: 'Paprika fumé',   qty: '1 c.c.' },
      { name: 'Citron',         qty: '½' },
      { name: 'Ciboulette',     qty: '1 c.s.' },
    ],
    steps: "Préchauffer le four à 200 °C. Couper la patate douce en cubes, mélanger avec ½ c.s. d'huile et le paprika, rôtir 25 min. Assaisonner le saumon avec sel, poivre et citron. Cuire 4 min par face à la poêle. Servir avec les patates, parsemer de ciboulette.",
  },
  {
    id: 'fr_po06', name: 'Bowl récup quinoa-edamame-avocat',
    slots: ['post'], diet: ['omni','vegetarian','vegan'],
    difficulty: 'easy', time: 20, area: 'Français',
    macros: { cal: 450, carbs: 44, protein: 22, fat: 18 },
    ingredients: [
      { name: 'Quinoa cuit',    qty: '150 g' },
      { name: 'Edamame cuits',  qty: '100 g' },
      { name: 'Avocat',        qty: '½' },
      { name: 'Concombre',     qty: '½' },
      { name: 'Sauce soja',    qty: '1 c.s.' },
      { name: 'Huile de sésame', qty: '1 c.c.' },
      { name: 'Graines de sésame', qty: '1 c.s.' },
    ],
    steps: "Disposer le quinoa dans un bol. Ajouter les edamames, l'avocat en tranches et le concombre en dés. Arroser de sauce soja et d'huile de sésame. Parsemer de sésame.",
  },

  /* ═══════════════ DÉJEUNER ═══════════════ */
  {
    id: 'fr_dej01', name: 'Salade niçoise',
    slots: ['lunch'], diet: ['omni'],
    difficulty: 'medium', time: 20, area: 'Français',
    macros: { cal: 460, carbs: 28, protein: 34, fat: 24 },
    ingredients: [
      { name: 'Thon en boîte au naturel', qty: '150 g' },
      { name: 'Haricots verts cuits',     qty: '100 g' },
      { name: 'Pommes de terre cuites',   qty: '150 g' },
      { name: 'Tomates cerises',          qty: '100 g' },
      { name: 'Œufs durs',               qty: '2' },
      { name: 'Olives noires',            qty: '30 g' },
      { name: "Huile d'olive",            qty: '2 c.s.' },
      { name: 'Vinaigre balsamique',      qty: '1 c.s.' },
    ],
    steps: "Cuire les œufs durs 10 min. Couper les pommes de terre en dés, les tomates en deux. Égoutter le thon. Assembler tous les ingrédients dans un grand saladier. Assaisonner à l'huile d'olive et au vinaigre.",
  },
  {
    id: 'fr_dej02', name: 'Poulet rôti aux herbes de Provence et légumes',
    slots: ['lunch','dinner'], diet: ['omni'],
    difficulty: 'medium', time: 50, area: 'Français',
    macros: { cal: 480, carbs: 18, protein: 46, fat: 22 },
    ingredients: [
      { name: 'Cuisses de poulet',   qty: '2 (≈ 400 g)' },
      { name: 'Courgette',           qty: '1' },
      { name: 'Poivrons',            qty: '1' },
      { name: 'Oignon rouge',        qty: '1' },
      { name: 'Herbes de Provence',  qty: '2 c.s.' },
      { name: "Huile d'olive",       qty: '2 c.s.' },
      { name: 'Ail',                qty: '3 gousses' },
    ],
    steps: "Préchauffer le four à 200 °C. Couper les légumes en gros morceaux. Déposer le poulet et les légumes dans un plat, arroser d'huile, parsemer d'herbes et d'ail. Saler, poivrer. Enfourner 40 min en retournant à mi-cuisson.",
  },
  {
    id: 'fr_dej03', name: 'Quiche poireaux et fromage de chèvre',
    slots: ['lunch'], diet: ['omni','vegetarian'],
    difficulty: 'medium', time: 50, area: 'Français',
    macros: { cal: 520, carbs: 36, protein: 22, fat: 30 },
    ingredients: [
      { name: 'Pâte brisée',           qty: '200 g' },
      { name: 'Poireaux',              qty: '3' },
      { name: 'Fromage de chèvre frais', qty: '120 g' },
      { name: 'Œufs',                 qty: '3' },
      { name: 'Crème fraîche légère', qty: '150 ml' },
      { name: 'Beurre',               qty: '20 g' },
      { name: 'Noix de muscade',      qty: '1 pincée' },
    ],
    steps: "Préchauffer le four à 180 °C. Foncer un moule avec la pâte. Émincer les poireaux, les faire revenir au beurre 10 min. Battre œufs + crème + sel + poivre + muscade. Répartir les poireaux dans la tarte, émietter le chèvre, verser l'appareil. Cuire 35 min.",
  },
  {
    id: 'fr_dej04', name: 'Taboulé au boulgour et herbes fraîches',
    slots: ['lunch'], diet: ['omni','vegetarian','vegan'],
    difficulty: 'easy', time: 20, area: 'Français',
    macros: { cal: 360, carbs: 52, protein: 10, fat: 13 },
    ingredients: [
      { name: 'Boulgour fin',         qty: '80 g cru' },
      { name: 'Tomates',              qty: '2' },
      { name: 'Concombre',           qty: '½' },
      { name: 'Persil plat frais',   qty: '1 bouquet' },
      { name: 'Menthe fraîche',      qty: '1 c.s.' },
      { name: 'Jus de citron',       qty: '2 c.s.' },
      { name: "Huile d'olive",       qty: '2 c.s.' },
    ],
    steps: "Faire gonfler le boulgour dans 2× son volume d'eau bouillante, 10 min. Égoutter, laisser refroidir. Couper tomates et concombre en petits dés. Hacher finement persil et menthe. Mélanger le tout, assaisonner citron + huile + sel + poivre. Réfrigérer 15 min.",
  },
  {
    id: 'fr_dej05', name: 'Soupe minestrone et pain complet',
    slots: ['lunch','dinner'], diet: ['omni','vegetarian','vegan'],
    difficulty: 'easy', time: 30, area: 'Français',
    macros: { cal: 340, carbs: 52, protein: 14, fat: 7 },
    ingredients: [
      { name: 'Courgette',              qty: '1' },
      { name: 'Carottes',              qty: '2' },
      { name: 'Haricots blancs (boîte)', qty: '200 g' },
      { name: 'Petites pâtes (ditalini)', qty: '60 g' },
      { name: 'Coulis de tomates',     qty: '200 ml' },
      { name: 'Bouillon de légumes',   qty: '1 L' },
      { name: "Huile d'olive",         qty: '1 c.s.' },
      { name: 'Pain complet',          qty: '2 tranches' },
    ],
    steps: "Faire revenir oignon + carotte + céleri dans l'huile 5 min. Ajouter coulis et bouillon. À ébullition, ajouter courgette en dés et pâtes. Cuire 10 min. Ajouter les haricots, ajuster l'assaisonnement. Servir avec le pain complet.",
  },
  {
    id: 'fr_dej06', name: 'Salade de lentilles aux légumes grillés',
    slots: ['lunch'], diet: ['omni','vegetarian','vegan'],
    difficulty: 'easy', time: 30, area: 'Français',
    macros: { cal: 380, carbs: 52, protein: 18, fat: 10 },
    ingredients: [
      { name: 'Lentilles vertes du Puy', qty: '120 g cru' },
      { name: 'Poivrons',               qty: '2' },
      { name: 'Courgette',              qty: '1' },
      { name: 'Oignon rouge',           qty: '1' },
      { name: "Huile d'olive",          qty: '2 c.s.' },
      { name: 'Vinaigre de xérès',      qty: '1 c.s.' },
      { name: 'Moutarde de Dijon',      qty: '1 c.c.' },
    ],
    steps: "Cuire les lentilles 20 min à l'eau non salée. Couper les légumes en dés, griller à 220 °C ou à la poêle 15 min. Préparer la vinaigrette. Égoutter les lentilles, mélanger avec légumes et vinaigrette.",
  },
  {
    id: 'fr_dej07', name: 'Gratin de pâtes aux légumes du soleil',
    slots: ['lunch'], diet: ['omni','vegetarian'],
    difficulty: 'medium', time: 40, area: 'Français',
    macros: { cal: 560, carbs: 72, protein: 20, fat: 18 },
    ingredients: [
      { name: 'Pâtes penne',       qty: '120 g cru' },
      { name: 'Aubergine',        qty: '1' },
      { name: 'Tomates',          qty: '3' },
      { name: 'Courgette',        qty: '1' },
      { name: 'Mozzarella',       qty: '100 g' },
      { name: 'Coulis de tomates', qty: '150 ml' },
      { name: "Huile d'olive",    qty: '2 c.s.' },
      { name: 'Basilic frais',    qty: '1 c.s.' },
    ],
    steps: "Cuire les pâtes al dente. Faire revenir les légumes en dés à la poêle. Mélanger pâtes + légumes + coulis dans un plat à gratin. Déposer la mozzarella en tranches. Gratiner à 200 °C pendant 15 min. Parsemer de basilic.",
  },
  {
    id: 'fr_dej08', name: 'Tartine nordique saumon fumé et avocat',
    slots: ['lunch'], diet: ['omni'],
    difficulty: 'easy', time: 10, area: 'Français',
    macros: { cal: 420, carbs: 30, protein: 26, fat: 22 },
    ingredients: [
      { name: 'Pain de seigle',      qty: '2 tranches' },
      { name: 'Saumon fumé',        qty: '80 g' },
      { name: 'Avocat',             qty: '1' },
      { name: 'Fromage frais',      qty: '30 g' },
      { name: 'Aneth frais',        qty: '1 c.s.' },
      { name: 'Câpres',             qty: '1 c.s.' },
      { name: 'Citron',             qty: '¼' },
    ],
    steps: "Tartiner le pain de fromage frais. Écraser l'avocat avec un filet de citron, du sel et du poivre. Déposer sur le pain. Ajouter le saumon fumé, les câpres et l'aneth.",
  },

  /* ═══════════════ DÎNER ═══════════════ */
  {
    id: 'fr_din01', name: 'Ratatouille provençale et riz complet',
    slots: ['dinner'], diet: ['omni','vegetarian','vegan'],
    difficulty: 'medium', time: 45, area: 'Français',
    macros: { cal: 360, carbs: 52, protein: 10, fat: 13 },
    ingredients: [
      { name: 'Aubergine',           qty: '1' },
      { name: 'Courgettes',          qty: '2' },
      { name: 'Poivrons (rouge et jaune)', qty: '2' },
      { name: 'Tomates mûres',       qty: '4' },
      { name: 'Oignon',              qty: '1' },
      { name: 'Ail',                qty: '3 gousses' },
      { name: "Huile d'olive",       qty: '3 c.s.' },
      { name: 'Herbes de Provence',  qty: '2 c.c.' },
      { name: 'Riz complet',         qty: '80 g cru' },
    ],
    steps: "Cuire le riz complet 30 min. Couper tous les légumes en dés. Faire revenir oignon + ail dans l'huile 5 min. Ajouter poivrons + aubergine 10 min. Ajouter courgettes + tomates, sel, poivre, herbes. Mijoter 25 min à couvert, puis 5 min découvert. Servir sur le riz.",
  },
  {
    id: 'fr_din02', name: 'Saumon en papillote citron-fenouil',
    slots: ['dinner'], diet: ['omni'],
    difficulty: 'easy', time: 25, area: 'Français',
    macros: { cal: 430, carbs: 10, protein: 42, fat: 24 },
    ingredients: [
      { name: 'Pavé de saumon', qty: '160 g' },
      { name: 'Fenouil',       qty: '½ bulbe' },
      { name: 'Citron',        qty: '1' },
      { name: "Huile d'olive", qty: '1 c.s.' },
      { name: 'Aneth frais',   qty: '1 c.s.' },
    ],
    steps: "Préchauffer le four à 200 °C. Émincer le fenouil. Le déposer sur une grande feuille d'alu, poser le saumon par-dessus, arroser d'huile et jus de citron, ajouter rondelles de citron et aneth. Fermer la papillote hermétiquement. Cuire 18–20 min.",
  },
  {
    id: 'fr_din03', name: 'Soupe de lentilles corail au curry',
    slots: ['dinner'], diet: ['omni','vegetarian','vegan'],
    difficulty: 'easy', time: 25, area: 'Français',
    macros: { cal: 340, carbs: 48, protein: 18, fat: 8 },
    ingredients: [
      { name: 'Lentilles corail',       qty: '150 g' },
      { name: 'Lait de coco léger',     qty: '200 ml' },
      { name: 'Bouillon de légumes',    qty: '600 ml' },
      { name: 'Curry en poudre',        qty: '2 c.c.' },
      { name: 'Oignon',                qty: '1' },
      { name: 'Gingembre frais',       qty: '1 cm' },
      { name: "Huile de coco",         qty: '1 c.s.' },
    ],
    steps: "Faire revenir oignon émincé dans l'huile 5 min. Ajouter gingembre râpé + curry, cuire 1 min. Ajouter lentilles + bouillon + lait de coco. Porter à ébullition, mijoter 20 min. Mixer partiellement pour une texture veloutée.",
  },
  {
    id: 'fr_din04', name: 'Wok de légumes et tofu mariné',
    slots: ['dinner'], diet: ['omni','vegetarian','vegan'],
    difficulty: 'medium', time: 25, area: 'Français',
    macros: { cal: 340, carbs: 32, protein: 20, fat: 14 },
    ingredients: [
      { name: 'Tofu ferme',      qty: '200 g' },
      { name: 'Brocoli',        qty: '200 g' },
      { name: 'Carottes',      qty: '2' },
      { name: 'Poivron rouge',  qty: '1' },
      { name: 'Sauce soja',    qty: '3 c.s.' },
      { name: 'Huile de sésame', qty: '1 c.s.' },
      { name: 'Ail',           qty: '2 gousses' },
      { name: 'Gingembre',     qty: '1 cm' },
      { name: 'Graines de sésame', qty: '1 c.s.' },
    ],
    steps: "Couper le tofu en dés, faire mariner 15 min dans 2 c.s. de sauce soja. Dorer le tofu dans l'huile de sésame 5–6 min, réserver. Faire sauter les légumes en julienne avec ail + gingembre 5–7 min à feu vif. Ajouter le tofu et la sauce soja restante. Parsemer de sésame.",
  },
  {
    id: 'fr_din05', name: 'Pâtes complètes pesto épinards-parmesan',
    slots: ['dinner','lunch'], diet: ['omni','vegetarian'],
    difficulty: 'easy', time: 20, area: 'Français',
    macros: { cal: 510, carbs: 72, protein: 18, fat: 18 },
    ingredients: [
      { name: 'Pâtes complètes',    qty: '120 g cru' },
      { name: 'Épinards frais',     qty: '100 g' },
      { name: 'Pesto basilic',      qty: '2 c.s.' },
      { name: 'Parmesan râpé',      qty: '25 g' },
      { name: 'Pignons de pin',     qty: '15 g' },
      { name: "Huile d'olive",      qty: '1 c.s.' },
    ],
    steps: "Cuire les pâtes al dente. Faire tomber les épinards dans l'huile 2–3 min. Égoutter les pâtes en réservant un peu d'eau de cuisson. Mélanger pâtes + pesto + épinards + un peu d'eau de cuisson. Servir avec parmesan et pignons.",
  },
  {
    id: 'fr_din06', name: 'Curry de pois chiches aux épinards',
    slots: ['dinner'], diet: ['omni','vegetarian','vegan'],
    difficulty: 'medium', time: 30, area: 'Français',
    macros: { cal: 420, carbs: 56, protein: 18, fat: 14 },
    ingredients: [
      { name: 'Pois chiches (boîte)',  qty: '400 g' },
      { name: 'Épinards frais',       qty: '150 g' },
      { name: 'Lait de coco',         qty: '200 ml' },
      { name: 'Tomates concassées',   qty: '200 ml' },
      { name: 'Oignon',               qty: '1' },
      { name: 'Ail',                 qty: '3 gousses' },
      { name: 'Curry, cumin, curcuma', qty: '1 c.c. chacun' },
    ],
    steps: "Faire revenir oignon + ail 5 min. Ajouter les épices, cuire 1 min. Ajouter tomates + lait de coco + pois chiches égouttés. Mijoter 20 min. Ajouter les épinards en fin de cuisson, laisser fondre 3 min. Servir avec du riz basmati.",
  },
  {
    id: 'fr_din07', name: 'Cabillaud aux légumes provençaux en cocotte',
    slots: ['dinner'], diet: ['omni'],
    difficulty: 'medium', time: 30, area: 'Français',
    macros: { cal: 380, carbs: 18, protein: 44, fat: 14 },
    ingredients: [
      { name: 'Filets de cabillaud', qty: '2 (≈ 300 g)' },
      { name: 'Tomates cerises',    qty: '200 g' },
      { name: 'Courgette',         qty: '1' },
      { name: 'Olives noires',     qty: '30 g' },
      { name: 'Câpres',            qty: '1 c.s.' },
      { name: "Huile d'olive",     qty: '2 c.s.' },
      { name: 'Herbes de Provence', qty: '1 c.c.' },
      { name: 'Citron',            qty: '½' },
    ],
    steps: "Faire revenir la courgette en rondelles dans l'huile 5 min. Ajouter tomates cerises + olives + câpres, cuire 5 min. Déposer le cabillaud sur les légumes. Arroser de citron, parsemer d'herbes. Couvrir, cuire à feu doux 10–12 min.",
  },
  {
    id: 'fr_din08', name: 'Blanquette de volaille légère',
    slots: ['dinner'], diet: ['omni'],
    difficulty: 'hard', time: 55, area: 'Français',
    macros: { cal: 520, carbs: 28, protein: 42, fat: 24 },
    ingredients: [
      { name: 'Blancs de poulet',     qty: '400 g' },
      { name: 'Carottes',            qty: '2' },
      { name: 'Champignons de Paris', qty: '150 g' },
      { name: 'Poireau',             qty: '1' },
      { name: 'Crème fraîche légère', qty: '100 ml' },
      { name: 'Bouillon de volaille', qty: '500 ml' },
      { name: 'Farine',              qty: '20 g' },
      { name: 'Beurre',              qty: '20 g' },
      { name: 'Jus de citron',       qty: '1 c.s.' },
    ],
    steps: "Porter le bouillon à ébullition, y plonger le poulet + carottes + poireau 30 min. Faire un roux beurre-farine, mouiller avec le bouillon filtré, ajouter champignons émincés, cuire 10 min. Incorporer crème + citron. Ajouter le poulet et légumes. Servir avec du riz.",
  },

  /* ═══════════════ COLLATION ═══════════════ */
  {
    id: 'fr_sn01', name: 'Yaourt grec, miel et noix',
    slots: ['snack'], diet: ['omni','vegetarian'],
    difficulty: 'easy', time: 3, area: 'Français',
    macros: { cal: 240, carbs: 22, protein: 15, fat: 10 },
    ingredients: [
      { name: 'Yaourt grec 0 %', qty: '150 g' },
      { name: 'Miel',           qty: '1 c.s.' },
      { name: 'Noix mélangées', qty: '20 g' },
      { name: 'Cannelle',       qty: '1 pincée' },
    ],
    steps: "Verser le yaourt dans un bol. Arroser de miel, ajouter les noix et saupoudrer de cannelle.",
  },
  {
    id: 'fr_sn02', name: 'Compote maison et amandes',
    slots: ['snack'], diet: ['omni','vegetarian','vegan'],
    difficulty: 'easy', time: 15, area: 'Français',
    macros: { cal: 180, carbs: 32, protein: 4, fat: 5 },
    ingredients: [
      { name: 'Pommes',         qty: '2' },
      { name: 'Poire',         qty: '1' },
      { name: 'Cannelle',      qty: '1 c.c.' },
      { name: 'Amandes effilées', qty: '15 g' },
    ],
    steps: "Éplucher et couper les fruits en morceaux. Cuire avec 2 c.s. d'eau et la cannelle à feu moyen 12 min. Écraser grossièrement à la fourchette. Laisser refroidir. Servir avec les amandes effilées.",
  },
  {
    id: 'fr_sn03', name: 'Tartines seigle, chèvre et tomates séchées',
    slots: ['snack'], diet: ['omni','vegetarian'],
    difficulty: 'easy', time: 5, area: 'Français',
    macros: { cal: 230, carbs: 22, protein: 11, fat: 10 },
    ingredients: [
      { name: 'Pain de seigle',        qty: '2 tranches' },
      { name: 'Fromage de chèvre frais', qty: '60 g' },
      { name: 'Tomates séchées',       qty: '3' },
      { name: 'Basilic frais',         qty: '4 feuilles' },
    ],
    steps: "Tartiner le pain de fromage de chèvre. Déposer les tomates séchées en lamelles et les feuilles de basilic.",
  },
  {
    id: 'fr_sn04', name: 'Milk-shake banane-cacao-fromage blanc',
    slots: ['snack','post'], diet: ['omni','vegetarian'],
    difficulty: 'easy', time: 5, area: 'Français',
    macros: { cal: 280, carbs: 42, protein: 16, fat: 5 },
    ingredients: [
      { name: 'Banane mûre',        qty: '1' },
      { name: 'Fromage blanc 0 %',  qty: '150 g' },
      { name: 'Lait demi-écrémé',   qty: '150 ml' },
      { name: 'Cacao non sucré',    qty: '1 c.s.' },
      { name: 'Miel',              qty: '1 c.c.' },
    ],
    steps: "Placer tous les ingrédients dans un blender. Mixer 30 sec. Servir bien frais.",
  },
  {
    id: 'fr_sn05', name: 'Pain complet et purée de cacahuète',
    slots: ['snack','pre'], diet: ['omni','vegetarian','vegan'],
    difficulty: 'easy', time: 3, area: 'Français',
    macros: { cal: 260, carbs: 30, protein: 10, fat: 12 },
    ingredients: [
      { name: 'Pain complet',             qty: '2 tranches' },
      { name: 'Purée de cacahuète 100 %', qty: '2 c.s.' },
      { name: 'Banane',                  qty: '½' },
    ],
    steps: "Tartiner le pain de purée de cacahuète. Couper la banane en rondelles et déposer sur les tartines.",
  },
];

// ── Catégories d'ingrédients pour la liste de courses ─────────────────────────

const ING_CATS_FR = [
  { label: 'Viandes & Poissons',        re: /poulet|bœuf|veau|porc|jambon|saumon|thon|cabillaud|truite|crevette|sardine|anchois|canard|agneau|dinde|blanc de poulet|haut de cuisse|filet de/i },
  { label: 'Œufs & Produits laitiers',  re: /œuf|oeuf|lait|beurre|crème|fromage|yaourt|skyr|parmesan|emmental|chèvre|mozzarella|ricotta/i },
  { label: 'Féculents & Légumineuses',  re: /pâtes|riz|farine|pain|avoine|flocons|quinoa|couscous|boulgour|pomme de terre|patate|lentille|pois chiche|haricot|semoule|polenta|edamame/i },
  { label: 'Légumes',                   re: /tomate|oignon|ail|poivron|champignon|épinard|carotte|brocoli|courgette|laitue|céleri|poireau|concombre|aubergine|asperge|chou|fenouil|salade/i },
  { label: 'Fruits',                    re: /citron|orange|pomme|banane|fraise|framboise|myrtille|mangue|pêche|poire|cerise|abricot|ananas|raisin|datte|fruits rouges|avocat/i },
  { label: 'Épices & Herbes',           re: /sel|poivre|cumin|paprika|thym|basilic|origan|coriandre|curcuma|curry|piment|cannelle|muscade|gingembre|laurier|romarin|aneth|persil|menthe|sauge|herbes de provence|safran|vanille/i },
  { label: 'Huiles & Condiments',       re: /huile|vinaigre|sauce soja|moutarde|mayonnaise|tahini|miso|câpres|olives/i },
  { label: 'Sucrants & Oléagineux',     re: /sucre|miel|sirop|confiture|chocolat|cacao|amande|cacahuète|noix de cajou|noix|noisette|beurre d.amande|pâte d|graines|sésame|chia|courge|pignons|granola/i },
  { label: 'Conserves & Bouillons',     re: /bouillon|lait de coco|coulis|tomates concassées|purée de tomates/i },
];

function categoriseIngredient(name) {
  for (const { label, re } of ING_CATS_FR) {
    if (re.test(name)) return label;
  }
  return 'Autres';
}

// ── Semaine type vélo ─────────────────────────────────────────────────────────

const WEEK_TEMPLATE = [
  { day: 'Lundi',    load: 'easy',     slots: ['breakfast','lunch','dinner'] },
  { day: 'Mardi',    load: 'hard',     slots: ['breakfast','pre','lunch','post','dinner'] },
  { day: 'Mercredi', load: 'rest',     slots: ['breakfast','lunch','dinner'] },
  { day: 'Jeudi',    load: 'moderate', slots: ['breakfast','lunch','post','dinner'] },
  { day: 'Vendredi', load: 'easy',     slots: ['breakfast','lunch','dinner'] },
  { day: 'Samedi',   load: 'long',     slots: ['breakfast','pre','lunch','post','dinner'] },
  { day: 'Dimanche', load: 'rest',     slots: ['breakfast','lunch','dinner'] },
];

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * Retourne jusqu'à `count` recettes pour un créneau donné.
 * Résultat synchrone, pas d'API.
 */
export function getFrenchSlotRecipes({ slot, diet, count = 4, weightKg = 70, difficulty = null }) {
  const dietKey = diet === 'omnivore' ? 'omni' : diet;
  const scale   = weightKg / 70;

  let pool = RECIPES.filter(r =>
    r.slots.includes(slot) &&
    r.diet.includes(dietKey) &&
    (difficulty === null || r.difficulty === difficulty)
  );

  pool = shuffle(pool).slice(0, count);

  return pool.map(r => ({
    ...r,
    fromApi: false,
    macrosEstimated: false,
    thumb: null,
    sourceUrl: null,
    youtubeUrl: null,
    macros: {
      cal:     Math.round(r.macros.cal     * scale),
      carbs:   Math.round(r.macros.carbs   * scale),
      protein: Math.round(r.macros.protein * scale),
      fat:     Math.round(r.macros.fat     * scale),
    },
  }));
}

/**
 * Génère un plan semaine + liste de courses agrégée.
 * Synchrone — pas d'appel API.
 */
export function buildFrenchWeekShoppingList({ diet, weightKg = 70, difficulty = null }) {
  const dietKey = diet === 'omnivore' ? 'omni' : diet;

  // Une recette par (slot × load) unique pour éviter la répétition
  const combos = new Map();
  for (const { load, slots } of WEEK_TEMPLATE) {
    for (const slot of slots) {
      const key = `${slot}::${load}`;
      if (!combos.has(key)) {
        const [recipe] = getFrenchSlotRecipes({ slot, diet: dietKey, count: 1, weightKg, difficulty });
        combos.set(key, recipe || null);
      }
    }
  }

  const weekPlan = WEEK_TEMPLATE.map(({ day, load, slots }) => ({
    day, load,
    meals: Object.fromEntries(
      slots.map(slot => [slot, combos.get(`${slot}::${load}`) || null])
    ),
  }));

  // Agrégation des ingrédients
  const ingMap = new Map();
  for (const { day, meals } of weekPlan) {
    for (const [, recipe] of Object.entries(meals)) {
      if (!recipe) continue;
      for (const ing of recipe.ingredients) {
        const key = ing.name.toLowerCase().trim();
        if (!key) continue;
        if (!ingMap.has(key)) {
          ingMap.set(key, { name: ing.name, measures: [], recipes: [], category: categoriseIngredient(ing.name) });
        }
        const entry = ingMap.get(key);
        if (ing.qty?.trim()) entry.measures.push(ing.qty.trim());
        entry.recipes.push(`${day} (${recipe.name})`);
      }
    }
  }

  const grouped = new Map();
  for (const item of ingMap.values()) {
    if (!grouped.has(item.category)) grouped.set(item.category, []);
    grouped.get(item.category).push(item);
  }

  const catOrder = [...ING_CATS_FR.map(c => c.label), 'Autres'];
  const shoppingList = catOrder
    .filter(cat => grouped.has(cat))
    .map(cat => ({
      category: cat,
      items: grouped.get(cat).sort((a, b) => a.name.localeCompare(b.name)),
    }));

  return { weekPlan, shoppingList };
}
