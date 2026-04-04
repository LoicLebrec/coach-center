// Fetches French amateur race calendar from cyclisme-amateur.com
// Tries the Vercel serverless function first (/api/races),
// then multiple CORS proxies in sequence.

// Each proxy entry: { url: fn(target) => string, extract: fn(data) => html }
const CORS_PROXIES = [
  {
    build: t => `https://api.allorigins.win/get?url=${t}`,
    extract: d => d.contents || '',
  },
  {
    build: t => `https://corsproxy.io/?${t}`,
    extract: d => typeof d === 'string' ? d : '',
  },
  {
    build: t => `https://api.codetabs.com/v1/proxy?quest=${t}`,
    extract: d => typeof d === 'string' ? d : '',
  },
];

const FRENCH_MONTHS = {
  janvier: '01', février: '02', fevrier: '02', mars: '03', avril: '04',
  mai: '05', juin: '06', juillet: '07', août: '08', aout: '08',
  septembre: '09', octobre: '10', novembre: '11', décembre: '12', decembre: '12',
};

function parseFrenchDate(str) {
  const clean = str.toLowerCase()
    .replace(/^(lun|mar|mer|jeu|ven|sam|dim)\.?\s+/, '')
    .trim();
  const parts = clean.split(/\s+/);
  if (parts.length < 2) return null;
  const day = String(parseInt(parts[0], 10) || 0).padStart(2, '0');
  const month = FRENCH_MONTHS[parts[1]];
  if (!month || day === '00') return null;
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const mNum = parseInt(month, 10);
  const year = mNum < currentMonth ? now.getFullYear() + 1 : now.getFullYear();
  return `${year}-${month}-${day}`;
}

function parseRacesFromHtml(html, federation) {
  const races = [];
  // Match each anchor to a race page
  const linkRe = /href="(\/course-(\d+)-([^"]+)\.html)"/g;
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const path = m[1];
    const id = m[2];
    const slug = m[3].replace(/-ffc$|-fsgt$|-ufolep$|-ffct$/i, '');

    // Grab surrounding context (~400 chars before/after the link)
    const start = Math.max(0, m.index - 400);
    const end = Math.min(html.length, m.index + 300);
    const ctx = html.slice(start, end);

    // Anchor text (visible race name)
    const anchorText = ctx.match(new RegExp(
      `href="${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>([^<]+)<`
    ));
    const nameRaw = anchorText ? anchorText[1].trim() : slug.replace(/-/g, ' ');
    const name = nameRaw.replace(/\b\w/g, c => c.toUpperCase());

    // Date — look for "Lun 30 Mars" or "30 Mars" patterns
    const dateM = ctx.match(/([A-Za-zÀ-ÿ]+\s+\d{1,2}\s+[A-Za-zÀ-ÿé]+)/);
    const isoDate = dateM ? parseFrenchDate(dateM[1]) : null;
    if (!isoDate) continue;

    // Department [XX]
    const deptM = ctx.match(/\[(\d{2,3}|2[AB])\]/);
    const department = deptM ? deptM[1] : null;

    // Category
    const catM = ctx.match(/(elite\s*open|open|pro|3[eè]|2[eè]|1[eè]|junior|espoir|f[eé]m|cyclosport|randonn)/i);
    const category = catM ? catM[0].trim().toLowerCase() : null;

    races.push({
      id: `${federation}-${id}`,
      name,
      date: isoDate,
      department,
      federation,
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
      const res = await fetch(proxy.build(target), { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const data = await res.json().catch(() => res.text());
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
  // 1. Try the Vercel serverless function (works in production)
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
      if (Array.isArray(data) && data.length >= 0) return data;
    }
  } catch { /* fall through to proxy */ }

  // 2. CORS proxy fallback (local dev)
  const feds = fed ? [fed.toUpperCase()] : ['FFC', 'FSGT', 'UFOLEP', 'FFCT'];
  const allRaces = [];
  await Promise.allSettled(
    feds.map(f => fetchViaProxy(f).then(r => allRaces.push(...r)).catch(() => {}))
  );

  // Deduplicate
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
