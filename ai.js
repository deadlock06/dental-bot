const axios = require('axios');

const OPENAI_KEY = process.env.OPENAI_KEY;
console.log('[AI] OPENAI_KEY loaded:', !!OPENAI_KEY);

// ─────────────────────────────────────────────
// System prompt for GPT-4o-mini intent detection
// ─────────────────────────────────────────────
const SYSTEM_PROMPT = [
  'You are a specialized intent detection agent for a real estate agency WhatsApp bot.',
  'Your ONLY job is to analyze client messages and return the correct intent as JSON.',
  'You understand Arabic (Gulf/Saudi dialect), English, and mixed language messages.',
  '',
  'LANGUAGE DETECTION: Detect language FROM the message text. Arabic script = "ar". Latin = "en".',
  '',
  'CRITICAL FLOW RULES:',
  'When patient is MID-FLOW (current flow is not null):',
  '- Numbers (1-10) during active flow = ALWAYS "continue_flow"',
  '- Yes/no/confirm during active flow = ALWAYS "continue_flow"',
  '- Only return a different intent if message is a CLEAR intent switch (e.g. "cancel my appointment", "what are your prices")',
  '- Short words like names, cities, dates = "continue_flow" during active flow',
  '- When in doubt during a flow, ALWAYS return "continue_flow"',
  '',
  'INTENTS: booking, prices, location, doctors, services, my_appointment, continue_flow, reschedule, cancel, human, reviews, greeting, help, change_language, unknown',
  '',
  'RULES:',
  '1. Return ONLY valid JSON',
  '2. "help" alone = help (NOT human)',
  '3. Property inquiry/viewing request/apartment/villa = booking',
  '4. Price/cost/how much = prices',
  '5. Where/address/directions = location',
  '6. Talk to someone/staff/receptionist = human',
  '7. Insurance/coverage = human',
  '8. Numbers during active flow = continue_flow',
  '9. If unclear = "unknown"',
  '10. confidence: "high" if clear, "medium" if probable, "low" if guessing',
  '',
  'Return format: {"intent":"booking","detected_language":"en","extracted_value":null,"confidence":"high"}'
].join('\n');

// ─────────────────────────────────────────────
// Function calling schema — Custom GPT structured output
// Forces the model to return structured data matching our exact schema
// ─────────────────────────────────────────────
const INTENT_FUNCTION = {
  type: 'function',
  function: {
    name: 'detect_intent',
    description: 'Classify the client message into an intent category with metadata',
    strict: true,
    parameters: {
      type: 'object',
      required: ['intent', 'detected_language', 'extracted_value', 'confidence'],
      properties: {
        intent: {
          type: 'string',
          enum: ['booking', 'prices', 'location', 'doctors', 'services', 'my_appointment',
                 'continue_flow', 'reschedule', 'cancel', 'human', 'reviews', 'greeting',
                 'help', 'change_language', 'unknown'],
          description: 'The detected intent category'
        },
        detected_language: {
          type: 'string',
          enum: ['ar', 'en'],
          description: 'Language of the message (ar=Arabic, en=English)'
        },
        extracted_value: {
          type: ['string', 'null'],
          description: 'Any extracted value from the message (date, name, number, etc.)'
        },
        confidence: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: 'Confidence level of the intent classification'
        }
      },
      additionalProperties: false
    }
  }
};

