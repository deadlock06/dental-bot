/**
 * jobPortals.js — Multi-Portal Job Scout
 * Scrapes Indeed SA + Bayt + GulfTalent + Naukrigulf RSS/HTML
 * Returns structured leads with pain_signal = 'hiring_receptionist'
 */

const https = require('https');
const http  = require('http');

const PORTALS = [
  {
    name:    'indeed_sa',
    url:     'https://rss.indeed.com/rss?q=dental+receptionist&l=Saudi+Arabia&sort=date',
    parser:  parseIndeedRSS,
  },
  {
    name:    'indeed_sa_ar',
    url:     'https://rss.indeed.com/rss?q=%D9%85%D9%88%D8%B8%D9%81+%D8%A7%D8%B3%D8%AA%D9%82%D8%A8%D8%A7%D9%84+%D8%A3%D8%B3%D9%86%D8%A7%D9%86&l=Saudi+Arabia&sort=date',
    parser:  parseIndeedRSS,
  },
  {
    name:    'bayt',
    url:     'https://www.bayt.com/en/rss/saudi-arabia-jobs/dental-receptionist-jobs/',
    parser:  parseGenericRSS,
  },
  {
    name:    'naukrigulf',
    url:     'https://www.naukrigulf.com/dental-receptionist-jobs-in-saudi-arabia',
    parser:  parseNaukrigulf,
  },
];

const SAUDI_CITIES = [
  'Riyadh','Jeddah','Dammam','Khobar','Mecca','Medina','Taif',
  'Abha','Tabuk','Jazan','Najran','Buraidah','Hail','Jubail',
  'الرياض','جدة','الدمام','مكة','المدينة','الطائف','أبها','تبوك','جازان',
];

function fetchUrl(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; QudozenBot/1.0; +https://qudozen.com)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, timeoutMs).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
  });
}

function extractCity(text) {
  for (const city of SAUDI_CITIES) {
    if (text && text.toLowerCase().includes(city.toLowerCase())) return city;
  }
  return null;
}

function extractCompany(text) {
  const m = text?.match(/<company>(.*?)<\/company>/i) ||
            text?.match(/at\s+([A-Z][^,\n<]+(?:Clinic|Dental|Medical|Centre|Center|Hospital))/i) ||
            text?.match(/([A-Z][^\n<,]{3,40}(?:عيادة|كلينك|dental|clinic))/i);
  return m ? m[1].trim() : null;
}

function calcTimingScore(dateStr) {
  if (!dateStr) return 50;
  const posted = new Date(dateStr);
  const daysAgo = (Date.now() - posted) / (1000 * 60 * 60 * 24);
  if (daysAgo <= 1)  return 100;
  if (daysAgo <= 3)  return 85;
  if (daysAgo <= 7)  return 70;
  if (daysAgo <= 14) return 50;
  return 30;
}

function parseIndeedRSS(xml, portalName) {
  const leads = [];
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];

  for (const item of items) {
    const title   = item.match(/<title><!\[CDATA\[(.*?)\]\]>/)?.[1] || item.match(/<title>(.*?)<\/title>/)?.[1] || '';
    const desc    = item.match(/<description><!\[CDATA\[(.*?)\]\]>/)?.[1] || item.match(/<description>(.*?)<\/description>/)?.[1] || '';
    const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
    const link    = item.match(/<link>(.*?)<\/link>/)?.[1] || '';

    const isDental = /dental|dentist|أسنان|طب أسنان/i.test(title + desc);
    if (!isDental) continue;

    const company = extractCompany(title) || extractCompany(desc) ||
                    title.split(' - ')[1]?.trim() || title.split(' at ')[1]?.trim();
    const city    = extractCity(title) || extractCity(desc);
    const timing  = calcTimingScore(pubDate);

    if (!company) continue;

    leads.push({
      business_name:  company,
      name:           company,
      city:           city || 'Saudi Arabia',
      pain_signal:    'hiring_receptionist',
      pain_details:   `Job posting: ${title.substring(0, 120)}`,
      source:         portalName,
      sources:        [portalName],
      status:         'new',
      vertical:       'dental',
      country:        'SA',
      confidence_score: Math.min(90, 40 + timing * 0.5),
      timing_score:   timing,
      raw_input:      `${title} | ${link}`.substring(0, 500),
      posted_at:      pubDate ? new Date(pubDate).toISOString() : null,
    });
  }

  console.log(`[jobPortals.js] ${portalName}: parsed ${leads.length} dental leads`);
  return leads;
}

function parseGenericRSS(xml, portalName) {
  return parseIndeedRSS(xml, portalName);
}

function parseNaukrigulf(html, portalName) {
  const leads = [];
  const blocks = html.match(/class="ni-job-tuple[^"]*"[\s\S]*?(?=class="ni-job-tuple|<\/ul>)/g) || [];

  for (const block of blocks.slice(0, 15)) {
    const title   = block.match(/job-title[^>]*>([^<]+)/)?.[1]?.trim() || '';
    const company = block.match(/comp-name[^>]*>([^<]+)/)?.[1]?.trim() || '';
    const city    = block.match(/loc[^>]*>([^<]+)/)?.[1]?.trim() || '';

    const isDental = /dental|dentist|أسنان/i.test(title + company);
    if (!isDental || !company) continue;

    leads.push({
      business_name:  company,
      name:           company,
      city:           extractCity(city) || 'Saudi Arabia',
      pain_signal:    'hiring_receptionist',
      pain_details:   `Naukrigulf job: ${title}`,
      source:         portalName,
      sources:        [portalName],
      status:         'new',
      vertical:       'dental',
      country:        'SA',
      confidence_score: 55,
      timing_score:   60,
      raw_input:      `${title} at ${company} — ${city}`,
      posted_at:      new Date().toISOString(),
    });
  }

  console.log(`[jobPortals.js] ${portalName}: parsed ${leads.length} dental leads`);
  return leads;
}

async function runJobPortalScout() {
  console.log('[jobPortals.js] Starting multi-portal scout...');
  const allLeads = [];

  for (const portal of PORTALS) {
    try {
      console.log(`[jobPortals.js] Fetching ${portal.name}...`);
      const content = await fetchUrl(portal.url);
      const leads   = portal.parser(content, portal.name);
      allLeads.push(...leads);
    } catch (err) {
      console.error(`[jobPortals.js] ${portal.name} failed: ${err.message}`);
    }
  }

  // Deduplicate by business_name within this batch
  const seen = new Set();
  const unique = allLeads.filter(l => {
    const key = l.business_name.toLowerCase().replace(/\s+/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`[jobPortals.js] Total unique leads: ${unique.length} (from ${allLeads.length} raw)`);
  return unique;
}

module.exports = { runJobPortalScout };
