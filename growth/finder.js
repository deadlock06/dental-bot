/**
 * finder.js
 * Lead Discovery — Anti-Gravity Growth Swarm
 */

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
  const prefix = digits.substring(0, 2);
  return ['50', '51', '53', '54', '55', '56', '58', '59'].includes(prefix);
}

function scoreLead({ hasBadReviews, isHiring, hasNoWebsite, responseTimeHours }) {
  let score = 0;
  if (hasBadReviews)         score += 30;
  if (isHiring)              score += 35;
  if (hasNoWebsite)          score += 20;
  if (responseTimeHours > 4) score += 15;
  return Math.min(100, score);
}

function parseGoogleMapsText(rawText) {
  const leads = [];
  const lines = rawText.split('\n').filter(l => l.trim());

  for (const line of lines) {
    const phoneMatch = line.match(/(\+?966\d{9}|0\d{9}|5\d{8})/);
    if (phoneMatch) {
      const normalized = normalizePhone(phoneMatch[0]);
      if (normalized && isSaudiMobile(normalized)) {
        leads.push({ phone: normalized, rawText: line, source: 'google_maps_paste' });
      }
    }
  }

  console.log(`[finder.js] parseGoogleMapsText: found ${leads.length} mobile leads`);
  return leads;
}

async function scrapeGoogleMaps(query, city) {
  console.log(`[finder.js] scrapeGoogleMaps not yet implemented — query: "${query}", city: ${city}`);
  return [];
}

async function scrapeInstagram(hashtag, city) {
  console.log(`[finder.js] scrapeInstagram not yet implemented — hashtag: ${hashtag}, city: ${city}`);
  return [];
}

module.exports = { normalizePhone, isSaudiMobile, scoreLead, parseGoogleMapsText, scrapeGoogleMaps, scrapeInstagram };