// ─────────────────────────────────────────────
// Main intent detection — Custom GPT with function calling
// ─────────────────────────────────────────────
async function detectIntent(messageText, currentFlow = null, currentStep = 0) {
  console.log('[AI] detectIntent:', messageText, 'flow:', currentFlow, 'step:', currentStep);

  // Fast-path: pure numbers during active flow — no need to call AI
  if (currentFlow && /^\d+$/.test(messageText.trim())) {
    console.log('[AI] Fast-path: number during flow → continue_flow');
    return { intent: 'continue_flow', detected_language: 'en', extracted_value: messageText.trim(), confidence: 'high' };
  }

  // Fast-path: yes/no during active flow confirmation steps
  if (currentFlow && /^(yes|no|1|2|نعم|لا|تمام|ايوه|موافق|لأ)$/i.test(messageText.trim())) {
    console.log('[AI] Fast-path: yes/no during flow → continue_flow');
    return { intent: 'continue_flow', detected_language: messageText.match(/[\u0600-\u06FF]/) ? 'ar' : 'en', extracted_value: messageText.trim(), confidence: 'high' };
  }

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
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: contextMsg }
        ],
        tools: [INTENT_FUNCTION],
        tool_choice: { type: 'function', function: { name: 'detect_intent' } }
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 8000
      }
    );

    // Extract function call result — guaranteed structured output
    const toolCall = res.data.choices[0].message.tool_calls?.[0];
    if (toolCall && toolCall.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      console.log(`[AI] CustomGPT: msg="${messageText}" → intent=${parsed.intent} lang=${parsed.detected_language} val="${parsed.extracted_value}" conf=${parsed.confidence}`);
      return {
        intent: parsed.intent || 'unknown',
        detected_language: parsed.detected_language || 'en',
        extracted_value: parsed.extracted_value ?? null,
        confidence: parsed.confidence || 'low'
      };
    }

    // Fallback: try old-style content parsing if no tool call
    const content = res.data.choices[0].message.content;
    if (content) {
      try {
        const parsed = JSON.parse(content);
        return {
          intent: parsed.intent || 'unknown',
          detected_language: parsed.detected_language || 'en',
          extracted_value: parsed.extracted_value ?? null,
          confidence: parsed.confidence || 'low'
        };
      } catch (e) {
        console.error('[AI] Failed to parse content fallback:', content);
      }
    }

    return keywordFallback(messageText, currentFlow);
  } catch (err) {
    console.error('[AI] detectIntent error:', err.response?.data || err.message);
    // Log to monitor if available
    try {
      const { logError } = require('./monitor');
      logError('ai', err, { messageText, currentFlow, currentStep });
    } catch (_) { /* monitor not loaded yet */ }
    return keywordFallback(messageText, currentFlow);
  }
}


