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
    const id   = linkM[2];
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

function parseFfcRaces(html) {
  const races = [];
  // Match each clickable organisation-titre anchor block
  const orgRe = /<a\b[^>]*class="[^"]*organisation-titre[^"]*"([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = orgRe.exec(html)) !== null) {
    const attrs = m[1];
    const block = m[2];

    // Skip cancelled races
    if (/annule/i.test(attrs + block)) continue;

    const dateM = block.match(/organisation-titre-jours[^>]*>\s*([^<]+)\s*</i);
    const date = parseFfcDate(dateM?.[1] || '');
    if (!date) continue;

    // Only future races
    const today = new Date().toISOString().split('T')[0];
    if (date < today) continue;

    const nameM = block.match(/organisation-titre-libelle[^>]*>\s*([^<]+)\s*</i);
    const name = (nameM?.[1] || '').trim().replace(/\s+/g, ' ');
    if (!name) continue;

    const locM = block.match(/organisation-titre-localisation[^>]*>\s*([^<]+)\s*</i);
    const loc = (locM?.[1] || '').trim();
    // Extract dept code from trailing 2-digit number: "BOLLENE 84" → "84"
    const deptM = loc.match(/\b(\d{2,3})\s*$/);
    const department = deptM ? String(parseInt(deptM[1], 10)).padStart(2, '0') : null;

    // Href for the organisation (may be relative like /calendrier/competition/...)
    const hrefM = attrs.match(/href="([^"]+)"/i);
    const url = hrefM
      ? (hrefM[1].startsWith('http') ? hrefM[1] : `https://competitions.ffc.fr${hrefM[1]}`)
      : 'https://competitions.ffc.fr/calendrier/';

    const id = `ffc-${date}-${name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16)}`;

    races.push({
      id,
      name: name.replace(/\b\w/g, c => c.toUpperCase()),
      date,
      department,
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

  try {
    const allRaces = [];

    // ── Source 1: cyclisme-amateur.com ──────────────────────────────────────
    await Promise.all(feds.map(async (federation) => {
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
      const fmt = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
      const today = new Date();
      const fin90 = new Date(today); fin90.setDate(fin90.getDate() + 120);
      const ffcUrl = `https://competitions.ffc.fr/calendrier/calendrier.aspx?debut=${fmt(today)}&fin=${fmt(fin90)}&discipline=Route`;
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
