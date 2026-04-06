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
    const linkM = row.match(/href=['"](\/course-(\d+)-([^'"]+)\.html)['"]/i);
    if (!linkM) continue;

    const path = linkM[1];
    const id = linkM[2];
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
      lat: null, // Will be populated later if needed
      lon: null,
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

// ── FFC (competitions.ffc.fr) ─────────────────────────────────────────────────

function parseFfcDate(str) {
  if (!str) return null;
  const m = str.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * Geocode a French city name to lat/lon using OpenStreetMap Nominatim
 * Returns { lat, lon } or null if not found
 * Rate-limited to respect Nominatim terms of service (1 req/sec)
 */
const geocodeCache = {}; // city → [lat, lon] | null
let lastGeocodeTime = 0;

async function geocodeCity(cityName, deptCode = null) {
  if (!cityName) return null;

  const cacheKey = `${cityName}|${deptCode || ''}`;
  if (cacheKey in geocodeCache) return geocodeCache[cacheKey];

  try {
    // Rate limit: wait 1 second between requests
    const now = Date.now();
    const timeSinceLastRequest = now - lastGeocodeTime;
    if (timeSinceLastRequest < 1100) {
      await new Promise(r => setTimeout(r, 1100 - timeSinceLastRequest));
    }
    lastGeocodeTime = Date.now();

    const query = deptCode
      ? encodeURIComponent(`${cityName}, ${deptCode}, France`)
      : encodeURIComponent(`${cityName}, France`);

    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=fr`,
      {
        headers: {
          'Accept-Language': 'fr',
          'User-Agent': 'CoachCenterApp/1.0'
        },
        signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined
      }
    );

    if (!res.ok) {
      geocodeCache[cacheKey] = null;
      return null;
    }

    const results = await res.json();
    if (results.length > 0) {
      const coords = [parseFloat(results[0].lat), parseFloat(results[0].lon)];
      geocodeCache[cacheKey] = coords;
      return coords;
    }
  } catch (err) {
    console.warn(`Geocoding failed for "${cityName}":`, err.message);
  }

  geocodeCache[cacheKey] = null;
  return null;
}

/**
 * Department centroids as fallback [lat, lon]
 * Used when geocoding fails or is too slow
 */
const DEPT_CENTROIDS = {
  '01': [46.21, 5.22], '02': [49.55, 3.61], '03': [46.34, 3.12], '04': [44.10, 6.24],
  '05': [44.70, 6.37], '06': [43.92, 7.18], '07': [44.80, 4.54], '08': [49.72, 4.72],
  '09': [42.92, 1.52], '10': [48.32, 4.11], '11': [43.12, 2.35], '12': [44.32, 2.68],
  '13': [43.52, 5.43], '14': [49.10, -0.35], '15': [45.05, 2.65], '16': [45.70, 0.16],
  '17': [45.83, -0.73], '18': [47.08, 2.42], '19': [45.37, 1.88], '21': [47.31, 4.83],
  '22': [48.42, -2.75], '23': [46.00, 2.03], '24': [45.03, 0.88], '25': [47.12, 6.37],
  '26': [44.73, 5.10], '27': [49.12, 1.07], '28': [48.43, 1.38], '29': [48.24, -4.12],
  '30': [44.00, 4.13], '31': [43.45, 1.45], '32': [43.64, 0.58], '33': [44.83, -0.57],
  '34': [43.60, 3.55], '35': [48.09, -1.68], '36': [46.59, 1.58], '37': [47.19, 0.68],
  '38': [45.18, 5.72], '39': [46.73, 5.57], '40': [44.00, -0.69], '41': [47.59, 1.31],
  '42': [45.60, 4.32], '43': [45.12, 3.92], '44': [47.32, -1.70], '45': [47.91, 2.31],
  '46': [44.60, 1.66], '47': [44.35, 0.53], '48': [44.55, 3.48], '49': [47.39, -0.56],
  '50': [49.09, -1.27], '51': [49.05, 4.35], '52': [48.09, 5.32], '53': [48.06, -0.60],
  '54': [48.69, 6.18], '55': [48.89, 5.38], '56': [47.91, -2.77], '57': [49.05, 6.82],
  '58': [47.14, 3.67], '59': [50.52, 3.12], '60': [49.32, 2.52], '61': [48.55, 0.08],
  '62': [50.52, 2.49], '63': [45.73, 3.12], '64': [43.35, -0.78], '65': [43.10, 0.17],
  '66': [42.74, 2.55], '67': [48.58, 7.48], '68': [47.89, 7.26], '69': [45.74, 4.66],
  '70': [47.60, 6.18], '71': [46.52, 4.72], '72': [47.93, 0.20], '73': [45.48, 6.43],
  '74': [46.00, 6.41], '75': [48.86, 2.33], '76': [49.60, 1.10], '77': [48.64, 2.94],
  '78': [48.81, 1.81], '79': [46.50, -0.45], '80': [49.92, 2.31], '81': [43.90, 2.10],
  '82': [44.02, 1.30], '83': [43.39, 6.22], '84': [43.95, 5.29], '85': [46.67, -1.27],
  '86': [46.58, 0.37], '87': [45.82, 1.27], '88': [48.18, 6.47], '89': [47.73, 3.57],
  '90': [47.64, 6.87], '91': [48.52, 2.28], '92': [48.89, 2.22], '93': [48.91, 2.42],
  '94': [48.79, 2.47], '95': [49.08, 2.10], '2A': [41.86, 9.02], '2B': [42.35, 9.25],
};


/**
 * Extract GPS coordinates from FFC race detail page
 * DISABLED: Causes 2+ min load times (fetches every race detail page)
 */
async function extractGpsFromRaceUrl(raceUrl) {
  // Skipped for performance
  return null;
}

function parseFfcRacesFromHtml(html) {
  const races = [];
  const todayStr = new Date().toISOString().split('T')[0];

  // More robust pattern: match entire race blocks (more flexibly)
  const raceBlockRe = /<div[^>]*class="[^"]*race[^"]*|event[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  const titleRe = /<a[^>]*class="[^"]*organisation-titre[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;

  let blockMatch;
  const processedUrls = new Set(); // Deduplicate by URL

  // Strategy 1: Process blocks with nested structure
  while ((blockMatch = raceBlockRe.exec(html)) !== null) {
    const block = blockMatch[1];

    let titleMatch;
    while ((titleMatch = titleRe.exec(block)) !== null) {
      const href = titleMatch[1];
      const titleBlock = titleMatch[2];

      if (processedUrls.has(href)) continue;
      processedUrls.add(href);

      if (/annule|cancel/i.test(titleBlock)) continue;

      // Extract date
      const dateM = titleBlock.match(/organisation-titre-jours[^>]*>\s*([^<]+)\s*<|(\d{2})\/(\d{2})\/(\d{4})/);
      let date;
      if (dateM && dateM[1]) {
        date = parseFfcDate(dateM[1]);
      } else if (dateM && dateM[2]) {
        date = `${dateM[4]}-${dateM[3]}-${dateM[2]}`;
      }
      if (!date || date < todayStr) continue;

      // Extract name
      const nameM = titleBlock.match(/organisation-titre-libelle[^>]*>\s*([^<]+)\s*<|<b[^>]*>\s*([^<]+)\s*</i);
      const name = (nameM?.[1] || nameM?.[2] || '').trim().replace(/\s+/g, ' ');
      if (!name) continue;

      // Extract location
      const locM = titleBlock.match(/organisation-titre-localisation[^>]*>\s*([^<]+)\s*</i);
      const loc = (locM?.[1] || '').replace(/\s+/g, ' ').trim();
      const deptM = loc.match(/\b(\d{2,3})\s*$/);
      const department = deptM ? String(parseInt(deptM[1], 10)).padStart(2, '0') : null;
      const city = loc.replace(/\s*\d{2,3}\s*$/, '').trim() || null;

      // Extract discipline
      const discM = titleBlock.match(/organisation-titre-discipline[^>]*>\s*([^<]+)\s*</i);
      const discipline = discM ? discM[1].trim() : null;

      const url = href.startsWith('http') ? href : `https://competitions.ffc.fr${href}`;

      races.push({
        id: `ffc-${date}-${name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16)}`,
        name: name.replace(/\b\w/g, c => c.toUpperCase()),
        date,
        department,
        city,
        discipline,
        federation: 'FFC',
        category: null,
        url,
        lat: null, // Will be populated by enrichGpsData
        lon: null,
      });
    }
  }

  // Fallback: if we got few races, try simpler regex
  if (races.length < 5) {
    const simpleRe = /href="([^"]*)"[^>]*>([^<]*(?:Cyclo|Route|VTT|Piste|Route|Gravel)[^<]*)<\/a>/gi;
    let simpleMatch;
    const allMatches = [];
    while ((simpleMatch = simpleRe.exec(html)) !== null) {
      const href = simpleMatch[1];
      if (!processedUrls.has(href)) {
        allMatches.push(href);
      }
    }
  }

  return races;
}

