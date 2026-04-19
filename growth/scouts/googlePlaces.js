/**
 * googlePlaces.js — Google Places API Scout
 * Finds dental clinics across Saudi cities with phone, rating, website
 * Requires: GOOGLE_PLACES_API_KEY env var (~$5 per 1000 requests)
 */

const https = require('https');

const SAUDI_CITIES = [
  'Riyadh', 'Jeddah', 'Dammam', 'Khobar', 'Mecca', 'Medina',
  'Taif', 'Abha', 'Tabuk', 'Jazan', 'Najran', 'Buraidah', 'Hail', 'Jubail',
];

const SEARCH_QUERIES = [
  'dental clinic',
  'dentist',
  'عيادة أسنان',
];

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'QudozenScout/1.0' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse failed')); }
      });
    }).on('error', reject);
  });
}

function normalizePhone(raw) {
  if (!raw) return null;
  let cleaned = raw.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+966')) return cleaned;
  if (cleaned.startsWith('966'))  return '+' + cleaned;
  if (cleaned.startsWith('0'))    return '+966' + cleaned.substring(1);
  if (cleaned.startsWith('5'))    return '+966' + cleaned;
  return null;
}

function isSaudiMobile(phone) {
  if (!phone) return false;
  const digits = phone.replace('+966', '');
  return ['50','51','53','54','55','56','58','59'].includes(digits.substring(0, 2));
}

function inferPainSignal(place) {
  if (!place.rating || place.rating < 3.5) return 'bad_reviews';
  if (!place.website) return 'no_website';
  if (place.user_ratings_total < 10) return 'slow_response';
  return 'bad_reviews';
}

function calcConfidence(place) {
  let score = 30;
  if (place.formatted_phone_number) score += 20;
  if (!place.website) score += 15;
  if (place.rating && place.rating < 3.8) score += 20;
  if (place.user_ratings_total > 5) score += 10;
  if (place.opening_hours?.open_now === false) score += 5;
  return Math.min(95, score);
}

async function searchPlaces(query, city, apiKey, pageToken = null) {
  const base = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
  const params = new URLSearchParams({
    query:    `${query} in ${city} Saudi Arabia`,
    key:      apiKey,
    language: 'ar',
    region:   'sa',
  });
  if (pageToken) params.set('pagetoken', pageToken);

  const data = await fetchJson(`${base}?${params.toString()}`);
  return data;
}

async function getPlaceDetails(placeId, apiKey) {
  const base = 'https://maps.googleapis.com/maps/api/place/details/json';
  const params = new URLSearchParams({
    place_id: placeId,
    fields:   'name,formatted_phone_number,international_phone_number,website,rating,user_ratings_total,opening_hours,formatted_address',
    key:      apiKey,
    language: 'ar',
  });

  const data = await fetchJson(`${base}?${params.toString()}`);
  return data.result || null;
}

async function runGooglePlacesScout(options = {}) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.log('[googlePlaces.js] GOOGLE_PLACES_API_KEY not set — skipping Places scout');
    return [];
  }

  const cities      = options.cities  || SAUDI_CITIES.slice(0, 5); // Default: top 5 cities
  const queries     = options.queries || SEARCH_QUERIES.slice(0, 2);
  const maxPerCity  = options.maxPerCity || 20;
  const allLeads    = [];
  const seenIds     = new Set();

  console.log(`[googlePlaces.js] Scouting ${cities.length} cities × ${queries.length} queries...`);

  for (const city of cities) {
    for (const query of queries) {
      try {
        console.log(`[googlePlaces.js] Searching: "${query}" in ${city}`);
        const result = await searchPlaces(query, city, apiKey);

        if (result.status !== 'OK' && result.status !== 'ZERO_RESULTS') {
          console.error(`[googlePlaces.js] API error: ${result.status} — ${result.error_message || ''}`);
          continue;
        }

        const places = (result.results || []).slice(0, maxPerCity);

        for (const place of places) {
          if (seenIds.has(place.place_id)) continue;
          seenIds.add(place.place_id);

          // Fetch full details for phone number
          let detail = null;
          try {
            detail = await getPlaceDetails(place.place_id, apiKey);
            // Small delay to avoid rate limiting
            await new Promise(r => setTimeout(r, 150));
          } catch (e) {
            console.error(`[googlePlaces.js] Detail fetch failed for ${place.name}: ${e.message}`);
          }

          const rawPhone = detail?.international_phone_number || detail?.formatted_phone_number;
          const phone    = normalizePhone(rawPhone);
          const isMobile = phone && isSaudiMobile(phone);
          const pain     = inferPainSignal(detail || place);
          const conf     = calcConfidence(detail || place);

          const lead = {
            business_name:  place.name,
            name:           detail?.name || place.name,
            phone:          phone || null,
            city:           city,
            country:        'SA',
            vertical:       'dental',
            pain_signal:    pain,
            pain_details:   [
              place.rating     ? `Rating: ${place.rating}/5 (${place.user_ratings_total} reviews)` : null,
              detail?.website  ? `Website: ${detail.website}` : 'No website found',
              rawPhone         ? `Phone: ${rawPhone}` : 'No phone listed',
            ].filter(Boolean).join(' | '),
            source:          'google_places',
            sources:         ['google_places'],
            status:          phone && isMobile ? 'new' : 'needs_review',
            confidence_score: isMobile ? conf : Math.max(20, conf - 25),
            website_found:   !!(detail?.website),
            website_url:     detail?.website || null,
            raw_input:       `${place.name} | ${city} | ${rawPhone || 'no phone'} | Places ID: ${place.place_id}`,
            created_at:      new Date().toISOString(),
          };

          allLeads.push(lead);
        }

        // Respect rate limits
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        console.error(`[googlePlaces.js] Error for ${query} in ${city}: ${err.message}`);
      }
    }
  }

  const withPhone    = allLeads.filter(l => l.phone && isSaudiMobile(l.phone));
  const withoutPhone = allLeads.filter(l => !l.phone || !isSaudiMobile(l.phone));

  console.log(`[googlePlaces.js] Done: ${allLeads.length} total | ${withPhone.length} with mobile | ${withoutPhone.length} needs review`);
  return allLeads;
}

module.exports = { runGooglePlacesScout };
