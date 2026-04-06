// Vercel serverless function — scrapes cyclisme-amateur.com race calendar
// GET /api/races?date=2026-04-05&department=06&fed=FFC

const FRENCH_MONTHS = {
  janvier: '01', janv: '01', 'janv.': '01',
  février: '02', fevrier: '02', févr: '02', 'févr.': '02', fevr: '02', fev: '02',
  mars: '03',
  avril: '04', avri: '04', 'avri.': '04', avr: '04', 'avr.': '04',
  mai: '05',
  juin: '06',
  juillet: '07', juil: '07', 'juil.': '07',
  août: '08', aout: '08',
  septembre: '09', sept: '09', 'sept.': '09',
  octobre: '10', oct: '10', 'oct.': '10',
  novembre: '11', nov: '11', 'nov.': '11',
  décembre: '12', decembre: '12', déc: '12', dec: '12', 'déc.': '12',
};

function parseFrenchDate(str) {
  if (!str) return null;
  const clean = str.toLowerCase()
    .replace(/&[a-z]+;/g, '')
    .replace(/^(lun|mar|mer|jeu|ven|sam|dim)\.?\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();

  const parts = clean.split(/[\s.]+/).filter(Boolean);
  if (parts.length < 2) return null;

  const day = String(parseInt(parts[0], 10) || 0).padStart(2, '0');
  if (day === '00') return null;

  let month = null;
  for (let i = 1; i < parts.length; i++) {
    const candidate = parts[i].replace(/\.$/, '');
    month = FRENCH_MONTHS[candidate] || FRENCH_MONTHS[candidate + '.'] || null;
    if (month) break;
  }
  if (!month) return null;

  const now = new Date();
  const mNum = parseInt(month, 10);
  const dNum = parseInt(day, 10);
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();
  const currentYear = now.getFullYear();
  let year = currentYear;
  if (mNum < currentMonth || (mNum === currentMonth && dNum < currentDay)) {
    year = currentYear + 1;
  }
  return `${year}-${month}-${day}`;
}

function parseRaces(html, federation) {
  const races = [];
  let currentDate = null;

  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRe.exec(html)) !== null) {
    const row = rowMatch[1];

    // Date cell (only in first row of a date group)
    const dateDivM = row.match(/cellule_td_course[^>]*>([^<]+)</i);
    if (dateDivM) {
      const parsed = parseFrenchDate(dateDivM[1].trim());
      if (parsed) currentDate = parsed;
    }

    // Course link — handles both single and double quotes
    const linkM = row.match(/href=['"](\/course-(\d+)-([^'"]+)\.html)['"]/i);
    if (!linkM) continue;

    const path = linkM[1];
    const id = linkM[2];
    const slug = linkM[3].replace(/-ffc$|-fsgt$|-ufolep$|-ffct$/i, '');

    // Name: skip closing > of <a href='...'>, then strip HTML
    const afterHref = row.slice(row.indexOf(linkM[0]) + linkM[0].length);
    const closeTag = afterHref.indexOf('>');
    const afterTag = closeTag >= 0 ? afterHref.slice(closeTag + 1) : afterHref;
    const nameRaw = afterTag.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split('.')[0].trim();
    const name = (nameRaw || slug.replace(/-/g, ' '))
      .replace(/\b\w/g, c => c.toUpperCase())
      .trim();

    // Department
    const deptM = row.match(/href=['"]https?:\/\/[^'"]*['"][^>]*>\s*(\d{2,3})\s*<\/a>/i);
    const department = deptM ? deptM[1].trim() : null;

    // Federation
    const fedM = row.match(/\|\s*(FFC|FSGT|UFOLEP|FFCT)\b/i);
    const fed = fedM ? fedM[1].toUpperCase() : federation.toUpperCase();

    // Category
    const text = row.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');
    const catM = text.match(/(elite\s*open|open|toute|pro|3[eè]me|2[eè]me|1[eè]re|junior|espoir|f[eé]minine|cyclosport|randonn[eé]e)/i);
    const category = catM ? catM[0].trim().toLowerCase() : null;

    if (!currentDate) continue;

    races.push({
      id,
      name: name || 'Course',
      date: currentDate,
      department,
      federation: fed,
      category,
      url: `https://www.cyclisme-amateur.com${path}`,
    });
  }

  return races;
}

