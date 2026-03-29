const axios = require('axios');

const OPENAI_KEY = process.env.OPENAI_KEY;
console.log('[AI] OPENAI_KEY loaded:', !!OPENAI_KEY);

const SYSTEM_PROMPT = `You are a specialized intent detection agent for a Saudi dental clinic WhatsApp bot.

Your ONLY job is to analyze patient messages and return the correct intent.
You understand Arabic (Gulf/Saudi dialect), English, and mixed language messages perfectly.

INTENTS AND EXAMPLES:

booking:
- "book", "appointment", "I want to come", "I need to see a doctor"
- "I have a toothache", "my tooth hurts", "tooth pain", "dental emergency"
- "cavity", "braces", "implant", "whitening", "cleaning", "root canal"
- "أبغى موعد", "حجز", "سني يوجعني", "أبغى أجي", "عندي ألم"
- "بدي موعد", "أريد حجز", "حابب أحجز", "أبغى دكتور"
- "wana book", "i need appointment", "tooth ache"

prices:
- "price", "cost", "how much", "fee", "charges", "expensive", "cheap"
- "how much does whitening cost", "what are your prices", "braces cost"
- "كم", "بكم", "قديش", "الأسعار", "كم تكلف", "غالي", "رخيص"
- "كم سعر التقويم", "الأسعار كم", "بكم الحشوة"

location:
- "where", "location", "address", "directions", "how to get there"
- "where are you", "where are you located", "find you", "maps"
- "وين", "فين", "الموقع", "العنوان", "كيف أوصل", "وين العيادة"
- "وين أنتم", "الخريطة", "الاتجاهات"

doctors:
- "doctors", "dentist", "specialist", "team", "who are your doctors"
- "meet the team", "which doctor", "who will treat me"
- "أطباء", "الأطباء", "دكتور", "طبيب", "فريق", "من الدكتور"
- "شو تخصصاتكم", "من راح يعالجني"

services:
- "services", "treatments", "what do you offer", "what do you do"
- "procedures", "what can you treat"
- "خدمات", "خدماتكم", "شو تسوون", "إيش عندكم", "وش تعالجون"

my_appointment:
- "my appointment", "my booking", "when is my appointment"
- "what did I book", "my visit", "my schedule"
- "موعدي", "متى موعدي", "شو موعدي", "وش حجزت"

reschedule:
- "reschedule", "change appointment", "move appointment"
- "different time", "postpone", "change my booking"
- "أغير الموعد", "إعادة جدولة", "غير موعدي", "أجل موعدي"

cancel:
- "cancel", "delete appointment", "I can't make it"
- "won't come", "remove booking", "cancel my visit"
- "إلغاء", "ألغي موعدي", "ما راح أجي", "أبغى ألغي"

human:
- "talk to someone", "speak to a person", "human", "real person"
- "receptionist", "staff", "call me", "I need help from someone"
- "can I talk to someone", "connect me to staff"
- "أبغى أكلم أحد", "موظف", "أبغى أتكلم مع أحد", "اتصل فيني"

reviews:
- "review", "rate", "feedback", "google review", "leave review"
- "تقييم", "أقيم", "رأيي", "أشارك تجربتي"

greeting:
- "hi", "hello", "hey", "good morning", "good evening", "howdy", "yo"
- "هلا", "السلام عليكم", "مرحبا", "أهلا", "صباح الخير", "مساء الخير"
- "هلا والله", "كيف الحال", "هاي", "هلو", "يو"

RULES:
1. Return ONLY valid JSON — no extra text, no markdown
2. If message could be booking (pain, tooth problem, want to come) → always return booking
3. For price questions about specific treatments → return prices
4. For ANY location/address/directions question → return location
5. For ANY staff/human/talk request → return human
6. Detect language from the message itself — not from context
7. For mixed language (Arabizi like "ana abga maw3id") → detect as Arabic booking
8. If genuinely unclear → return unknown (rarely)
9. extracted_value: extract clean value if patient is mid-flow, null otherwise
10. confidence: "high" if clear intent, "medium" if probable, "low" if guessing

Return format (ONLY this, nothing else):
{"intent":"booking","detected_language":"en","extracted_value":null,"confidence":"high"}`;

