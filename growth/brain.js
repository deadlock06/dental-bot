require('dotenv').config();
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY || 'fake-key-for-test' });

const ARABIC_CITIES = ['جازان','مكة','المدينة','أبها','تبوك','نجران','Jazan','Mecca','Medina','Abha','Tabuk','Najran'];
const ARABIC_REGEX = /[\u0600-\u06FF]/;

function detectLanguage(lead) {
  const city = lead.city || '';
  const name = lead.business_name || lead.business || '';
  
  if (ARABIC_CITIES.some(c => city.toLowerCase().includes(c.toLowerCase()))) return 'ar';
  if (name.startsWith('Al ') || name.startsWith('Al-') || ARABIC_REGEX.test(name)) return 'ar';
  
  return 'ar'; // Default Saudi market
}

function calculateHeatScore(lead) {
  const pain = lead.pain || lead.pain_signal || 'bad_reviews';
  const heatMap = { slow_response: 10, bad_reviews: 9, hiring_receptionist: 8, no_website: 7 };
  return heatMap[pain] || 5;
}

function getGhostRoomUrl(lead) {
  const base = (process.env.BASE_URL || 'https://qudozen.com').replace(/\/$/, '');
  const qs = new URLSearchParams({
    name: encodeURIComponent(lead.website_owner_name || lead.name || ''),
    clinic: encodeURIComponent(lead.business_name || lead.business || ''),
    city: encodeURIComponent(lead.city || ''),
    pain: lead.pain_signal || lead.pain || 'bad_reviews',
  });
  return `${base}/growth/room?${qs.toString()}`;
}

const AR_TEMPLATES = {
  bad_reviews: (lead, url) =>
    `دكتور ${lead.name || ''}، مراجعين ${lead.business_name || 'العيادة'} يبحثون عن عيادة ترد على رسائلهم بسرعة. لو عيادتك كانت أول من يرد — كم مريض كنت ستكسب هذا الشهر؟ ${url} -جيك`,
  hiring_receptionist: (lead, url) =>
    `دكتور ${lead.name || ''}، كلما استأجرت موظفة استقبال جديدة — تدربها، ثم تترك. الذكاء الاصطناعي لا يغادر أبداً. جرب بنفسك؟ ${url} -جيك`,
  slow_response: (lead, url) =>
    `دكتور ${lead.name || ''}، ${lead.business_name || 'العيادة'} تخسر مراجعين كل ساعة بسبب التأخر في الرد. هل تعلم كم تكلفك هذه الساعات شهرياً؟ اكتشف هنا: ${url} -جيك`,
  no_website: (lead, url) =>
    `دكتور ${lead.name || ''}، لاحظت أن مرضاك في ${lead.city || 'المدينة'} يذهبون لمنافسيك لعدم توفرك بالبحث. كم مريض تخسر يومياً؟ ${url} -جيك`
};

const EN_TEMPLATES = {
  bad_reviews: (lead, url) =>
    `Dr. ${lead.name || ''}, every hour ${lead.business_name || "your clinic"} doesn't reply to a WhatsApp message, a patient books with your competitor instead. Want to see exactly how much that's costing you? ${url} -Jake`,
  hiring_receptionist: (lead, url) =>
    `Dr. ${lead.name || ''}, notice how receptionists need constant training before they quit? What if an AI handled everything 24/7 without leaving? Want to see how? ${url} -Jake`,
  slow_response: (lead, url) =>
    `Dr. ${lead.name || ''}, your missed calls and slow responses are sending patients directly to competitors. Want to see the exact numbers on what you're losing? ${url} -Jake`,
  no_website: (lead, url) =>
    `Dr. ${lead.name || ''}, patients searching in ${lead.city || 'your area'} are finding competitors instead of you. What if fixing this was entirely automated? ${url} -Jake`
};

function generateMessage(lead) {
  const lang = detectLanguage(lead);
  const pain = lead.pain || lead.pain_signal || 'bad_reviews';
  const url = getGhostRoomUrl(lead);
  
  const templates = lang === 'ar' ? AR_TEMPLATES : EN_TEMPLATES;
  const generate = templates[pain] || templates.bad_reviews;
  
  return generate(lead, url);
}

module.exports = { generateMessage, getGhostRoomUrl, detectLanguage, calculateHeatScore };
