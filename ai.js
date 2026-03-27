const axios = require('axios');

const OPENAI_KEY = process.env.OPENAI_KEY;

const SYSTEM_PROMPT = `You are a world-class bilingual AI receptionist for a premium dental clinic in Saudi Arabia. You understand Arabic (Gulf/Saudi dialect) and English perfectly.

Given the patient message, their current flow, and current step, return a JSON with:
- intent: one of [greeting, booking, my_appointment, reschedule, cancel, services, doctors, prices, location, reviews, human, continue_flow, change_language, unknown]
- detected_language: "ar" or "en"
- extracted_value: if the patient is in a flow, extract the actual value they provided. Return null if not applicable.
- confidence: "high", "medium", or "low"

Main menu numbering (when no active flow):
1 → booking
2 → my_appointment
3 → reschedule
4 → cancel
5 → services
6 → doctors
7 → prices
8 → location
9 → reviews
10 → human

Arabic intent examples (MUST recognise these):
Greetings → greeting: "هلا", "هلا والله", "السلام عليكم", "وعليكم السلام", "مرحبا", "أهلا", "صباح الخير", "مساء الخير", "كيف الحال", "هاي", "يو"
Booking → booking: "أبغى موعد", "حابب أحجز", "بدي موعد", "أريد حجز", "أبي أحجز", "وقت", "أبغى أجي"
Prices → prices: "كم الأسعار", "بكم", "قديش", "كم تكلف", "السعر", "أسعاركم", "كم سعر"
Location → location: "وين العيادة", "وين انتم", "فين انتم", "العنوان", "الموقع", "كيف أوصل"
Human → human: "أبغى أكلم أحد", "أبغى أكلم موظف", "كلم أحد", "دكتور", "أريد التحدث"
Services → services: "خدماتكم", "ايش تسوون", "شو تسوون", "خدماتكم إيش"
My appointment → my_appointment: "موعدي", "شو موعدي", "متى موعدي", "عندي موعد"

Rules:
- If patient is mid-flow (current_flow is set) and their message matches expected input → return intent: "continue_flow" and set extracted_value to the clean extracted value
- If patient sends a number with no active flow, map it using the menu numbering above
- Name extraction: "اسمي محمد" → extracted_value: "محمد" | "my name is Sarah" → "Sarah" | just "Ahmed" → "Ahmed"
- Date normalisation (use today's date as reference for relative dates):
  "غداً" / "بكرة" → next day in English e.g. "Tuesday March 31, 2026"
  "الاثنين" / "Monday" → next occurrence of that day
  "الاثنين القادم" → "Monday [date]"
  "بعد أسبوع" → date one week from today
  Arabic month names: "أبريل" = April, "مايو" = May, etc.
- Time normalisation: "9 صباحاً" / "9 AM" / "التاسعة" → "9:00 AM" | "بعد الظهر" / "العصر" → "2:00 PM" | "المساء" → "5:00 PM"
- During mid-flow, if patient sends a number that maps to a menu item (e.g. "1" for booking) but they are in booking flow step >1, treat it as continue_flow input for that step
- If patient changes topic mid-flow (e.g. asks for prices while booking), detect the new intent
- For confirmations: "1" / "yes" / "نعم" / "أؤكد" → extracted_value: "yes" | "2" / "no" / "لا" → extracted_value: "no"
- For treatment selection: extracted_value should be the treatment name in English
- Return ONLY valid JSON, no extra text`;

async function detectIntent(messageText, currentFlow = null, currentStep = 0) {
  const contextMsg = currentFlow
    ? `Current flow: ${currentFlow}, Current step: ${currentStep}\nPatient message: ${messageText}`
    : `No active flow (patient is on main menu)\nPatient message: ${messageText}`;

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
    // Fallback: keyword-based intent detection
    return keywordFallback(messageText);
  }
}

// Keyword fallback when OpenAI is unavailable
function keywordFallback(text) {
  const t = text.trim().toLowerCase();
  if (/^(1|book|حجز|موعد|أبغى موعد|أريد حجز)/.test(t)) return { intent: 'booking', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/^(2|my appointment|موعدي)/.test(t)) return { intent: 'my_appointment', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/^(3|reschedule|إعادة جدولة)/.test(t)) return { intent: 'reschedule', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/^(4|cancel|إلغاء)/.test(t)) return { intent: 'cancel', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/^(5|services|خدمات)/.test(t)) return { intent: 'services', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/^(6|doctors|أطباء)/.test(t)) return { intent: 'doctors', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/^(7|price|سعر|أسعار|بكم|كم)/.test(t)) return { intent: 'prices', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/^(8|location|موقع|وين|عنوان)/.test(t)) return { intent: 'location', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/^(9|review|تقييم)/.test(t)) return { intent: 'reviews', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/^(10|staff|human|موظف|أكلم)/.test(t)) return { intent: 'human', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/^(hi|hello|hey|هلا|مرحبا|السلام|أهلا|صباح|مساء)/.test(t)) return { intent: 'greeting', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  return { intent: 'unknown', detected_language: 'en', extracted_value: null, confidence: 'low' };
}

async function extractDate(text) {
  try {
    const today = new Date().toDateString();
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [{
          role: 'user',
          content: `Today is ${today}. Extract the appointment date from this text. Return ONLY a clean date string like "April 20, 2026" or "Monday April 21, 2026". Use today as reference for relative dates like "tomorrow", "next Monday", "غداً", "الاثنين القادم", "بكرة". Arabic month names: يناير=January, فبراير=February, مارس=March, أبريل=April, مايو=May, يونيو=June, يوليو=July, أغسطس=August, سبتمبر=September, أكتوبر=October, نوفمبر=November, ديسمبر=December. Days: الاثنين=Monday, الثلاثاء=Tuesday, الأربعاء=Wednesday, الخميس=Thursday, الجمعة=Friday, السبت=Saturday, الأحد=Sunday. If no clear date found, return the original text unchanged. Text: ${text}`
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
          content: `Available time slots: ${slots.join(', ')}. Match this time request to the closest available slot. Arabic time hints: الصباح/صباحاً=morning, الظهر=noon(1PM), بعد الظهر/العصر=afternoon(2-3PM), المساء/مساءً=evening(5PM). Return ONLY the exact slot string from the list, nothing else. Time request: "${text}"`
        }]
      },
      { headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' } }
    );
    const result = res.data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
    console.log(`[AI] extractTimeSlot: "${text}" → "${result}"`);
    return slots.includes(result) ? result : null;
  } catch (err) {
    console.error('[AI] extractTimeSlot error:', err.response?.data || err.message);
    return null;
  }
}

module.exports = { detectIntent, extractDate, extractTimeSlot };