// ─────────────────────────────────────────────
// Keyword fallback when OpenAI is unavailable
// ─────────────────────────────────────────────
function keywordFallback(text, currentFlow = null) {
  const t = text.toLowerCase().trim();
  const isArabic = !!t.match(/[\u0600-\u06FF]/);
  const lang = isArabic ? 'ar' : 'en';

  // Help — must be first
  if (/^(help|what can you do|options|commands|مساعدة|خيارات|ماذا تفعل|كيف تساعدني|ايش تسوي)$/i.test(t))
    return { intent: 'help', detected_language: lang, extracted_value: null, confidence: 'high' };

  // Exact menu option text (copy-paste from interactive list)
  const exactMap = {
    'book appointment': 'booking', 'book an appointment': 'booking', 'حجز موعد': 'booking',
    'my appointment': 'my_appointment', 'موعدي الحالي': 'my_appointment',
    'our services': 'services', 'خدماتنا': 'services',
    'meet our doctors': 'doctors', 'meet the doctors': 'doctors', 'تعرف على أطبائنا': 'doctors',
    'leave a review': 'reviews', 'leave review': 'reviews', 'تقييم العيادة': 'reviews',
    'talk to staff': 'human', 'talk to someone': 'human', 'التحدث مع الفريق': 'human',
    'إعادة جدولة': 'reschedule', 'إلغاء الموعد': 'cancel',
    'الأسعار': 'prices', 'الموقع': 'location'
  };
  if (exactMap[t]) return { intent: exactMap[t], detected_language: lang, extracted_value: null, confidence: 'high' };

  // English keyword patterns
  if (/book|appointment|schedule|reserve|toothache|tooth pain|dental pain|cavity|filling|braces|orthodontic|whiten|cleaning|implant|root canal|need.*dentist|dental help|emergency dental|gum bleed|broken tooth|extraction|wisdom tooth|checkup|consultation/i.test(t))
    return { intent: 'booking', detected_language: 'en', extracted_value: null, confidence: 'medium' };
  if (/\bprice|cost|\bfee\b|charges|how much|affordable|discount|payment plan|treatment fee|rates?\b|packages?\b|offers?\b/i.test(t))
    return { intent: 'prices', detected_language: 'en', extracted_value: null, confidence: 'medium' };
  if (/\bwhere\b|location|\baddress|direction|how.*get there|maps link|near me|working hours|opening hours|are you open/i.test(t))
    return { intent: 'location', detected_language: 'en', extracted_value: null, confidence: 'medium' };
  if (/\bdoctor|\bdoctors|dentist|specialist|meet the team|which doctor|female doctor/i.test(t))
    return { intent: 'doctors', detected_language: 'en', extracted_value: null, confidence: 'medium' };
  if (/reschedule|change.*appointment|move.*appointment|different time|postpone|rebook/i.test(t))
    return { intent: 'reschedule', detected_language: 'en', extracted_value: null, confidence: 'medium' };
  if (/\bcancel|cancellation|can.t make it|delete.*appointment|remove.*booking/i.test(t))
    return { intent: 'cancel', detected_language: 'en', extracted_value: null, confidence: 'medium' };
  if (/talk to someone|speak to someone|\bhuman\b|real person|receptionist|front desk|customer service|call me|\bstaff\b|\bsupport\b|insurance|coverage/i.test(t))
    return { intent: 'human', detected_language: 'en', extracted_value: null, confidence: 'medium' };
  if (/\bservice|\btreatment|what do you offer|dental services/i.test(t))
    return { intent: 'services', detected_language: 'en', extracted_value: null, confidence: 'medium' };
  if (/\breview|\bfeedback|leave.*review|google review|share.*experience/i.test(t))
    return { intent: 'reviews', detected_language: 'en', extracted_value: null, confidence: 'medium' };
  if (/my appointment|my booking|when is my appointment|check.*appointment|appointment details/i.test(t))
    return { intent: 'my_appointment', detected_language: 'en', extracted_value: null, confidence: 'medium' };
  if (/^(hi|hello|hey|good morning|good evening|good afternoon|howdy|yo|sup|greetings|morning|evening)/i.test(t))
    return { intent: 'greeting', detected_language: 'en', extracted_value: null, confidence: 'medium' };

  // Arabic keyword patterns
  if (/أبغى موعد|حابب أحجز|بدي موعد|أريد حجز|سني يوجع|ضرسي يوجع|عندي ألم|أبغى أجي|عندي تسوس|محتاج حشوة|أبغى تقويم|أبغى تبييض|محتاج تنظيف|أبغى زراعة|علاج عصب|ألم شديد|محتاج أشوف دكتور|ممكن أحجز|حالة طارئة|لثتي تنزف|سني انكسر|خلع سن|ضرس العقل|كشف|فحص أسنان|استشارة|حجز/i.test(t))
    return { intent: 'booking', detected_language: 'ar', extracted_value: null, confidence: 'medium' };
  if (/كم تكلف|كم السعر|أسعاركم|كم سعر|غالي|رخيص|عندكم عروض|خصومات|تكلفة العلاج|بكم|قديش/i.test(t))
    return { intent: 'prices', detected_language: 'ar', extracted_value: null, confidence: 'medium' };
  if (/وين العيادة|وين أنتم|كيف أوصل|عطني العنوان|خرائط جوجل|أوقات الدوام|مفتوحين|وين|فين|الموقع|العنوان/i.test(t))
    return { intent: 'location', detected_language: 'ar', extracted_value: null, confidence: 'medium' };
  if (/الأطباء|دكتور|طبيب|متخصص|عندكم دكتورة|فريق الأطباء|الكادر الطبي/i.test(t))
    return { intent: 'doctors', detected_language: 'ar', extracted_value: null, confidence: 'medium' };
  if (/أغير الموعد|إعادة جدولة|غير موعدي|يوم ثاني|أبغى وقت ثاني/i.test(t))
    return { intent: 'reschedule', detected_language: 'ar', extracted_value: null, confidence: 'medium' };
  if (/ألغي موعدي|إلغاء الموعد|أبغى ألغي|ما راح أقدر أجي|احذف موعدي|شيل حجزي|إلغاء/i.test(t))
    return { intent: 'cancel', detected_language: 'ar', extracted_value: null, confidence: 'medium' };
  if (/أبغى أكلم أحد|وصلني بالموظفين|استقبال|خدمة العملاء|اتصل فيني|التحدث مع الفريق|الموظفين|تأمين|تغطية/i.test(t))
    return { intent: 'human', detected_language: 'ar', extracted_value: null, confidence: 'medium' };
  if (/خدماتكم|إيش تسوون|قائمة الخدمات|خدمات الأسنان|خدمات/i.test(t))
    return { intent: 'services', detected_language: 'ar', extracted_value: null, confidence: 'medium' };
  if (/تقييم|أقيم|أعطي تقييم|تقييم جوجل|أشارك تجربتي/i.test(t))
    return { intent: 'reviews', detected_language: 'ar', extracted_value: null, confidence: 'medium' };
  if (/متى موعدي|إيش موعدي|اطلع موعدي|موعدي مؤكد|تفاصيل موعدي|حجزي|موعدي/i.test(t))
    return { intent: 'my_appointment', detected_language: 'ar', extracted_value: null, confidence: 'medium' };
  if (/هلا والله|كيف الحال|مساء النور|صباح النور|حياك|هلا|مرحبا|السلام|أهلا|صباح|مساء/i.test(t))
    return { intent: 'greeting', detected_language: 'ar', extracted_value: null, confidence: 'medium' };

  // If mid-flow and no keyword matched → it's a flow input
  if (currentFlow) {
    return { intent: 'continue_flow', detected_language: lang, extracted_value: null, confidence: 'medium' };
  }

  return { intent: 'unknown', detected_language: lang, extracted_value: null, confidence: 'low' };
}

