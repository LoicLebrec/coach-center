// Vercel serverless function — scrapes cyclisme-amateur.com race calendar
// GET /api/races?date=2026-03-30&department=75&fed=FFC

const FRENCH_MONTHS = {
  janvier: '01', février: '02', mars: '03', avril: '04',
  mai: '05', juin: '06', juillet: '07', août: '08',
  septembre: '09', octobre: '10', novembre: '11', décembre: '12',
};

function parseFrenchDate(str) {
  // "Lun 30 Mars" or "30 Mars" → "2026-03-30"
  const clean = str.toLowerCase().replace(/^(lun|mar|mer|jeu|ven|sam|dim)\s+/, '').trim();
  const parts = clean.split(/\s+/);
  if (parts.length < 2) return null;
  const day = parts[0].padStart(2, '0');
  const month = FRENCH_MONTHS[parts[1]];
  if (!month) return null;
  // Determine year: if month already passed use next year
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();
  const currentYear = now.getFullYear();
  const mNum = parseInt(month, 10);
  let year = currentYear;
  if (mNum < currentMonth || (mNum === currentMonth && parseInt(day, 10) < currentDay)) {
    year = currentYear + 1;
  }
  return `${year}-${month}-${day}`;
}

function parseRaces(html, federation) {
  const races = [];

  // Match table rows or list items with race data
  // Pattern: date cell, department cell, name link, category cell
  // The site uses <td> cells; we look for course links
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const linkRegex = /href="(\/course-(\d+)-([^"]+)\.html)"/i;
  const dateRegex = /([A-Za-zÀ-ÿ]+\s+\d{1,2}\s+[A-Za-zÀ-ÿé]+)/;
  const deptRegex = /\[(\d{2,3})\]/;
  const catRegex = /(elite\s*open|open|pro|3[eè]me\s*cat|2[eè]me\s*cat|1[eè]re\s*cat|junior|espoir|f[eé]minine|cyclosport|randonn[eé]e|vtc|vtt|gravel|ufolep|fsgt|ffct)/i;

  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[1];
    if (!row.includes('/course-')) continue;

    const linkMatch = linkRegex.exec(row);
    if (!linkMatch) continue;

    const path = linkMatch[1];
    const id = linkMatch[2];
    // Extract name from slug
    const slug = linkMatch[3].replace(/-ffc$|-fsgt$|-ufolep$|-ffct$/i, '');
    const nameFromSlug = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    // Try to extract visible name from anchor text
    const anchorTextMatch = row.match(new RegExp(`href="${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>([^<]+)<`));
    const name = anchorTextMatch ? anchorTextMatch[1].trim() : nameFromSlug;

    // Extract date
    const dateMatch = dateRegex.exec(row);
    const isoDate = dateMatch ? parseFrenchDate(dateMatch[1]) : null;
    if (!isoDate) continue;

    // Extract department
    const deptMatch = deptRegex.exec(row);
    const department = deptMatch ? deptMatch[1] : null;

    // Extract category
    const catMatch = catRegex.exec(row);
    const category = catMatch ? catMatch[0].trim() : null;

    // Strip HTML tags for location hints
    const textOnly = row.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    races.push({
      id,
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { date, department, fed } = req.query || {};
  const feds = fed ? [fed.toUpperCase()] : ['FFC', 'FSGT', 'UFOLEP', 'FFCT'];

  try {
    const allRaces = [];

    await Promise.all(feds.map(async (federation) => {
      try {
        const url = `https://www.cyclisme-amateur.com/course.php?fed=${federation}`;
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CoachCenterApp/1.0)' },
        });
        if (!response.ok) return;
        const html = await response.text();
        const races = parseRaces(html, federation);
        allRaces.push(...races);
      } catch {
        // skip failed federation
      }
    }));

    // Deduplicate by id
    const seen = new Set();
    const unique = allRaces.filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    // Sort by date
    unique.sort((a, b) => a.date.localeCompare(b.date));

    // Filter
    let result = unique;
    if (date) result = result.filter(r => r.date === date);
    if (department) result = result.filter(r => r.department === department);

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
