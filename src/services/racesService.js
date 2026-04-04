// Fetches French amateur race calendar from cyclisme-amateur.com
// Tries the Vercel serverless function first (/api/races),
// then multiple CORS proxies in sequence.

// Each proxy: build(encodedUrl) → fetchUrl, extract(responseData) → htmlString
const CORS_PROXIES = [
  {
    build: t => `https://api.allorigins.win/get?url=${t}`,
    extract: d => (typeof d === 'object' ? d.contents : d) || '',
    json: true,
  },
  {
    build: t => `https://corsproxy.io/?${t}`,
    extract: d => typeof d === 'string' ? d : '',
    json: false,
  },
  {
    build: t => `https://api.codetabs.com/v1/proxy?quest=${t}`,
    extract: d => typeof d === 'string' ? d : '',
    json: false,
  },
];

// Abbreviated and full French month names → zero-padded month number
const FRENCH_MONTHS = {
  janvier: '01', janv: '01', 'janv.': '01',
  février: '02', fevrier: '02', févr: '02', 'févr.': '02', fevr: '02', fev: '02', fév: '02',
  mars: '03',
  avril: '04', avri: '04', 'avri.': '04', avr: '04', 'avr.': '04',
  mai: '05',
  juin: '06',
  juillet: '07', juil: '07', 'juil.': '07',
  août: '08', aout: '08', 'août.': '08',
  septembre: '09', sept: '09', 'sept.': '09',
  octobre: '10', oct: '10', 'oct.': '10',
  novembre: '11', nov: '11', 'nov.': '11',
  décembre: '12', decembre: '12', déc: '12', dec: '12', 'déc.': '12', 'dec.': '12',
};

function parseFrenchDate(str) {
  if (!str) return null;
  // Normalise: lowercase, strip HTML entities, strip trailing dot on month
  const clean = str.toLowerCase()
    .replace(/&[a-z]+;/g, '')           // strip HTML entities
    .replace(/^(lun|mar|mer|jeu|ven|sam|dim)\.?\s+/, '') // strip day abbreviation
    .replace(/\s+/g, ' ')
    .trim();

  const parts = clean.split(/[\s.]+/).filter(Boolean);
  if (parts.length < 2) return null;

  const day = String(parseInt(parts[0], 10) || 0).padStart(2, '0');
  if (day === '00') return null;

  // Try each remaining part as month until one matches
  let month = null;
  for (let i = 1; i < parts.length; i++) {
    const candidate = parts[i].replace(/\.$/, ''); // strip trailing dot
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

/**
 * Parse races from the HTML of cyclisme-amateur.com/course.php?fed=XXX
 *
 * HTML structure:
 *   <tr>
 *     <td rowspan="N"><div class="cellule_td_course">Sam 04 Avri.</div></td>  ← date (first row of group only)
 *     <td><a href='http://...courses-alpes-maritimes.html'>06</a> | FFC</td>  ← dept + fed
 *     <td><b><a href='/course-12345-nom-ffc.html'>Nom course</a></b></td>     ← course link
 *     <td>catégorie</td>
 *   </tr>
 *   <tr>  ← subsequent rows in the group have no date cell
 *     <td><a href='...courses-cher.html'>18</a> | FFC</td>
 *     …
 *   </tr>
 */
function parseRacesFromHtml(html, federation) {
  const races = [];
  let currentDate = null;

  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRe.exec(html)) !== null) {
    const row = rowMatch[1];

    // ── Date ─────────────────────────────────────────────────────────────────
    // Present only in the first <tr> of each date group via class="cellule_td_course"
    const dateDivM = row.match(/cellule_td_course[^>]*>([^<]+)</i);
    if (dateDivM) {
      const parsed = parseFrenchDate(dateDivM[1].trim());
      if (parsed) currentDate = parsed;
    }

    // ── Course link (single OR double quotes) ─────────────────────────────────
    const linkM = row.match(/href=['"](\\/course-(\\d+)-([^'"]+)\\.html)['"]/i);
    if (!linkM) continue;

    const path = linkM[1];
    const id   = linkM[2];
    const slug = linkM[3].replace(/-ffc$|-fsgt$|-ufolep$|-ffct$/i, '');

    // ── Name: skip closing > of <a href='...'>, then strip HTML ─────────────────
    const afterHref = row.slice(row.indexOf(linkM[0]) + linkM[0].length);
    const closeTag = afterHref.indexOf('>');
    const afterTag = closeTag >= 0 ? afterHref.slice(closeTag + 1) : afterHref;
    const nameRaw = afterTag.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split('.')[0].trim();
    const name = (nameRaw || slug.replace(/-/g, ' '))
      .replace(/\b\w/g, c => c.toUpperCase())
      .trim();

    // ── Department: <a href='http://...'>\n  06\n</a> ─────────────────────────
    const deptM = row.match(/href=['"]https?:\/\/[^'"]*['"][^>]*>\s*(\d{2,3})\s*<\/a>/i);
    const department = deptM ? deptM[1].trim() : null;

    // ── Federation: text following "|" e.g. "| FFC" ───────────────────────────
    const fedM = row.match(/\|\s*(FFC|FSGT|UFOLEP|FFCT)\b/i);
    const fed = fedM ? fedM[1].toUpperCase() : federation.toUpperCase();

    // ── Category ───────────────────────────────────────────────────────────────
    const text = row.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');
    const catM = text.match(/(elite\s*open|open|toute|pro|3[eè]me|2[eè]me|1[eè]re|junior|espoir|f[eé]minine|cyclosport|randonn[eé]e)/i);
    const category = catM ? catM[0].trim().toLowerCase() : null;

    if (!currentDate) continue;

    races.push({
      id: `${fed}-${id}`,
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

async function fetchViaProxy(fed) {
  const target = encodeURIComponent(`https://www.cyclisme-amateur.com/course.php?fed=${fed}`);
  for (const proxy of CORS_PROXIES) {
    try {
      const res = await fetch(proxy.build(target), {
        signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
      });
      if (!res.ok) continue;
      const data = proxy.json ? await res.json() : await res.text();
      const html = proxy.extract(data);
      if (html && html.length > 500) {
        const races = parseRacesFromHtml(html, fed);
        if (races.length > 0) return races;
      }
    } catch { /* try next proxy */ }
  }
  return [];
}

export async function fetchRaces({ date, department, fed } = {}) {
  // 1. Try Vercel serverless function (production)
  try {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (department) params.set('department', department);
    if (fed) params.set('fed', fed);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`/api/races?${params}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch { /* fall through */ }

  // 2. CORS proxy fallback (local dev / GitHub Pages)
  const feds = fed ? [fed.toUpperCase()] : ['FFC', 'FSGT', 'UFOLEP', 'FFCT'];
  const allRaces = [];
  await Promise.allSettled(
    feds.map(f => fetchViaProxy(f).then(r => allRaces.push(...r)).catch(() => {}))
  );

  // Deduplicate by id
  const seen = new Set();
  const unique = allRaces.filter(r => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  unique.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  return unique.filter(r => {
    if (date && r.date !== date) return false;
    if (department && r.department !== department) return false;
    return true;
  });
}
