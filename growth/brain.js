/**
 * brain.js — Anti-Gravity V2.5
 * Elite bilingual outreach engine
 */

const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

const ARABIC_CITIES = ['جازان','مكة','المدينة','أبها','تبوك','نجران','بريدة','الطائف',
  'Jazan','Mecca','Medina','Abha','Tabuk','Najran','Buraidah','Taif'];

const ARABIC_REGEX = /[\u0600-\u06FF]/;

function detectLanguage(lead) {
  const city = lead.city || '';
  const name = lead.business_name || '';
  if (ARABIC_REGEX.test(name)) return 'ar';
  if (ARABIC_CITIES.some(c => city.toLowerCase().includes(c.toLowerCase()))) return 'ar';
  if (name.startsWith('Al ') || name.startsWith('Al-')) return 'ar';
  return 'ar'; // Saudi market default
}

function buildGhostRoomUrl(lead) {
  const base = (process.env.BASE_URL || 'https://dental-bot-evpe.onrender.com').replace(/\/$/, '');
  const qs = new URLSearchParams({
    name:   lead.website_owner_name || lead.name || '',
    clinic: lead.business_name || '',
    city:   lead.city || '',
    pain:   lead.pain_signal || 'bad_reviews',
  });
  return `${base}/growth/room?${qs.toString()}`;
}

const AR_TEMPLATES = {
  bad_reviews: (lead, url) =>
    `كم مريضاً خسرته ${lead.business_name || 'عيادتك'} هذا الشهر بسبب ردود الفعل البطيئة؟ الأرقام ستصدمك — ${url} -جيك`,
  hiring_receptionist: (lead, url) =>
    `رأيت أن ${lead.business_name || 'عيادتك'} تبحث عن موظف استقبال — هل تعلم أن الذكاء الاصطناعي يرد على المرضى في 3 ثوانٍ على مدار الساعة بـ 299 ريال فقط؟ ${url} -جيك`,
  slow_response: (lead, url) =>
    `${lead.name || 'دكتور'}، كم مريضاً اتصل بـ${lead.business_name || 'عيادتك'} ولم يجد رداً فذهب لمنافس؟ الرقم الحقيقي هنا — ${url} -جيك`,
  no_website: (lead, url) =>
    `${lead.name || 'دكتور'}، ${lead.business_name || 'عيادتك'} غير موجودة على الإنترنت — يعني كل مريض يبحث عن طبيب أسنان في ${lead.city || 'مدينتك'} لن يجدك. هل تريد معرفة كم تخسر؟ ${url} -جيك`,
};

const EN_TEMPLATES = {
  bad_reviews: (lead, url) =>
    `How many patients has ${lead.business_name || 'your clinic'} lost this month to slow responses — have you ever calculated the number? ${url} -Jake`,
  hiring_receptionist: (lead, url) =>
    `Noticed ${lead.business_name || 'your clinic'} is hiring a receptionist — what if an AI answered 24/7 for 299 SAR instead of monthly salary + benefits? ${url} -Jake`,
  slow_response: (lead, url) =>
    `Dr. ${lead.name || ''}, every hour ${lead.business_name || 'your clinic'} takes to reply is a patient deciding on your competitor — want to see the exact number? ${url} -Jake`,
  no_website: (lead, url) =>
    `${lead.business_name || 'Your clinic'} doesn't appear online — every patient searching for a dentist in ${lead.city || 'your city'} finds your competitor instead. Curious how much that costs? ${url} -Jake`,
};

function fallbackMessage(lead) {
  const lang = detectLanguage(lead);
  const url = buildGhostRoomUrl(lead);
  const pain = lead.pain_signal || 'bad_reviews';
  const templates = lang === 'ar' ? AR_TEMPLATES : EN_TEMPLATES;
  const fn = templates[pain] || templates.bad_reviews;
  console.log(`[brain.js] Fallback message (${lang}) for pain: ${pain}`);
  return fn(lead, url);
}

async function generateMessage(lead) {
  const lang = detectLanguage(lead);
  const url = buildGhostRoomUrl(lead);
  const pain = lead.pain_signal || 'bad_reviews';
  const sig = lang === 'ar' ? '-جيك' : '-Jake';

  const systemPrompt = lang === 'ar'
    ? `أنت جيك، متخصص في التواصل مع عيادات الأسنان السعودية لعرض مساعد استقبال يعمل بالذكاء الاصطناعي من Qudozen.
القواعد:
- جملة واحدة فقط (جملتان إذا ضرورة قصوى).
- افتح بفجوة فضول — لا تبدأ بـ"مرحبا" العادية.
- اذكر نقطة الألم بتفصيل محدد.
- استخدم تأثير الخسارة ("تخسر مرضى").
- انتهِ بسؤال مفتوح (ليس نعم/لا).
- وقّع بـ${sig} في النهاية.
- أقل من 300 حرف.
- لا تكن روبوتياً.`
    : `You are Jake, outreach specialist for Qudozen AI dental receptionist in Saudi Arabia.
Rules:
- ONE sentence (two max if essential).
- Open with a curiosity gap — NOT "Hi I wanted to reach out".
- Mention their specific pain with exact detail.
- Use loss aversion ("you're losing patients").
- End with an open question (not yes/no).
- Sign ${sig} at the end.
- Under 300 characters.
- Sound human, not robotic.`;

  const userPrompt = `Lead: ${lead.name || 'Doctor'} at ${lead.business_name || 'clinic'}, ${lead.city || 'Saudi Arabia'}
Pain: ${pain} — ${lead.pain_details || 'no extra details'}
Include this URL at the end: ${url}
Write the message now:`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 150,
      temperature: 0.75,
    });

    let message = response.choices[0].message.content.trim();
    if (!message.includes(sig)) message += ` ${sig}`;
    if (!message.includes('room?')) message += ` ${url}`;

    console.log(`[brain.js] Generated (${lang}) for ${lead.name}: ${message.substring(0, 60)}...`);
    return message;
  } catch (err) {
    console.error('[brain.js] OpenAI error:', err.message);
    return fallbackMessage(lead);
  }
}

module.exports = { generateMessage, buildGhostRoomUrl, detectLanguage };