/**
 * Enrich races with GPS data ASYNCHRONOUSLY in parallel batches
 * Called in background after races returned to UI (non-blocking)
 */
function enrichGpsDataAsync(races) {
  // Fire and forget - enrich in background
  Promise.resolve().then(async () => {
    const parallel = 3;
    for (let i = 0; i < races.length; i += parallel) {
      const batch = races.slice(i, i + parallel);
      await Promise.all(
        batch.map(async (race) => {
          if (race.lat !== null && race.lon !== null) return; // Already has GPS

          let gps = null;
          if (race.city) {
            const coords = await geocodeCity(race.city, race.department);
            if (coords) {
              race.lat = coords[0];
              race.lon = coords[1];
              return;
            }
          }

          if (!gps && race.department && DEPT_CENTROIDS[race.department]) {
            const [lat, lon] = DEPT_CENTROIDS[race.department];
            race.lat = lat;
            race.lon = lon;
          }
        })
      );
    }
  });
}

/**
 * Quick GPS assignment using only dept centroid (instant)
 */
function assignDefaultGps(races) {
  return races.map(race => ({
    ...race,
    lat: race.lat !== null ? race.lat : (DEPT_CENTROIDS[race.department]?.[0] || null),
    lon: race.lon !== null ? race.lon : (DEPT_CENTROIDS[race.department]?.[1] || null),
  }));
}

