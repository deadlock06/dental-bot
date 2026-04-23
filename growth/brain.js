require('dotenv').config();
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

const ARABIC_CITIES = ['جازان','مكة','المدينة','أبها','تبوك','نجران','Jazan','Mecca','Medina','Abha','Tabuk','Najran', 'Riyadh', 'Jeddah', 'الرياض', 'جدة'];
const ARABIC_REGEX = /[\u0600-\u06FF]/;

// ─────────────────────────────────────────────
// Language Detection
// ─────────────────────────────────────────────

function detectLanguage(lead) {
  const city = lead.city || '';
  const name = lead.company_name || lead.business_name || '';
  
  if (ARABIC_CITIES.some(c => city.toLowerCase().includes(c.toLowerCase()))) return 'ar';
  if (name.startsWith('Al ') || name.startsWith('Al-') || ARABIC_REGEX.test(name)) return 'ar';
  
  return 'ar'; // Default Saudi market
}

// ─────────────────────────────────────────────
// Ghost Room URL Generator
// ─────────────────────────────────────────────

function getGhostRoomUrl(lead) {
  const base = (process.env.BASE_URL || 'https://qudozen.com').replace(/\/$/, '');
  
  // Use the top pain signal or a default
  let primaryPain = 'bad_reviews';
  if (lead.pain_signals && lead.pain_signals.length > 0) {
    primaryPain = lead.pain_signals[0].type;
  } else if (lead.pain_signal) {
    primaryPain = lead.pain_signal;
  }

  const qs = new URLSearchParams({
    name: encodeURIComponent(lead.owner_name || lead.name || 'Doctor'),
    clinic: encodeURIComponent(lead.company_name || lead.business_name || 'Clinic'),
    city: encodeURIComponent(lead.city || 'your city'),
    pain: primaryPain
  });
  return `${base}/growth/room?${qs.toString()}`;
}

// ─────────────────────────────────────────────
// Hyper-Personalized Message Generation (GPT)
// ─────────────────────────────────────────────

async function generateHyperPersonalizedMessage(lead) {
  try {
    const lang = detectLanguage(lead);
    const url = getGhostRoomUrl(lead);
    
    // Extract intelligence
    const company = lead.company_name || lead.business_name || 'your clinic';
    const owner = lead.owner_name || lead.name || 'Doctor';
    const city = lead.city || 'your area';
    const rating = lead.google_rating ? `${lead.google_rating}/5` : 'unknown';
    
    let painContext = '';
    if (lead.pain_signals && lead.pain_signals.length > 0) {
      painContext = lead.pain_signals.map(s => `- ${s.detail}`).join('\n');
    }

    const systemPrompt = `You are Jake, an AI growth consultant for Qudozen (an AI business OS).
You are writing a cold WhatsApp outreach message to a clinic owner.

LEAD INTELLIGENCE:
- Clinic: ${company}
- Owner: ${owner}
- City: ${city}
- Google Rating: ${rating}
- Pain Signals Detected:
${painContext || '- General clinic operations (assumed)'}

RULES:
1. MUST be extremely short (under 40 words).
2. MUST sound like a real human texting (casual, no emojis except maybe one, no corporate speak).
3. MUST reference ONE specific pain signal if available (e.g. "saw you're hiring a receptionist", "noticed a recent review about wait times", "saw your site doesn't have online booking").
4. MUST include this exact link at the end: ${url}
5. Sign off with "- Jake" (or "- جيك" in Arabic).
6. Language: ${lang === 'ar' ? 'Arabic (Saudi dialect, professional but casual)' : 'English'}
7. DO NOT use generic greetings like "Dear". Use "Hi Dr. [Name]" or "مرحباً دكتور [Name]".

Write the message now.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }],
      temperature: 0.7,
      max_tokens: 150
    });

    const msg = response.choices[0].message.content.trim();
    console.log(`[brain] 🧠 Generated personalized message for ${company}:\n${msg}`);
    return msg;

  } catch (err) {
    console.error('[brain] ❌ GPT generation failed, falling back to template:', err.message);
    return fallbackTemplate(lead);
  }
}

// ─────────────────────────────────────────────
// Fallback Templates (if API fails)
// ─────────────────────────────────────────────

function fallbackTemplate(lead) {
  const lang = detectLanguage(lead);
  const url = getGhostRoomUrl(lead);
  const name = lead.owner_name || lead.name || '';
  const company = lead.company_name || lead.business_name || (lang === 'ar' ? 'العيادة' : 'your clinic');

  if (lang === 'ar') {
    return `مرحباً دكتور ${name}، مرضى ${company} يذهبون للمنافسين بسبب تأخر الرد على الواتساب. هل تعلم كم تكلفك هذه الساعات شهرياً؟ اكتشف هنا: ${url} -جيك`;
  } else {
    return `Hi Dr. ${name}, missed calls and slow WhatsApp replies at ${company} are sending patients to competitors. Want to see the exact numbers on what you're losing? ${url} -Jake`;
  }
}

// ─────────────────────────────────────────────
// Legacy Wrapper (for backwards compatibility)
// ─────────────────────────────────────────────

async function generateMessage(lead) {
  // If we have full GS 3.0 lead object, use hyper-personalized
  if (lead.company_name || lead.pain_signals) {
    return await generateHyperPersonalizedMessage(lead);
  }
  // Otherwise use fallback (for old tests)
  return fallbackTemplate(lead);
}

module.exports = { 
  generateMessage, 
  generateHyperPersonalizedMessage,
  getGhostRoomUrl, 
  detectLanguage 
};