// ─────────────────────────────────────────────
// Date extraction via OpenAI
// ─────────────────────────────────────────────
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
          content: `Today is ${today}. Extract the appointment date from this text. ALWAYS include the year. Return format: "DayName, Month Day, Year" (e.g. "Monday, April 21, 2026"). Rules: "tomorrow"=next day, "next Monday"=next occurrence, "بكرة/غداً"=tomorrow, "الاثنين الجاي"=next Monday. Arabic months: يناير=January, فبراير=February, مارس=March, أبريل=April, مايو=May, يونيو=June, يوليو=July, أغسطس=August, سبتمبر=September, أكتوبر=October, نوفمبر=November, ديسمبر=December. If the date has no year, use the CURRENT year (or next year if the date has already passed). If no date can be extracted, return "null". Return ONLY the date string, nothing else. Text: "${text}"`
        }]
      },
      {
        headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
        timeout: 8000
      }
    );
    const result = res.data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
    console.log(`[AI] extractDate: "${text}" → "${result}"`);
    return result;
  } catch (err) {
    console.error('[AI] extractDate error:', err.response?.data || err.message);
    return text;
  }
}

// ─────────────────────────────────────────────
// Time slot extraction via OpenAI
// ─────────────────────────────────────────────
async function extractTimeSlot(text, slots) {
  try {
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [{
          role: 'user',
          content: `Available time slots: ${slots.join(', ')}. Match this time request to the closest available slot. Rules: morning/الصبح/صباحاً→"9:00 AM", noon/الظهر→"1:00 PM", afternoon/بعد الظهر/العصر→"2:00 PM", evening/المساء/مساء/المغرب/after work→"5:00 PM". If the requested time is completely outside available slots return exactly the word null. Otherwise return ONLY the exact slot string. Time request: "${text}"`
        }]
      },
      {
        headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
        timeout: 8000
      }
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

// ─────────────────────────────────────────────
// Strict ISO date parser — returns YYYY-MM-DD or null
// Rejects any value that is not a real calendar date.
// ─────────────────────────────────────────────
function parseDateToISO(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  // Already perfect ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed + 'T12:00:00Z');
    if (!isNaN(d.getTime())) return trimmed;
    return null;
  }
  // Reject relative text phrases that can never produce a real date by themselves
  // e.g. "after 5 days", "next week", "soon", etc.
  if (/after\s+\d+\s+days?|next\s+week|بعد\s+\d+\s+يوم|الأسبوع\s+القادم/i.test(trimmed)) return null;
  // Try native Date parse on anything that looks like a formatted date string
  // ("Monday, April 21, 2026", "April 21, 2026", "21/04/2026", "2026/04/21")
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const currentYear = new Date().getFullYear();
    if (parsed.getFullYear() >= currentYear) {
      const iso = parsed.toISOString().split('T')[0];
      // Final guard: must match YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
    }
  }
  return null;
}

module.exports = { detectIntent, extractDate, extractTimeSlot, parseDateToISO };