async function fetchFfcViaProxy() {
  const fmt = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const today = new Date();
  const fin = new Date(today); fin.setDate(fin.getDate() + 180);
  // No discipline filter → all sports
  const ffcUrl = `https://competitions.ffc.fr/calendrier/calendrier.aspx?debut=${fmt(today)}&fin=${fmt(fin)}`;
  const target = encodeURIComponent(ffcUrl);

  for (const proxy of CORS_PROXIES) {
    try {
      const res = await fetch(proxy.build(target), {
        signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined,
      });
      if (!res.ok) continue;
      const data = proxy.json ? await res.json() : await res.text();
      const html = proxy.extract(data);
      if (html && html.length > 1000) {
        const races = parseFfcRacesFromHtml(html);
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
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(`/api/races?${params}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch { /* fall through */ }

  // 2. CORS proxy fallback (local dev / GitHub Pages)
  const feds = fed ? [fed.toUpperCase()] : ['FFC', 'FSGT', 'UFOLEP', 'FFCT'];
  const fallbackFeds = feds.filter(f => f !== 'FFC');
  const allRaces = [];
  await Promise.allSettled([
    // cyclisme-amateur.com per federation
    ...fallbackFeds.map(f => fetchViaProxy(f).then(r => allRaces.push(...r)).catch(() => { })),
    // FFC official calendar (next 180 days)
    fetchFfcViaProxy().then(r => allRaces.push(...r)).catch(() => { }),
  ]);

  // Assign default GPS (dept centroids) immediately - fast!
  const racesWithDefaultGps = assignDefaultGps(allRaces);

  // Deduplicate by id
  const seen = new Set();
  const unique = racesWithDefaultGps.filter(r => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  unique.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const filtered = unique.filter(r => {
    if (date && r.date !== date) return false;
    if (department && r.department !== department) return false;
    return true;
  });

  // Enrich with better GPS in background (non-blocking)
  enrichGpsDataAsync(filtered);

  return filtered;
}
