/**
 * Smart Parser - Extract structured data from any raw input
 * Handles: Arabic/English, messy formats, multiple separators
 */

function parseRawInput(raw) {
  if (!raw || typeof raw !== 'string') return null;
  
  // Normalize input
  let normalized = raw.trim();
  
  // Convert Arabic numerals to Western
  const arabicToWestern = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
  };
  
  normalized = normalized.replace(/[٠-٩]/g, d => arabicToWestern[d] || d);
  normalized = normalized.replace(/،/g, ',').replace(/؛/g, ';');
  
  // Extract phone number (Saudi patterns)
  const phonePatterns = [
    /(\+966[5][0-9]{8})/,           // +9665XXXXXXXX
    /(966[5][0-9]{8})/,             // 9665XXXXXXXX
    /(05[0-9]{8})/,                 // 05XXXXXXXX
    /(\+?966[1-4][0-9]{8})/,        // Landlines (filter later)
    /(5[0-9]{8})/                   // 5XXXXXXXX (contextual)
  ];
  
  let phone = null;
  for (const pattern of phonePatterns) {
    const match = normalized.match(pattern);
    if (match) {
      phone = normalizePhone(match[1]);
      break;
    }
  }
  
  if (!phone) return null; // No valid phone = reject
  
  // Extract city
  const cityMap = {
    'جازان': 'Jazan', 'الرياض': 'Riyadh', 'جدة': 'Jeddah',
    'مكة': 'Mecca', 'الدمام': 'Dammam', 'المدينة': 'Medina',
    'أبها': 'Abha', 'تبوك': 'Tabuk', 'الخبر': 'Khobar',
    'Jazan': 'Jazan', 'Riyadh': 'Riyadh', 'Jeddah': 'Jeddah',
    'Mecca': 'Mecca', 'Dammam': 'Dammam', 'Medina': 'Medina'
  };
  
  let city = 'Unknown';
  for (const [ar, en] of Object.entries(cityMap)) {
    if (normalized.includes(ar) || normalized.toLowerCase().includes(en.toLowerCase())) {
      city = en;
      break;
    }
  }
  
  // Extract business name
  let name = extractBusinessName(normalized, phone);
  
  // Detect pain signals from input context
  const painSignals = detectPainFromInput(normalized);
  
  return {
    phone,
    name,
    city,
    raw: raw.trim(),
    painHints: painSignals,
    parsedAt: new Date().toISOString()
  };
}

function normalizePhone(phone) {
  let cleaned = phone.replace(/\D/g, '');
  
  // Remove leading 0, add 966
  if (cleaned.startsWith('0')) {
    cleaned = '966' + cleaned.slice(1);
  }
  
  // Ensure + prefix
  if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  
  return cleaned;
}

function extractBusinessName(text, phone) {
  // Remove phone number from text
  let withoutPhone = text.replace(phone, '').replace(phone.replace('+', ''), '');
  
  // Common patterns
  const patterns = [
    /(?:عيادة|مستشفى|مركز| dental|clinic|medical|hospital)\s*([^,0-9]{3,40})/i,
    /^([^,0-9]{3,40})(?:,|،|;|؛|$)/,
    /([^,0-9]{3,40})(?:\s*[-,]\s*(?:جازان|الرياض|جدة|Jazan|Riyadh|Jeddah))/i
  ];
  
  for (const pattern of patterns) {
    const match = withoutPhone.match(pattern);
    if (match && match[1].trim().length > 3) {
      return cleanName(match[1].trim());
    }
  }
  
  // Fallback: first segment before number or comma
  const fallback = withoutPhone.split(/[0-9,،;؛]/)[0].trim();
  return fallback.length > 3 ? cleanName(fallback) : 'Unknown Clinic';
}

function cleanName(name) {
  return name
    .replace(/^(د\.|دكتور|Dr\.|Doctor|عيادة|مستشفى|clinic|dental)\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 50);
}

function detectPainFromInput(text) {
  const signals = [];
  const lower = text.toLowerCase();
  
  if (/استقبال|receptionist|موظف|hiring|وظيفة|job/.test(lower)) {
    signals.push('hiring_receptionist');
  }
  if (/تقييم|review|شكوى|complaint|رد|response/.test(lower)) {
    signals.push('bad_reviews');
  }
  if (/حجز|booking|موعد|appointment|online/.test(lower)) {
    signals.push('no_booking_system');
  }
  if (/مكالمة|call|هاتف|phone|رد|answer/.test(lower)) {
    signals.push('missed_calls');
  }
  
  return signals;
}

module.exports = { parseRawInput, normalizePhone };