// ── FFC (competitions.ffc.fr) parser ─────────────────────────────────────────

function parseFfcDate(str) {
  if (!str) return null;
  // "Le 05/04/2026" or "Du 05/04/2026 au 12/04/2026" → take first date
  const m = str.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`; // YYYY-MM-DD
}

const DEPT_NAME_TO_CODE = {
  'ain': '01',
  'aisne': '02',
  'allier': '03',
  'alpes-de-haute-provence': '04',
  'hautes-alpes': '05',
  'alpes-maritimes': '06',
  'ardeche': '07',
  'ardennes': '08',
  'ariege': '09',
  'aube': '10',
  'aude': '11',
  'aveyron': '12',
  'bouches-du-rhone': '13',
  'calvados': '14',
  'cantal': '15',
  'charente': '16',
  'charente-maritime': '17',
  'cher': '18',
  'correze': '19',
  'cote-d-or': '21',
  'cotes-d-armor': '22',
  'creuse': '23',
  'dordogne': '24',
  'doubs': '25',
  'drome': '26',
  'eure': '27',
  'eure-et-loir': '28',
  'finistere': '29',
  'corse-du-sud': '2A',
  'haute-corse': '2B',
  'gard': '30',
  'haute-garonne': '31',
  'gers': '32',
  'gironde': '33',
  'herault': '34',
  'ille-et-vilaine': '35',
  'indre': '36',
  'indre-et-loire': '37',
  'isere': '38',
  'jura': '39',
  'landes': '40',
  'loir-et-cher': '41',
  'loire': '42',
  'haute-loire': '43',
  'loire-atlantique': '44',
  'loiret': '45',
  'lot': '46',
  'lot-et-garonne': '47',
  'lozere': '48',
  'maine-et-loire': '49',
  'manche': '50',
  'marne': '51',
  'haute-marne': '52',
  'mayenne': '53',
  'meurthe-et-moselle': '54',
  'meuse': '55',
  'morbihan': '56',
  'moselle': '57',
  'nievre': '58',
  'nord': '59',
  'oise': '60',
  'orne': '61',
  'pas-de-calais': '62',
  'puy-de-dome': '63',
  'pyrenees-atlantiques': '64',
  'hautes-pyrenees': '65',
  'pyrenees-orientales': '66',
  'bas-rhin': '67',
  'haut-rhin': '68',
  'rhone': '69',
  'haute-saone': '70',
  'saone-et-loire': '71',
  'sarthe': '72',
  'savoie': '73',
  'haute-savoie': '74',
  'paris': '75',
  'seine-maritime': '76',
  'seine-et-marne': '77',
  'yvelines': '78',
  'deux-sevres': '79',
  'somme': '80',
  'tarn': '81',
  'tarn-et-garonne': '82',
  'var': '83',
  'vaucluse': '84',
  'vendee': '85',
  'vienne': '86',
  'haute-vienne': '87',
  'vosges': '88',
  'yonne': '89',
  'territoire de belfort': '90',
  'essonne': '91',
  'hauts-de-seine': '92',
  'seine-saint-denis': '93',
  'val-de-marne': '94',
  'val-d-oise': '95',
  'guadeloupe': '971',
  'martinique': '972',
  'guyane': '973',
  'la reunion': '974',
  'mayotte': '976',
};

function normalizeDeptName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveDepartmentCode(loc) {
  if (!loc) return null;
  const codeMatch = loc.match(/\b(\d{2,3}|2A|2B)\s*$/i);
  if (codeMatch) return codeMatch[1].toUpperCase();
  const normalized = normalizeDeptName(loc);
  return DEPT_NAME_TO_CODE[normalized] || null;
}

function deptFromCompetitionId(competitionId) {
  const digits = String(competitionId || '').replace(/[^0-9]/g, '');
  if (digits.length < 4) return null;
  const code = digits.slice(2, 4);
  if (/^(0[1-9]|[1-8][0-9]|9[0-5])$/.test(code)) return code;
  return null;
}

function decodeHtmlEntities(text) {
  if (!text) return '';
  return String(text)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function parseFfcRaces(html) {
  const races = [];
  const todayStr = new Date().toISOString().split('T')[0];
  const orgRe = /<a\b[^>]*class="[^"]*organisation-titre[^"]*"([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = orgRe.exec(html)) !== null) {
    const attrs = m[1];
    const block = m[2];
    if (/annule/i.test(attrs + block)) continue;

    const dateM = block.match(/organisation-titre-jours[^>]*>\s*([^<]+)\s*</i);
    const date = parseFfcDate(dateM?.[1] || '');
    if (!date || date < todayStr) continue;

    const nameM = block.match(/organisation-titre-libelle[^>]*>\s*([^<]+)\s*</i);
    const name = decodeHtmlEntities((nameM?.[1] || '').trim().replace(/\s+/g, ' '));
    if (!name) continue;

    // Location: "BOLLENE 84" → city="BOLLENE", dept="84"
    const locM = block.match(/organisation-titre-localisation[^>]*>\s*([^<]+)\s*</i);
    const loc = decodeHtmlEntities((locM?.[1] || '').replace(/\s+/g, ' ').trim());
    const city = loc.replace(/\s*\d{2,3}\s*$/, '').trim() || null;

    // Discipline: Route, VTT, BMX, Cyclo-Cross, etc.
    const discM = block.match(/organisation-titre-discipline[^>]*>\s*([^<]+)\s*</i);
    const discipline = discM ? discM[1].trim() : null;

    const hrefM = attrs.match(/href="([^"]+)"/i);
    const url = hrefM
      ? (hrefM[1].startsWith('http') ? hrefM[1] : `https://competitions.ffc.fr${hrefM[1]}`)
      : 'https://competitions.ffc.fr/calendrier/';

    const competitionId = (url.match(/\/competition\/\d+\/([^/]+)\//i)?.[1] || '').toLowerCase();
    const department = resolveDepartmentCode(loc) || deptFromCompetitionId(competitionId);

    races.push({
      id: competitionId ? `ffc-${competitionId}` : `ffc-${date}-${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      name,
      date,
      department,
      city,
      discipline,
      federation: 'FFC',
      category: null,
      url,
    });
  }
  return races;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { date, department, fed } = req.query || {};
  const feds = fed ? [fed.toUpperCase()] : ['FFC', 'FSGT', 'UFOLEP', 'FFCT'];
  const amiveloFeds = feds.filter(f => f !== 'FFC');

  try {
    const allRaces = [];

    // ── Source 1: cyclisme-amateur.com ──────────────────────────────────────
    await Promise.all(amiveloFeds.map(async (federation) => {
      try {
        const url = `https://www.cyclisme-amateur.com/course.php?fed=${federation}`;
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CoachCenterApp/1.0)' },
        });
        if (!response.ok) return;
        const buffer = await response.arrayBuffer();
        const html = new TextDecoder('latin-1').decode(buffer);
        allRaces.push(...parseRaces(html, federation));
      } catch { /* skip */ }
    }));

    // ── Source 2: FFC official calendar (Route discipline, next 90 days) ───
    try {
      const fmt = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      const today = new Date();
      const fin180 = new Date(today); fin180.setDate(fin180.getDate() + 180);
      // No discipline filter → fetch all sports (Route, VTT, BMX, Cyclo-Cross, etc.)
      const ffcUrl = `https://competitions.ffc.fr/calendrier/calendrier.aspx?debut=${fmt(today)}&fin=${fmt(fin180)}`;
      const ffcResp = await fetch(ffcUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CoachCenterApp/1.0)' },
      });
      if (ffcResp.ok) {
        const ffcHtml = await ffcResp.text();
        allRaces.push(...parseFfcRaces(ffcHtml));
      }
    } catch { /* skip FFC */ }

    const seen = new Set();
    const unique = allRaces.filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    unique.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    let result = unique;
    if (date) result = result.filter(r => r.date === date);
    if (department) result = result.filter(r => r.department === department);

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
