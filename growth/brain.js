require('dotenv').config();
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

const ARABIC_CITIES = ['جازان','مكة','المدينة','أبها','تبوك','نجران','Jazan','Mecca','Medina','Abha','Tabuk','Najran', 'Riyadh', 'Jeddah', 'الرياض', 'جدة'];
const ARABIC_REGEX = /[\u0600-\u06FF]/;

const BANNED_WORDS = ['buy', 'discount', 'offer', 'guarantee', 'cheap', 'click', 'link', 'subscribe', 'promotion', 'free trial'];

function detectLanguage(lead) {
  const city = lead.city || '';
  const name = lead.company_name || lead.business_name || '';
  
  if (ARABIC_CITIES.some(c => city.toLowerCase().includes(c.toLowerCase()))) return 'ar';
  if (name.startsWith('Al ') || name.startsWith('Al-') || ARABIC_REGEX.test(name)) return 'ar';
  
  return 'ar'; // Default Saudi market
}

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

function applyGuardrails(message) {
  // Max 320 chars
  if (message.length > 320) {
    message = message.substring(0, 315) + '...';
  }
  
  // No links in first message (remove http://, https://, www.)
  message = message.replace(/https?:\/\/[^\s]+/gi, '');
  message = message.replace(/www\.[^\s]+/gi, '');
  
  // Remove emojis
  message = message.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
  
  // Basic banned words check (case insensitive)
  const lowerMsg = message.toLowerCase();
  for (const word of BANNED_WORDS) {
    if (lowerMsg.includes(word)) {
      const regex = new RegExp(word, 'gi');
      message = message.replace(regex, '');
    }
  }

  // Ensure ends with question before signature
  let parts = message.split('\n\n-');
  let body = parts[0].trim();
  if (!body.endsWith('?') && !body.endsWith('؟')) {
    body += (body.match(ARABIC_REGEX) ? '؟' : '?');
  }

  // Enforce signature
  let signature = '-جيك';
  if (parts.length > 1 && parts[1].toLowerCase().includes('jake')) {
      signature = '-Jake';
  } else if (!message.match(ARABIC_REGEX)) {
      signature = '-Jake';
  }

  return `${body}\n\n${signature}`;
}

async function generateHyperPersonalizedMessage(lead) {
  try {
    const lang = detectLanguage(lead);
    
    // Extract intelligence
    const company = lead.company_name || lead.business_name || (lang === 'ar' ? 'عيادتك' : 'your clinic');
    const owner = lead.owner_name || lead.name || 'دكتور';
    
    // Determine target pain point template
    let painType = 'no_booking_system'; // default
    if (lead.is_hiring && lead.hiring_roles && lead.hiring_roles.some(r => /receptionist|front desk/i.test(r))) {
      painType = 'hiring_receptionist';
    } else if (lead.google_rating && lead.google_rating < 4.0) {
      painType = 'low_google_rating';
    } else if (lead.has_negative_reviews) {
      painType = 'negative_reviews';
    } else if (lead.instagram_last_post_date) {
      const days = Math.floor((Date.now() - new Date(lead.instagram_last_post_date).getTime()) / 86400000);
      if (days > 60) painType = 'inactive_social';
    }

    const systemPrompt = `You are Jake, an AI growth consultant for Qudozen. You are writing a cold WhatsApp outreach message to a clinic owner.
Use the PAS (Problem, Agitate, Solution) formula.

LEAD INTELLIGENCE:
- Clinic: ${company}
- Owner: ${owner}
- Target Pain Point: ${painType}

PAIN TEMPLATE GUIDANCE:
- hiring_receptionist: Notice they are hiring. Agitate that human receptionists miss after-hours calls.
- low_google_rating: Notice the rating. Agitate that new patients are choosing competitors.
- no_booking_system: Notice no easy way to book online. Agitate the friction for patients.
- negative_reviews: Notice reviews mentioning wait times/no response. Agitate the lost revenue.
- inactive_social: Notice abandoned social media. Agitate that they are invisible online.

STRICT WHATSAPP CONSTRAINTS:
1. Max 320 characters total.
2. NO links in this message.
3. NO emojis. None.
4. NO promotional language (no "buy", "offer", "discount").
5. ALWAYS end the body with a question (e.g. "Can I show you how to fix this?").
6. ALWAYS sign off with "-جيك".
7. Language: ${lang === 'ar' ? 'Arabic (Saudi dialect, casual professional)' : 'English'}

Write the message now.`;

    const { wrapAI } = require('../lib/resilience');
    const resData = await wrapAI(async () => {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }],
        temperature: 0.7,
        max_tokens: 150
      });
      return response;
    }, "FALLBACK");

    if (resData === "FALLBACK") {
      return applyGuardrails(fallbackTemplate(lead));
    }

    let msg = resData.choices[0].message.content.trim();
    msg = applyGuardrails(msg);
    
    console.log(`[brain] 🧠 Generated personalized PAS message for ${company}:\n${msg}`);
    return msg;

  } catch (err) {
    console.error('[brain] ❌ GPT generation failed, falling back to template:', err.message);
    return applyGuardrails(fallbackTemplate(lead));
  }
}

function fallbackTemplate(lead) {
  const lang = detectLanguage(lead);
  const name = lead.owner_name || lead.name || '';
  const company = lead.company_name || lead.business_name || (lang === 'ar' ? 'العيادة' : 'your clinic');

  if (lang === 'ar') {
    return `مرحباً دكتور ${name}، لاحظت أن مرضى ${company} يعانون من تأخر الرد على الواتساب ويذهبون للمنافسين. هل ترغب في رؤية كيف يمكنك حل هذه المشكلة نهائياً؟\n\n-جيك`;
  } else {
    return `Hi Dr. ${name}, I noticed patients at ${company} might be slipping away to competitors due to delayed WhatsApp replies. Would you be open to seeing a permanent fix?\n\n-Jake`;
  }
}

async function generateMessage(lead) {
  return await generateHyperPersonalizedMessage(lead);
}

module.exports = { 
  generateMessage, 
  generateHyperPersonalizedMessage,
  getGhostRoomUrl, 
  detectLanguage,
  applyGuardrails
};
