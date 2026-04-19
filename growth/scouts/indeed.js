/**
 * Indeed.sa RSS Scout
 * Fetches dental receptionist jobs automatically
 */

const axios = require('axios');
const xml2js = require('xml2js');

const SAUDI_CITIES = [
  { name: 'Jazan', arabic: 'جازان', indeedCode: 'jazan' },
  { name: 'Riyadh', arabic: 'الرياض', indeedCode: 'riyadh' },
  { name: 'Jeddah', arabic: 'جدة', indeedCode: 'jeddah' },
  { name: 'Mecca', arabic: 'مكة', indeedCode: 'mecca' },
  { name: 'Dammam', arabic: 'الدمام', indeedCode: 'dammam' },
  { name: 'Medina', arabic: 'المدينة', indeedCode: 'medina' }
];

const VERTICAL_SEARCH_TERMS = {
  dental:      ['استقبال عيادة أسنان', 'سكرتيرة عيادة أسنان', 'receptionist dental clinic'],
  physio:      ['استقبال مركز علاج طبيعي', 'موظف استقبال علاج طبيعي', 'receptionist physiotherapy'],
  dermatology: ['استقبال عيادة جلدية', 'سكرتيرة عيادة تجميل', 'receptionist skin clinic'],
  general:     ['استقبال طبي', 'استقبال مجمع طبي', 'medical receptionist']
};

/**
 * Fetch jobs from Indeed.sa RSS feed
 */
async function fetchIndeedJobs(cityCode = 'jazan', searchTerm = 'استقبال عيادة أسنان') {
  try {
    const encodedSearch = encodeURIComponent(searchTerm);
    const rssUrl = `https://sa.indeed.com/rss?q=${encodedSearch}&l=${cityCode}`;
    
    const response = await axios.get(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml'
      },
      timeout: 15000
    });
    
    const parsed = await xml2js.parseStringPromise(response.data, {
      explicitArray: false,
      mergeAttrs: true
    });
    
    const items = parsed?.rss?.channel?.item || [];
    const jobs = Array.isArray(items) ? items : [items].filter(Boolean);
    
    return jobs.map(parseIndeedJob).filter(Boolean);
    
  } catch (error) {
    console.error('[Indeed] Fetch failed:', error.message);
    return [];
  }
}

function parseIndeedJob(item) {
  try {
    const title = item.title || '';
    const description = item.description || '';
    const link = item.link || '';
    const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
    const company = extractCompanyFromTitle(title);
    
    if (!company) return null;
    
    const daysAgo = Math.floor((Date.now() - pubDate.getTime()) / (1000 * 60 * 60 * 24));
    
    return {
      source: 'indeed',
      company,
      title: cleanHtml(title),
      description: cleanHtml(description).substring(0, 200),
      url: link,
      postedAt: pubDate.toISOString(),
      daysAgo,
      isRecent: daysAgo <= 7,
      painSignal: 'hiring_receptionist',
      timingScore: daysAgo <= 3 ? 20 : daysAgo <= 7 ? 15 : daysAgo <= 14 ? 10 : 5
    };
    
  } catch (e) {
    console.error('[Indeed] Parse error:', e.message);
    return null;
  }
}

function extractCompanyFromTitle(title) {
  // Pattern: "Job Title - Company Name - Indeed"
  const match = title.match(/-\s*([^-]+?)\s*-?\s*Indeed/i);
  if (match) return match[1].trim();
  
  // Pattern: "Company Name: Job Title"
  const altMatch = title.match(/^([^:]+):\s*/);
  if (altMatch) return altMatch[1].trim();
  
  return title.split('-')[0]?.trim();
}

function cleanHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Run full scout for all cities
 */
async function runIndeedScout(vertical = 'dental') {
  const allJobs = [];
  const searchTerms = VERTICAL_SEARCH_TERMS[vertical] || VERTICAL_SEARCH_TERMS.dental;
  
  for (const city of SAUDI_CITIES.slice(0, 3)) { // Start with top 3 cities
    console.log(`[Indeed] Scanning ${city.arabic} for ${vertical}...`);
    
    for (const term of searchTerms.slice(0, 2)) {
      const jobs = await fetchIndeedJobs(city.indeedCode, term);
      allJobs.push(...jobs.map(j => ({ ...j, city: city.name, cityArabic: city.arabic })));
      
      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Deduplicate by company name
  const seen = new Set();
  const unique = allJobs.filter(job => {
    const key = job.company.toLowerCase().replace(/\s+/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  
  return unique;
}

module.exports = {
  fetchIndeedJobs,
  runIndeedScout,
  SAUDI_CITIES
};
