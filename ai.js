const axios = require('axios');

const OPENAI_KEY = process.env.OPENAI_KEY;
console.log('[AI] OPENAI_KEY loaded:', !!OPENAI_KEY);

const SYSTEM_PROMPT = `You are a specialized intent detection agent for a Saudi dental clinic WhatsApp bot.

Your ONLY job is to analyze patient messages and return the correct intent.
You understand Arabic (Gulf/Saudi dialect), English, and mixed language messages perfectly.

LANGUAGE DETECTION:
Detect language FROM the message text itself — not from the stored patient language.
Reply in the language of the message, even if the patient has a saved language preference.
Arabic script = "ar". Latin script = "en". Mixed = use dominant language.

INTENTS AND COMPREHENSIVE EXAMPLES:

booking:
EN: book, booking, appointment, schedule, reserve, I want to book, I need an appointment,
    I have a toothache, my tooth hurts, tooth pain, dental pain, I have a cavity,
    my filling fell out, I need a filling, I need braces, interested in braces, orthodontics,
    I want whitening, teeth whitening, bleaching, I need a cleaning, scale and polish,
    I need an implant, dental implant, missing tooth, root canal, nerve pain,
    I need to see a dentist, dental help, can I make an appointment, can I book,
    available slots, want to visit, want to come, emergency dental, dental emergency,
    gums bleeding, gum pain, broken tooth, chipped tooth, cracked tooth, tooth fell out,
    extraction, pull my tooth, wisdom tooth pain, wisdom tooth removal,
    checkup, dental consultation, wanna book, wanna come, need dentist
AR: أبغى موعد، حابب أحجز، بدي موعد، أريد حجز، سني يوجعني، عندي ألم في السن،
    ضرسي يوجعني، أبغى أجي، أبغى أزور العيادة، عندي تسوس، محتاج حشوة، حشوتي وقعت،
    أبغى تقويم، أبغى تبييض، تبييض أسنان، محتاج تنظيف، جرم أسنان،
    أبغى زراعة، زراعة سن، علاج عصب، ألم شديد في السن، محتاج أشوف دكتور، ممكن أحجز،
    حالة طارئة، لثتي تنزف، سني انكسر، خلع سن، ضرس العقل يوجعني، كشف، فحص أسنان، استشارة

prices:
EN: price, prices, cost, fee, fees, charges, how much, how much does it cost,
    how much for braces/whitening/cleaning/implant/filling/root canal,
    is it expensive, is it affordable, is it cheap, what are your rates,
    do you have packages, any offers, any discounts, price list, price range,
    roughly how much, ballpark price, can I afford it, payment plans,
    treatment fees, what's the price, tell me the price
AR: كم، بكم، قديش، كم تكلف، كم السعر، الأسعار، أسعاركم، كم سعر التقويم، بكم التبييض،
    كم سعر الزراعة، كم الحشوة، كم التنظيف، كم علاج العصب،
    غالي، رخيص، بأسعار مناسبة، عندكم عروض، عندكم خصومات، قائمة الأسعار، تكلفة العلاج

location:
EN: where, location, address, directions, where are you, where is the clinic,
    how do I get there, how to reach you, how to find you, what's your address,
    Google Maps, maps link, share location, which area, which district, near me,
    closest branch, how far, working hours, opening hours, are you open
AR: وين، فين، الموقع، العنوان، وين العيادة، وين أنتم، كيف أوصل، كيف أجيكم،
    عطني العنوان، خرائط جوجل، رابط الموقع، أي حي، قريب مني، كم المسافة، أوقات الدوام، مفتوحين

doctors:
EN: doctors, doctor, dentist, dentists, specialist, who are your doctors, meet the team,
    who will treat me, which doctor, female doctor, lady dentist, male doctor,
    doctor's qualifications, doctor's experience, tell me about your doctors,
    I want a specific doctor, I prefer a doctor
AR: الأطباء، دكتور، طبيب، متخصص، من الأطباء، من يعالجني، عندكم دكتورة، عندكم طبيبة،
    تخصصات الأطباء، عرفني على الأطباء، أبغى دكتور معين، فريق الأطباء، الكادر الطبي

services:
EN: services, treatments, what do you offer, what do you do, what treatments do you have,
    what procedures, what do you specialize in, do you do braces, do you do implants,
    list of services, available treatments, what can you treat, dental services, oral care
AR: خدمات، خدماتكم، إيش تسوون، وش تعالجون، عندكم تقويم، عندكم زراعة، عندكم تبييض،
    قائمة الخدمات، إيش تخصصاتكم، خدمات الأسنان، علاجات الأسنان

my_appointment:
EN: my appointment, my booking, my visit, when is my appointment, what time is my appointment,
    what did I book, check my appointment, do I have an appointment, appointment details,
    remind me of my appointment, is my appointment confirmed
AR: موعدي، حجزي، زيارتي، متى موعدي، أي وقت موعدي، شو حجزت، إيش موعدي،
    اطلع موعدي، عندي موعد، موعدي مؤكد، تفاصيل موعدي، ذكرني بموعدي

continue_flow:
- Patient is mid-flow and their message matches the expected input for that step
- Examples: entering a name when asked for name, entering a date when asked for date,
  entering a number to select from a menu, entering a time when asked for time,
  entering notes/description, confirming with yes/no when asked to confirm
- Use this when the message is clearly a direct answer to the bot's last question
- Do NOT use this if the message is a clear intent switch (cancel, reschedule, prices, etc.)

reschedule:
EN: reschedule, change appointment, move appointment, change my booking, different time,
    postpone, push back, move to another day, can't make it at that time,
    can we change the time, can we change the date, another day please, rebook
AR: أغير الموعد، إعادة جدولة، غير موعدي، أبغى أغير الموعد، الوقت ما يناسبني،
    ما أقدر أجي بذاك الوقت، غير الوقت، يوم ثاني، أجل موعدي، يوم آخر، أبغى وقت ثاني

cancel:
EN: cancel, cancellation, cancel my appointment, I can't make it, I won't be able to come,
    delete my appointment, remove my booking, I don't want the appointment, cancel my visit,
    I need to cancel, something came up, I can't come, please cancel
AR: إلغاء، ألغي موعدي، إلغاء الموعد، أبغى ألغي، ما راح أقدر أجي، مو قادر أجي،
    احذف موعدي، شيل حجزي، ما أبغى الموعد، بطلت أبغاه، صار عندي شغل، ما أقدر أجي

human:
EN: talk to someone, speak to someone, human, real person, connect me to staff,
    I need to talk to a person, receptionist, front desk, customer service,
    call me, I want a call, phone call, can I speak to a doctor,
    I need help from a person, not a bot, staff, support, assistance,
    Talk to staff (exact menu text)
AR: أبغى أكلم أحد، حابب أكلم أحد، بدي أكلم أحد، وصلني بالموظفين، استقبال،
    خدمة العملاء، اتصل فيني، أبغى مكالمة، مو روبوت، التحدث مع الفريق، الموظفين

reviews:
EN: review, reviews, rate, rating, feedback, leave a review, write a review, google review,
    share my experience, tell others, recommend, how do I review, where can I review,
    I want to give feedback, share feedback
    تقييم العيادة (exact Arabic menu text)
AR: تقييم، أقيم، أعطي تقييم، تقييم جوجل، أشارك تجربتي، أوصي بكم، كيف أقيمكم،
    أبغى أعطي رأيي، تقييم الخدمة

greeting:
EN: hi, hello, hey, good morning, good evening, good afternoon, good night,
    howdy, yo, sup, what's up, greetings, morning, evening, hi there, hello there
AR: هلا، مرحبا، السلام عليكم، وعليكم السلام، أهلا، صباح الخير، مساء الخير،
    هلا والله، كيف الحال، هاي، هلو، يو، مساء النور، صباح النور، حياك، هلا فيك، الله يسلمك

RULES:
1. Return ONLY valid JSON — no extra text, no markdown
2. If message mentions pain, toothache, dental problem, or wanting to come → booking
3. If message mentions a specific treatment name → booking
4. For ANY price/cost/how much question → prices
5. For ANY location/address/directions question → location
6. For ANY staff/human/talk to someone request → human
7. Detect language FROM the message itself, not from stored preference
8. For mixed language (Arabizi like "ana abga maw3id") → Arabic booking
9. If exact menu text is sent ("Our services", "خدماتنا", etc.) → detect exact intent
10. If intent is unclear or ambiguous → return "unknown" (never guess randomly)
11. extracted_value: extract clean value if patient is mid-flow, null otherwise
12. confidence: "high" if clear, "medium" if probable, "low" if guessing

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
    return keywordFallback(messageText, currentFlow);
  }
}

// Keyword fallback when OpenAI is unavailable
function keywordFallback(text, currentFlow = null) {
  const t = text.toLowerCase().trim();

  // ── Exact menu option text (copy-paste) — checked first
  if (t === 'book appointment' || t === 'book an appointment')
    return { intent: 'booking',        detected_language: 'en', extracted_value: null, confidence: 'low' };
  if (t === 'my appointment')
    return { intent: 'my_appointment', detected_language: 'en', extracted_value: null, confidence: 'low' };
  if (t === 'our services')
    return { intent: 'services',       detected_language: 'en', extracted_value: null, confidence: 'low' };
  if (t === 'meet our doctors' || t === 'meet the doctors')
    return { intent: 'doctors',        detected_language: 'en', extracted_value: null, confidence: 'low' };
  if (t === 'leave a review' || t === 'leave review')
    return { intent: 'reviews',        detected_language: 'en', extracted_value: null, confidence: 'low' };
  if (t === 'talk to staff' || t === 'talk to someone')
    return { intent: 'human',          detected_language: 'en', extracted_value: null, confidence: 'low' };
  if (t === 'حجز موعد')
    return { intent: 'booking',        detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (t === 'موعدي الحالي')
    return { intent: 'my_appointment', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (t === 'إعادة جدولة')
    return { intent: 'reschedule',     detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (t === 'إلغاء الموعد')
    return { intent: 'cancel',         detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (t === 'خدماتنا')
    return { intent: 'services',       detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (t === 'تعرف على أطبائنا')
    return { intent: 'doctors',        detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (t === 'الأسعار')
    return { intent: 'prices',         detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (t === 'الموقع')
    return { intent: 'location',       detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (t === 'تقييم العيادة')
    return { intent: 'reviews',        detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (t === 'التحدث مع الفريق')
    return { intent: 'human',          detected_language: 'ar', extracted_value: null, confidence: 'low' };

  // ── English keywords (comprehensive)
  if (/book|booking|appointment|schedule|reserve|toothache|tooth pain|dental pain|cavity|filling|braces|orthodontic|whiten|cleaning|implant|root canal|need.*dentist|see.*dentist|dental help|make.*appointment|can i book|available slot|want to visit|want to come|emergency dental|dental emergency|gum bleed|gum pain|broken tooth|chipped|cracked tooth|tooth fell|extraction|pull.*tooth|wisdom tooth|checkup|check.up|consultation|wanna book|wanna come/.test(t))
    return { intent: 'booking', detected_language: 'en', extracted_value: null, confidence: 'low' };
  if (/\bprice|prices|\bcost|\bfee\b|\bfees\b|charges|how much|what.*cost|is it expensive|affordable|is it cheap|\brate\b|\brates\b|packages|\boffer|discount|price list|price range|ballpark|payment plan|treatment fee|tell.*price|roughly how/.test(t))
    return { intent: 'prices', detected_language: 'en', extracted_value: null, confidence: 'low' };
  if (/\bwhere\b|location|\baddress|direction|where are you|where is the clinic|how.*get there|how to reach|how to find|maps link|share location|which area|which district|near me|closest branch|how far|working hours|opening hours|are you open/.test(t))
    return { intent: 'location', detected_language: 'en', extracted_value: null, confidence: 'low' };
  if (/\bdoctor|\bdoctors|dentist|specialist|who are your doctors|meet the team|who will treat|which doctor|female doctor|lady dentist|doctor.*qualif|tell me about your doctors|specific doctor/.test(t))
    return { intent: 'doctors', detected_language: 'en', extracted_value: null, confidence: 'low' };
  if (/reschedule|change.*appointment|move.*appointment|change my booking|different time|different date|postpone|push back|another day|can.t make it at that time|can we change the time|can we change the date|another slot|rebook/.test(t))
    return { intent: 'reschedule', detected_language: 'en', extracted_value: null, confidence: 'low' };
  if (/\bcancel|cancellation|cancel.*appointment|can.t make it|won.t.*come|delete.*appointment|remove.*booking|don.t want.*appointment|i need to cancel|something came up/.test(t))
    return { intent: 'cancel', detected_language: 'en', extracted_value: null, confidence: 'low' };
  if (/talk to someone|speak to someone|\bhuman\b|real person|connect.*staff|need.*talk.*person|receptionist|front desk|customer service|call me|want a call|phone call|speak to a doctor|help from a person|not a bot|\bstaff\b|\bsupport\b|\bassistance/.test(t))
    return { intent: 'human', detected_language: 'en', extracted_value: null, confidence: 'low' };
  if (/\bservice|\bservices|\btreatment|\btreatments|what do you offer|what do you do|what treatments|what procedures|specialize in|list of services|available treatments|what can you treat|dental services|oral care/.test(t))
    return { intent: 'services', detected_language: 'en', extracted_value: null, confidence: 'low' };
  if (/\breview|\breviews|\brate\b|\brating|\bfeedback|leave.*review|write.*review|google review|share.*experience|recommend|how.*review|give feedback/.test(t))
    return { intent: 'reviews', detected_language: 'en', extracted_value: null, confidence: 'low' };
  if (/my appointment|my booking|my visit|when is my appointment|what time.*appointment|what did i book|check.*appointment|do i have.*appointment|appointment details|remind me of my appointment/.test(t))
    return { intent: 'my_appointment', detected_language: 'en', extracted_value: null, confidence: 'low' };
  if (/^(hi|hello|hey|good morning|good evening|good afternoon|good night|howdy|yo|sup|what.s up|greetings|morning|evening|hi there|hello there|hey there)/.test(t))
    return { intent: 'greeting', detected_language: 'en', extracted_value: null, confidence: 'low' };

  // ── Arabic keywords (comprehensive)
  if (/أبغى موعد|حابب أحجز|بدي موعد|أريد حجز|سني يوجع|ضرسي يوجع|عندي ألم|أبغى أجي|حابب أجي|عندي تسوس|محتاج حشوة|حشوتي وقعت|أبغى تقويم|أبغى تبييض|تبييض أسنان|أسناني صفرا|محتاج تنظيف|جرم أسنان|أبغى زراعة|زراعة سن|علاج عصب|ألم شديد|محتاج أشوف دكتور|أبغى دكتور|ممكن أحجز|حالة طارئة|لثتي تنزف|سني انكسر|خلع سن|ضرس العقل|كشف|فحص أسنان|استشارة|حجز/.test(t))
    return { intent: 'booking', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/كم تكلف|كم السعر|أسعاركم|كم سعر|كم الحشوة|كم التنظيف|كم علاج|غالي|رخيص|بأسعار مناسبة|عندكم عروض|خصومات|قائمة الأسعار|تكلفة العلاج|قولي الأسعار|وضح لي|بكم|قديش|كم/.test(t))
    return { intent: 'prices', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/وين العيادة|وين أنتم|كيف أوصل|كيف أجيكم|عطني العنوان|خرائط جوجل|رابط الموقع|أي حي|قريب مني|كم المسافة|أوقات الدوام|مفتوحين|متى تفتحون|وين|فين|الموقع|العنوان/.test(t))
    return { intent: 'location', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/من الأطباء|من يعالجني|عندكم دكتورة|عندكم طبيبة|تخصصات الأطباء|عرفني على الأطباء|أبغى دكتور معين|فريق الأطباء|الكادر الطبي|الأطباء|دكتور|طبيب|متخصص/.test(t))
    return { intent: 'doctors', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/أغير الموعد|أبغى أغير الموعد|حابب أغير|الوقت ما يناسبني|ما أقدر أجي بذاك الوقت|غير الوقت|يوم ثاني|أجل موعدي|يوم آخر|أبغى وقت ثاني|ممكن نغير الوقت|ممكن نغير اليوم|إعادة جدولة/.test(t))
    return { intent: 'reschedule', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/ألغي موعدي|إلغاء الموعد|أبغى ألغي|حابب أألغي|بدي أألغي|ما راح أقدر أجي|مو قادر أجي|احذف موعدي|شيل حجزي|ما أبغى الموعد|بطلت أبغاه|صار عندي شغل|إلغاء/.test(t))
    return { intent: 'cancel', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/أبغى أكلم أحد|حابب أكلم أحد|بدي أكلم أحد|وصلني بالموظفين|أتكلم مع موظف|استقبال|خدمة العملاء|اتصل فيني|أبغى مكالمة|مو روبوت|التحدث مع الفريق|الموظفين|محتاج مساعدة بشرية|أكلم أحد|موظف/.test(t))
    return { intent: 'human', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/خدماتكم|إيش تسوون|وش تعالجون|عندكم تقويم|عندكم زراعة|عندكم تبييض|قائمة الخدمات|إيش تخصصاتكم|خدمات الأسنان|علاجات الأسنان|خدمات/.test(t))
    return { intent: 'services', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/أقيم|أعطي تقييم|تقييم جوجل|أشارك تجربتي|أوصي بكم|كيف أقيمكم|أبغى أعطي رأيي|أشارك رأيي|تقييم الخدمة|تقييم/.test(t))
    return { intent: 'reviews', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/متى موعدي|أي وقت موعدي|شو حجزت|إيش موعدي|اطلع موعدي|عندي موعد|موعدي مؤكد|تفاصيل موعدي|ذكرني بموعدي|حجزي|زيارتي|موعدي/.test(t))
    return { intent: 'my_appointment', detected_language: 'ar', extracted_value: null, confidence: 'low' };
  if (/هلا والله|كيف الحال|مساء النور|صباح النور|حياك|هلا فيك|الله يسلمك|هلا|مرحبا|السلام|أهلا|صباح|مساء/.test(t))
    return { intent: 'greeting', detected_language: 'ar', extracted_value: null, confidence: 'low' };

  // If mid-flow and no keyword matched an intent switch → it's a flow input
  if (currentFlow) {
    return { intent: 'continue_flow', detected_language: 'en', extracted_value: null, confidence: 'low' };
  }

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
          content: `Today is ${today}. Extract the appointment date from this text and return it as a formatted date string like "Monday, April 20, 2026" (always include the day name). Use today as reference for relative dates: "tomorrow"=next day, "next Monday"=next occurrence of Monday, "in 5 days"=today+5, "بكرة/غداً"=tomorrow, "بعد غد"=today+2, "الاثنين الجاي"=next Monday, "بعد 5 أيام"=today+5, "الأسبوع الجاي"=today+7. Arabic months: يناير=January, فبراير=February, مارس=March, أبريل=April, مايو=May, يونيو=June, يوليو=July, أغسطس=August, سبتمبر=September, أكتوبر=October, نوفمبر=November, ديسمبر=December. Arabic days: الاثنين=Monday, الثلاثاء=Tuesday, الأربعاء=Wednesday, الخميس=Thursday, الجمعة=Friday, السبت=Saturday, الأحد=Sunday. Relative date patterns: "after N days"/"in N days"=today+N, "next week"=today+7, "in N weeks"=today+N*7. Always strip filler words. Return a specific date like "Monday, April 7, 2026". If no date can be inferred, return the original text. Return ONLY the date string. Text: "${text}"`
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
          content: `Available time slots: ${slots.join(', ')}. Match this time request to the closest available slot. Rules: morning/الصبح/صباحاً→"9:00 AM", noon/الظهر→"1:00 PM", afternoon/بعد الظهر/العصر→"2:00 PM", evening/المساء/مساء/المغرب/after work→"5:00 PM". If the requested time is completely outside available slots return exactly the word null. Otherwise return ONLY the exact slot string. Time request: "${text}"`
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