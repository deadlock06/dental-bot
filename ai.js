const axios = require('axios');

const OPENAI_KEY = process.env.OPENAI_KEY;
console.log('[AI] OPENAI_KEY loaded:', !!OPENAI_KEY);

const SYSTEM_PROMPT = `You are a world-class bilingual AI receptionist for a premium dental clinic in Saudi Arabia. You understand Arabic (Gulf/Saudi dialect) and English perfectly.

Given the patient message, their current flow, and current step, return a JSON with:
- intent: one of [greeting, booking, my_appointment, reschedule, cancel, services, doctors, prices, location, reviews, human, continue_flow, change_language, unknown]
- detected_language: "ar" or "en"
- extracted_value: if the patient is in a flow, extract the actual value they provided. Return null if not applicable.
- confidence: "high", "medium", or "low"

MAIN MENU NUMBER MAPPING (when no active flow):
1=booking 2=my_appointment 3=reschedule 4=cancel 5=services 6=doctors 7=prices 8=location 9=reviews 10=human

INTENT DETECTION:
GREETING: hi hello hey good morning good evening howdy yo sup | هلا السلام عليكم وعليكم السلام مرحبا أهلا صباح الخير مساء الخير هلا والله كيف الحال يو هاي هلو
BOOKING: book appointment schedule reserve toothache tooth hurts need help slot visit see a doctor fix my tooth dental emergency | أبغى موعد حابب أحجز بدي موعد أريد حجز عندي ألم سني يوجعني أبغى أجي أبغى دكتور وجع أسنان ألم أبغى أعالج ضرسي أسناني أبي أحجز
MY_APPOINTMENT: my appointment my booking when is my appointment what did I book my visit my schedule | موعدي متى موعدي شو موعدي وش حجزت موعدي الحالي متى أجي
RESCHEDULE: reschedule change appointment move appointment different time postpone | أبغى أغير الموعد إعادة جدولة غير موعدي بدل الموعد أجل موعدي غير الوقت
CANCEL: cancel delete appointment can't make it won't come remove booking | إلغاء ألغِ موعدي ما راح أجي أبغى ألغي مو قادر أجي
SERVICES: services what do you offer treatments available what can you treat | خدمات شو تسوون إيش عندكم خدماتكم وش تعالجون
DOCTORS: doctors who are your doctors meet the team dentists specialists | أطبائكم الأطباء من الدكتور فريقكم من راح يعالجني شو تخصصاتكم
PRICES: prices cost how much fees pricing expensive cheap charges | أسعار كم بكم قديش كم تكلف غالي رخيص كم سعر تكاليف كم تكلفني
LOCATION: location where address directions where are you where is the clinic maps | وين فين الموقع العنوان كيف أوصل وين العيادة الخريطة وين أنتم
REVIEWS: review rate feedback google review leave review rating | تقييم أقيم أشارك رأيي تقييم جوجل أعطي تقييم
HUMAN: human staff speak to someone real person receptionist call me | أبغى أكلم أحد موظف دكتور مباشر اتصل فيني أبغى أتكلم مع أحد

MID-FLOW RULES:
- current_flow is set + message matches expected step → intent: "continue_flow", extracted_value: clean value
- patient asks off-topic question mid-flow → return that intent (prices, location, etc)
- NEVER return unknown for clearly recognisable intents
- Numbers sent mid-flow step >1 in booking = continue_flow input for that step

VALUE EXTRACTION:
NAME: strip prefix then return clean name only. "my name is Ahmed"→"Ahmed" "I'm Sarah"→"Sarah" "اسمي محمد"→"محمد" "أنا سارة"→"سارة" bare "Ahmed"→"Ahmed"

DATE (calculate relative to today's actual date provided in context):
tomorrow→next day | day after tomorrow→today+2 | next Monday→next occurrence of Monday | in N days→today+N | April 20→"April 20, 2026" | 20/4→"April 20, 2026" | the 15th→next 15th | next week→today+7
Arabic: اليوم→today | غداً/بكرة→tomorrow | بعد غد→today+2 | الاثنين الجاي→next Monday | الأسبوع الجاي→today+7 | بعد أسبوع→today+7 | بعد 5 أيام→today+5 | 15 أبريل→"April 15, 2026"
Arabic months: يناير=January فبراير=February مارس=March أبريل=April مايو=May يونيو=June يوليو=July أغسطس=August سبتمبر=September أكتوبر=October نوفمبر=November ديسمبر=December
Arabic days: الاثنين=Monday الثلاثاء=Tuesday الأربعاء=Wednesday الخميس=Thursday الجمعة=Friday السبت=Saturday الأحد=Sunday
Return format: "Monday, April 20, 2026" (always include day name)

TIME — available slots ONLY: 9:00 AM, 10:00 AM, 11:00 AM, 1:00 PM, 2:00 PM, 3:00 PM, 4:00 PM, 5:00 PM
"9am"→"9:00 AM" | morning/الصبح/صباحاً→"9:00 AM" | noon/الظهر→"1:00 PM" | afternoon/بعد الظهر/العصر→"2:00 PM" | evening/المساء/مساء/المغرب→"5:00 PM" | after work→"5:00 PM" | "3"/"3pm"→"3:00 PM" | "4"/"4pm"→"4:00 PM"
Times OUTSIDE available slots (4am, 6pm, 7pm, 8pm, midnight etc.) → extracted_value: null

TREATMENT mapping:
cleaning/polish/جرم/تنظيف→"Cleaning & Polishing"
filling/cavity/حشوة/تسوس→"Fillings"
braces/orthodontics/تقويم→"Braces & Orthodontics"
whitening/bleaching/تبييض→"Teeth Whitening"
extraction/pull/remove tooth/خلع/قلع→"Extraction"
implant/زراعة→"Dental Implants"
root canal/nerve/علاج عصب/جذر→"Root Canal"
pain/ache/hurts/وجع/ألم/checkup/فحص/كشف/other→"Other"

CONFIRMATION:
"1"/yes/confirm/ok/sure/correct/نعم/أؤكد/صح/تمام/ايوه/أيوه/يلا/موافق → extracted_value: "yes"
"2"/no/cancel/back/wrong/لا/لأ/رجوع/العودة → extracted_value: "no"

Return ONLY valid JSON, no extra text.`;

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
  const t = text.trim().toLowerCase();
  if (/^(hi|hello|hey|هلا|مرحبا|السلام|أهلا|صباح|مساء|هاي)/.test(t)) return { intent: 'greeting',      detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/^(1|book|حجز|موعد|أبغى موعد|أريد حجز|أبي أحجز)/.test(t))   return { intent: 'booking',       detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/^(2|my appointment|موعدي)/.test(t))                           return { intent: 'my_appointment', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/^(3|reschedule|إعادة جدولة|غير موعدي)/.test(t))             return { intent: 'reschedule',     detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/^(4|cancel|إلغاء|ألغِ)/.test(t))                             return { intent: 'cancel',         detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/^(5|services|خدمات|شو تسوون)/.test(t))                       return { intent: 'services',       detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/^(6|doctors|أطباء|الأطباء)/.test(t))                         return { intent: 'doctors',        detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/^(7|price|سعر|أسعار|بكم|كم|قديش)/.test(t))                  return { intent: 'prices',         detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/^(8|location|موقع|وين|عنوان|فين)/.test(t))                   return { intent: 'location',       detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/^(9|review|تقييم)/.test(t))                                   return { intent: 'reviews',        detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/^(10|staff|human|موظف|أكلم أحد|أبغى أكلم)/.test(t))         return { intent: 'human',          detected_language: 'ar', extracted_value: null, confidence: 'low' };
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
          content: `Today is ${today}. Extract the appointment date from this text and return it as a formatted date string like "Monday, April 20, 2026" (always include the day name). Use today as reference for relative dates: "tomorrow"=next day, "next Monday"=next occurrence of Monday, "in 5 days"=today+5, "بكرة/غداً"=tomorrow, "بعد غد"=today+2, "الاثنين الجاي"=next Monday, "بعد 5 أيام"=today+5, "الأسبوع الجاي"=today+7. Arabic months: يناير=January, فبراير=February, مارس=March, أبريل=April, مايو=May, يونيو=June, يوليو=July, أغسطس=August, سبتمبر=September, أكتوبر=October, نوفمبر=November, ديسمبر=December. Arabic days: الاثنين=Monday, الثلاثاء=Tuesday, الأربعاء=Wednesday, الخميس=Thursday, الجمعة=Friday, السبت=Saturday, الأحد=Sunday. If no clear date can be inferred, return the original text unchanged. Return ONLY the date string, nothing else. Text: "${text}"`
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