async function detectIntent(messageText, currentFlow = null, currentStep = 0) {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const contextMsg = currentFlow
    ? `Today is ${today}.\nCurrent flow: ${currentFlow}, Current step: ${currentStep}\nPatient message: ${messageText}`
    : `Today is ${today}.\nNo active flow (patient is on main menu)\nPatient message: ${messageText}`;

  try {
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: contextMsg }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const content = res.data.choices[0].message.content;
    const parsed = JSON.parse(content);
    console.log(`[AI] msg="${messageText}" flow=${currentFlow} step=${currentStep} → intent=${parsed.intent} extracted="${parsed.extracted_value}" conf=${parsed.confidence}`);
    return {
      intent: parsed.intent || 'unknown',
      detected_language: parsed.detected_language || 'en',
      extracted_value: parsed.extracted_value ?? null,
      confidence: parsed.confidence || 'low'
    };
  } catch (err) {
    console.error('[AI] detectIntent error:', err.response?.data || err.message);
    return keywordFallback(messageText);
  }
}

// Keyword fallback when OpenAI is unavailable
function keywordFallback(text) {
  const t = text.toLowerCase().trim();
  
  // English keywords
  if (/book|appointment|toothache|tooth|pain|hurt|dental|cavity|braces|implant|whiten|clean|fill|root canal|extract|see a doctor|need help/.test(t))
    return { intent: 'booking', detected_language: 'en', extracted_value: null, confidence: 'low' };
  if (/price|cost|how much|fee|charge|expensive|cheap|afford/.test(t))
    return { intent: 'prices', detected_language: 'en', extracted_value: null, confidence: 'low' };
  if (/where|location|address|located|direction|find you|map/.test(t))
    return { intent: 'location', detected_language: 'en', extracted_value: null, confidence: 'low' };
  if (/doctor|dentist|specialist|team|who are|meet/.test(t))
    return { intent: 'doctors', detected_language: 'en', extracted_value: null, confidence: 'low' };
  if (/cancel|cancellation|cant make|won't come/.test(t))
    return { intent: 'cancel', detected_language: 'en', extracted_value: null, confidence: 'low' };
  if (/reschedule|change appointment|move appointment|postpone/.test(t))
    return { intent: 'reschedule', detected_language: 'en', extracted_value: null, confidence: 'low' };
  if (/talk|speak|human|person|someone|staff|connect|real person/.test(t))
    return { intent: 'human', detected_language: 'en', extracted_value: null, confidence: 'low' };
  if (/service|treatment|offer|procedure|what do you/.test(t))
    return { intent: 'services', detected_language: 'en', extracted_value: null, confidence: 'low' };
  if (/review|rate|feedback|google/.test(t))
    return { intent: 'reviews', detected_language: 'en', extracted_value: null, confidence: 'low' };
  if (/my appointment|my booking|when is|what did i book/.test(t))
    return { intent: 'my_appointment', detected_language: 'en', extracted_value: null, confidence: 'low' };
  if (/^(hi|hello|hey|good morning|good evening|howdy|yo|sup)/.test(t))
    return { intent: 'greeting', detected_language: 'en', extracted_value: null, confidence: 'low' };
  
  // Arabic keywords
  if (/أبغى موعد|حجز|يوجع|ألم|أسنان|أجي|دكتور أسنان|بدي موعد|أريد حجز/.test(t))
    return { intent: 'booking', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/كم|أسعار|بكم|قديش|تكلف|غالي|رخيص/.test(t))
    return { intent: 'prices', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/وين|فين|موقع|عنوان|أوصل|خريطة/.test(t))
    return { intent: 'location', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/أطباء|دكتور|طبيب|فريق|تخصص/.test(t))
    return { intent: 'doctors', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/إلغاء|ألغي|ما راح أجي/.test(t))
    return { intent: 'cancel', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/أغير|إعادة جدولة|غير موعد|أجل/.test(t))
    return { intent: 'reschedule', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/أكلم أحد|موظف|أتكلم|اتصل/.test(t))
    return { intent: 'human', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/خدمات|تسوون|عندكم|تعالجون/.test(t))
    return { intent: 'services', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/تقييم|أقيم|رأيي/.test(t))
    return { intent: 'reviews', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/موعدي|متى موعدي|شو موعدي/.test(t))
    return { intent: 'my_appointment', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/هلا|مرحبا|السلام|أهلا|صباح|مساء/.test(t))
    return { intent: 'greeting', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  
  return { intent: 'unknown', detected_language: 'en', extracted_value: null, confidence: 'low' };
}

async function extractDate(text) {
  console.log(`[AI] extractDate called with: "${text}"`);
  try {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [{
          role: 'user',
          content: `Today is ${today}. Extract the appointment date from this text and return it as a formatted date string like "Monday, April 20, 2026" (always include the day name). Use today as reference for relative dates: "tomorrow"=next day, "next Monday"=next occurrence of Monday, "in 5 days"=today+5, "بكرة/غداً"=tomorrow, "بعد غد"=today+2, "الاثنين الجاي"=next Monday, "بعد 5 أيام"=today+5, "الأسبوع الجاي"=today+7. Arabic months: يناير=January, فبراير=February, مارس=March, أبريل=April, مايو=May, يونيو=June, يوليو=July, أغسطس=August, سبتمبر=September, أكتوبر=October, نوفمبر=November, ديسمبر=December. Arabic days: الاثنين=Monday, الثلاثاء=Tuesday, الأربعاء=Wednesday, الخميس=Thursday, الجمعة=Friday, السبت=Saturday, الأحد=Sunday. Relative date patterns to calculate precisely: "after 10 days"/"in 10 days"/"10 days later"=today+10, "maybe after 10 days"=today+10 (ignore "maybe"), "next week"=today+7, "in 2 weeks"=today+14, "after a week"=today+7, "after N days"/"in N days"=today+N. Always strip filler words like "maybe", "perhaps", "around", "approximately" before calculating. Always return a specific date like "Monday, April 7, 2026". NEVER return the original text if you can calculate any approximate date from it. If truly no date can be inferred at all, return the original text unchanged. Return ONLY the date string, nothing else. Text: "${text}"`
        }]
      },
      { headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' } }
    );
    const result = res.data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
    console.log(`[AI] extractDate: "${text}" → "${result}"`);
    return result;
  } catch (err) {
    console.error('[AI] extractDate error:', err.response?.data || err.message);
    return text;
  }
}

async function extractTimeSlot(text, slots) {
  try {
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [{
          role: 'user',
          content: `Available time slots: ${slots.join(', ')}. Match this time request to the closest available slot. Rules: morning/الصبح/صباحاً→"9:00 AM", noon/الظهر→"1:00 PM", afternoon/بعد الظهر/العصر→"2:00 PM", evening/المساء/مساء/المغرب/after work→"5:00 PM". If the requested time is completely outside the available slots (e.g. 4am, 6pm, 7pm, 8pm, midnight) return exactly the word null. Otherwise return ONLY the exact slot string from the available list, nothing else. Time request: "${text}"`
        }]
      },
      { headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' } }
    );
    const result = res.data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
    console.log(`[AI] extractTimeSlot: "${text}" → "${result}"`);
    if (result === 'null' || result === 'NULL') return null;
    return slots.includes(result) ? result : null;
  } catch (err) {
    console.error('[AI] extractTimeSlot error:', err.response?.data || err.message);
    return null;
  }
}

module.exports = { detectIntent, extractDate, extractTimeSlot };