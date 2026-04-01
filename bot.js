const { getPatient, insertPatient, savePatient, saveAppointment, getAppointment, updateAppointment } = require('./db');
const { sendMessage } = require('./whatsapp');
const { detectIntent, extractDate, extractTimeSlot } = require('./ai');

// ─────────────────────────────────────────────
// Static strings
// ─────────────────────────────────────────────

const LANG_SELECT = '🌐 Please choose your language / اختر لغتك:\n1️⃣ English\n2️⃣ العربية';

function menuEN(clinicName) {
  return `Welcome to ${clinicName}! 🦷✨\nI'm your AI dental assistant, available 24/7.\nHow can I help you today?\n\n1️⃣ Book appointment\n2️⃣ My appointment\n3️⃣ Reschedule\n4️⃣ Cancel appointment\n5️⃣ Our services\n6️⃣ Meet Our Doctors 👨‍⚕️\n7️⃣ Prices 💰\n8️⃣ Location 📍\n9️⃣ Leave a review ⭐\n🔟 Talk to staff 👩‍⚕️ (type 10)\n\nJust tap a number or tell me what you need 😊`;
}

function menuAR(clinicName) {
  return `أهلاً وسهلاً بك في ${clinicName}! 🦷✨\nأنا مساعدك الذكي، متاح على مدار الساعة.\nكيف يمكنني مساعدتك اليوم؟\n\n1️⃣ حجز موعد\n2️⃣ موعدي الحالي\n3️⃣ إعادة جدولة\n4️⃣ إلغاء الموعد\n5️⃣ خدماتنا\n6️⃣ تعرف على أطبائنا 👨‍⚕️\n7️⃣ الأسعار 💰\n8️⃣ الموقع 📍\n9️⃣ تقييم العيادة ⭐\n🔟 التحدث مع الفريق 👩‍⚕️ (اكتب 10)\n\nاضغط على رقم أو أخبرني بما تحتاج 😊`;
}


// ─────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────
async function handleMessage(phone, text, clinic) {
  const msg = text.trim();

  const cl = clinic || {
    name: 'Our Clinic',
    location: 'Please contact us for our address.',
    maps_link: 'https://maps.google.com',
    review_link: 'https://g.page/r/your-review-link',
    staff_phone: null,
    plan: 'basic',
    doctors: []
  };

  // ── Branch 1: Brand new patient
  let patient = await getPatient(phone);
  if (!patient) {
    await insertPatient(phone);
    return sendMessage(phone, LANG_SELECT);
  }

  // ── Branch 2: No language chosen yet
  if (!patient.language) {
    if (msg === '1' || /^english$/i.test(msg)) {
      await savePatient(phone, { language: 'en', current_flow: null, flow_step: 0, flow_data: {} });
      return sendMessage(phone, menuEN(cl.name));
    }
    if (msg === '2' || /^(arabic|عربي|العربية)$/i.test(msg)) {
      await savePatient(phone, { language: 'ar', current_flow: null, flow_step: 0, flow_data: {} });
      return sendMessage(phone, menuAR(cl.name));
    }
    return sendMessage(phone, LANG_SELECT);
  }

  // ── Branch 3: Full patient with language
  const lang = patient.language;
  const ar = lang === 'ar';
  const flow = patient.current_flow;
  const step = patient.flow_step || 0;
  const fd = patient.flow_data || {};

  // FIX 2 — Language switch mid-conversation (before intent detection)
  const langSwitch = msg.toLowerCase().trim();
  if (/^(english|switch to english|change to english)$/i.test(langSwitch)) {
    await savePatient(phone, { ...patient, language: 'en', current_flow: null, flow_step: 0 });
    return sendMessage(phone, menuEN(cl.name));
  }
  if (/^(arabic|عربي|عربية|switch to arabic)$/i.test(langSwitch)) {
    await savePatient(phone, { ...patient, language: 'ar', current_flow: null, flow_step: 0 });
    return sendMessage(phone, menuAR(cl.name));
  }

  const ai = await detectIntent(msg, flow, step);
  const { intent, extracted_value } = ai;

  // Language change — show picker so patient explicitly chooses
  if (intent === 'change_language' || /^(change language|language|لغة|تغيير اللغة|change lang)$/i.test(msg)) {
    await savePatient(phone, { ...patient, language: null, current_flow: null, flow_step: 0, flow_data: {} });
    return sendMessage(phone, LANG_SELECT);
  }

  // Greeting always clears any stale flow and shows menu
  if (intent === 'greeting') {
    await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
    return sendMessage(phone, ar ? menuAR(cl.name) : menuEN(cl.name));
  }

  // FIX 1 — Slot numbers above 9: bypass AI extraction, pass raw number directly
  if (flow === 'booking' && step === 7) {
    const num = parseInt(msg.trim());
    if (!isNaN(num) && num >= 1 && num <= 20) {
      return handleBookingFlow(phone, msg, msg, lang, ar, step, fd, patient, cl);
    }
  }

  // Active flow routing
  if (flow === 'booking') {
    // Numbers are always flow inputs — never treat as menu selections mid-flow
    const isNumber = /^\d+$/.test(msg.trim());
    if (!isNumber && intent !== 'continue_flow' && intent !== 'unknown') {
      const interruptReply = await getIntentReply(intent, ar, cl);
      if (interruptReply) {
        await sendMessage(phone, interruptReply);
        return sendMessage(phone, ar
          ? 'بالمناسبة، كنت في منتصف حجز موعد 😊\nهل تريد المتابعة؟\n1️⃣ نعم، أكمل الحجز\n2️⃣ لا، ابدأ من جديد'
          : 'By the way, you were in the middle of booking 😊\nWould you like to continue?\n1️⃣ Yes, continue booking\n2️⃣ No, start over'
        );
      }
    }
    return handleBookingFlow(phone, msg, extracted_value, lang, ar, step, fd, patient, cl);
  }

  if (flow === 'reschedule') {
    if (intent !== 'continue_flow' && intent !== 'unknown') {
      const interruptReply = await getIntentReply(intent, ar, cl);
      if (interruptReply) {
        await sendMessage(phone, interruptReply);
        return sendMessage(phone, ar
          ? 'بالمناسبة، كنت في منتصف إعادة جدولة موعدك 😊\nهل تريد المتابعة؟\n1️⃣ نعم، أكمل\n2️⃣ لا، ابدأ من جديد'
          : 'By the way, you were in the middle of rescheduling 😊\nWould you like to continue?\n1️⃣ Yes, continue\n2️⃣ No, start over'
        );
      }
      const clearedPatient = { ...patient, current_flow: null, flow_step: 0, flow_data: {} };
      await savePatient(phone, clearedPatient);
      return routeIntent(phone, intent, lang, ar, msg, clearedPatient, cl);
    }
    return handleRescheduleFlow(phone, msg, extracted_value, lang, ar, step, fd, patient, cl);
  }

  if (flow === 'cancel') {
    if (intent !== 'continue_flow' && intent !== 'unknown') {
      const interruptReply = await getIntentReply(intent, ar, cl);
      if (interruptReply) {
        await sendMessage(phone, interruptReply);
        return sendMessage(phone, ar
          ? 'بالمناسبة، كنت في منتصف إلغاء موعدك 😊\nهل تريد المتابعة؟\n1️⃣ نعم، أكمل\n2️⃣ لا، ابدأ من جديد'
          : 'By the way, you were in the middle of cancelling 😊\nWould you like to continue?\n1️⃣ Yes, continue\n2️⃣ No, start over'
        );
      }
      const clearedPatient = { ...patient, current_flow: null, flow_step: 0, flow_data: {} };
      await savePatient(phone, clearedPatient);
      return routeIntent(phone, intent, lang, ar, msg, clearedPatient, cl);
    }
    return handleCancelFlow(phone, msg, lang, ar, step, fd, patient, cl);
  }

  return routeIntent(phone, intent, lang, ar, msg, patient, cl);
}

// ─────────────────────────────────────────────
// Return a text reply for an intent (interrupt handling during flows)
// ─────────────────────────────────────────────
async function getIntentReply(intent, ar, cl) {
  switch (intent) {
    case 'services':       return servicesMsg(ar);
    case 'doctors':        return doctorsMsg(ar, cl);
    case 'prices':         return pricesMsg(ar);
    case 'location':       return locationMsg(ar, cl);
    case 'reviews':        return reviewMsg(ar, cl);
    case 'human':          return staffMsg(ar);
    case 'booking':
    case 'my_appointment':
    case 'reschedule':
    case 'cancel':
      return ar
        ? 'أنت حالياً في منتصف العملية 😊 أكمل الخطوة الحالية أو اضغط 0 للقائمة الرئيسية'
        : "You're currently in the middle of a process 😊 Continue the current step or press 0 for main menu";
    default:               return null;
  }
}

// ─────────────────────────────────────────────
// BOOKING FLOW — steps 1-8
// ─────────────────────────────────────────────

const EXIT_RE = /^(0|menu|main menu|back|go back|start over|cancel|stop|exit|quit|قائمة|قائمة رئيسية|رجوع|ارجع|إلغاء|توقف|خروج|من البداية)$/i;

// ─────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────

// BUG 2 — resolve "next monday" / bare weekday to actual date
function getNextWeekday(dayName) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const target = days.findIndex(d => d.toLowerCase() === dayName.toLowerCase());
  if (target === -1) return null;
  const today = new Date();
  let diff = target - today.getDay();
  if (diff <= 0) diff += 7;
  const result = new Date(today.getTime() + diff * 86400000);
  return result.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// BUG 3 — normalize raw date strings to readable title-case + year
function normalizeDate(dateStr) {
  if (!dateStr) return dateStr;
  // ISO format (2026-04-04) → readable
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }
  // Already fully formatted (has year as 4-digit number)
  if (/\b20\d{2}\b/.test(dateStr)) return dateStr;
  // Looks like "april 4" or "4 april" → title-case and append year
  return dateStr.replace(/\b\w/g, c => c.toUpperCase());
}

function calculateRelativeDate(text) {
  const t = text.toLowerCase().trim();
  const now = new Date();
  const fmt = (d) => d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  if (/^(tomorrow|tmrw|غداً|بكرة|غدا)$/i.test(t))
    return fmt(new Date(now.getTime() + 86400000));

  const afterDaysMatch = t.match(/(?:after|in|بعد|في)\s+(\d+)\s+(?:days?|أيام?|يوم)/i);
  if (afterDaysMatch)
    return fmt(new Date(now.getTime() + parseInt(afterDaysMatch[1]) * 86400000));

  // BUG 2 — "next monday" / bare weekday name
  const nextWeekdayMatch = t.match(/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
  if (nextWeekdayMatch) return getNextWeekday(nextWeekdayMatch[1]);
  if (/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.test(t))
    return getNextWeekday(t);

  if (/next week|الأسبوع الجاي|بعد أسبوع/i.test(t))
    return fmt(new Date(now.getTime() + 7 * 86400000));

  const weeksMatch = t.match(/in\s+(\d+)\s+weeks?/i);
  if (weeksMatch)
    return fmt(new Date(now.getTime() + parseInt(weeksMatch[1]) * 7 * 86400000));

  return null;
}

// ─────────────────────────────────────────────
// Treatment mapping
// ─────────────────────────────────────────────
function mapTreatment(input) {
  const s = String(input).trim().toLowerCase();
  if (/^[1-8]$/.test(s)) {
    return ['Cleaning & Polishing', 'Fillings', 'Braces & Orthodontics', 'Teeth Whitening', 'Extraction', 'Dental Implants', 'Root Canal', 'Other'][parseInt(s) - 1];
  }
  if (/clean|polish|تنظيف|تلميع|جرم/i.test(s))       return 'Cleaning & Polishing';
  if (/fill|cavity|حشو|تسوس/i.test(s))               return 'Fillings';
  if (/brace|orthodon|تقويم/i.test(s))               return 'Braces & Orthodontics';
  if (/whiten|bleach|تبييض/i.test(s))                return 'Teeth Whitening';
  if (/extract|pull|remov.*tooth|خلع|قلع/i.test(s))  return 'Extraction';
  if (/implant|زراعة/i.test(s))                      return 'Dental Implants';
  if (/root canal|nerve|عصب|جذر/i.test(s))           return 'Root Canal';
  if (/cleaning & polishing|fillings|braces & orthodontics|teeth whitening|extraction|dental implants|root canal|^other$/i.test(s)) return input; // already clean
  // Arabic menu labels → English
  if (/تنظيف وتلميع/i.test(s))    return 'Cleaning & Polishing';
  if (/حشوات/i.test(s))           return 'Fillings';
  if (/تقويم الأسنان/i.test(s))   return 'Braces & Orthodontics';
  if (/تبييض الأسنان/i.test(s))   return 'Teeth Whitening';
  if (/خلع/i.test(s))             return 'Extraction';
  if (/زراعة أسنان/i.test(s))     return 'Dental Implants';
  if (/علاج العصب/i.test(s))      return 'Root Canal';
  if (/أخرى/i.test(s))            return 'Other';
  // Unknown free text
  return `Other: ${String(input).trim()}`;
}

const EN_SLOTS = ['9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM'];
const AR_SLOTS = ['9:00 صباحاً', '10:00 صباحاً', '11:00 صباحاً', '1:00 مساءً', '2:00 مساءً', '3:00 مساءً', '4:00 مساءً', '5:00 مساءً'];

async function handleBookingFlow(phone, rawMsg, extractedValue, lang, ar, step, fd, patient, cl) {
  const val = (extractedValue !== null && extractedValue !== undefined) ? String(extractedValue) : rawMsg;

  // Bug 4 — Step 0 fallback: shouldn't normally happen but guard against corrupt state
  if (step === 0) {
    await savePatient(phone, { ...patient, flow_step: 1, flow_data: {} });
    return sendMessage(phone, ar
      ? 'رائع! لنبدأ الحجز 😊\nما اسمك الكريم؟\n\n0️⃣ القائمة الرئيسية'
      : "Great! Let's book your appointment 😊\nWhat's your full name?\n\n0️⃣ Main menu"
    );
  }

  // Step 4 — Notes (optional): handle BEFORE EXIT_RE so "0" skips instead of exiting
  if (step === 4) {
    const isSkip = rawMsg.trim() === '0' || /^(skip|no|nothing|لا|تخطي)$/i.test(rawMsg.trim());
    fd.description = isSkip ? '' : rawMsg.trim();
    await savePatient(phone, { ...patient, flow_step: 5, flow_data: fd });
    // Step 5 is now doctor selection — show doctor menu if doctors configured, else date prompt
    const doctors = cl.doctors || [];
    if (doctors.length > 0) {
      return sendMessage(phone, doctorSelectionMsg(ar, doctors));
    }
    return sendMessage(phone, ar
      ? 'متى تفضل موعدك؟ 📅\nيمكنك قول:\n• غداً\n• الاثنين الجاي\n• 20 أبريل\n• أي تاريخ محدد\n\n0️⃣ القائمة الرئيسية'
      : 'When would you like your appointment? 📅\nYou can say:\n• Tomorrow\n• Next Monday\n• April 20\n• Any specific date\n\n0️⃣ Main menu'
    );
  }

  // Exit keywords — only during data-entry steps, not on binary confirm steps
  if (step <= 7 && EXIT_RE.test(rawMsg.trim())) {
    await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
    return sendMessage(phone, ar ? menuAR(cl.name) : menuEN(cl.name));
  }

  // Step 1 — Name
  if (step === 1) {
    const rawName = val.trim();

    // Reject: symptom/pain words entered instead of a name
    if (/يوجع|ألم|وجع|pain|hurt|ache|toothache|cavity|tooth/i.test(rawName)) {
      return sendMessage(phone, ar
        ? 'يبدو أن عندك ألم 😊 لنبدأ الحجز — ما اسمك الكريم؟'
        : "Sounds like you have a dental issue 😊 Let's get you booked — what's your full name?"
      );
    }
    // Reject: too short or a number
    if (rawName.length < 2 || /^\d+$/.test(rawName)) {
      return sendMessage(phone, ar
        ? 'يرجى إدخال اسمك الكريم 😊'
        : 'Please enter your full name 😊'
      );
    }

    // Clean: strip common prefixes, capitalize each word
    let name = rawName.replace(/^(my name is|i'm|i am|call me|اسمي|أنا|انا|يقولون لي)\s+/i, '').trim();
    name = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    fd.name = name;
    await savePatient(phone, { ...patient, flow_step: 2, flow_data: fd });
    return sendMessage(phone, ar
      ? `شكراً ${fd.name}! 😊\nرقم واتساب الخاص بك: *${phone}*\nهل هذا صحيح؟\n1️⃣ نعم، هذا صحيح\n2️⃣ لا، أريد رقماً آخر\n\n0️⃣ القائمة الرئيسية`
      : `Thanks ${fd.name}! 😊\nYour WhatsApp number is: *${phone}*\nIs this correct?\n1️⃣ Yes, that's correct\n2️⃣ No, use a different number\n\n0️⃣ Main menu`
    );
  }

  // Step 2 — Confirm phone
  if (step === 2) {
    if (val === '2' || /^(no|change|لا|تغيير)$/i.test(val)) {
      await savePatient(phone, { ...patient, flow_step: 21, flow_data: fd });
      return sendMessage(phone, ar ? 'من فضلك أدخل رقم هاتفك:' : 'Please enter your phone number:');
    }
    fd.phone = phone;
    await savePatient(phone, { ...patient, flow_step: 3, flow_data: fd });
    return sendMessage(phone, treatmentMenuMsg(ar));
  }

  // Step 21 — Custom phone entry
  if (step === 21) {
    fd.phone = val;
    await savePatient(phone, { ...patient, flow_step: 3, flow_data: fd });
    return sendMessage(phone, treatmentMenuMsg(ar));
  }

  // Step 3 — Treatment type
  if (step === 3) {
    // Always resolve to a clean English category via mapTreatment
    const source = (!isNaN(parseInt(rawMsg)) && parseInt(rawMsg) >= 1 && parseInt(rawMsg) <= 8)
      ? rawMsg                          // number input → mapTreatment handles it
      : (extractedValue || rawMsg);     // AI value or free text
    fd.treatment = mapTreatment(source);
    await savePatient(phone, { ...patient, flow_step: 4, flow_data: fd });
    return sendMessage(phone, ar
      ? 'هل لديك ملاحظات أو وصف للمشكلة؟ (اختياري)\nاكتب ملاحظتك أو أرسل *skip* للتخطي\n\n0️⃣ القائمة الرئيسية'
      : 'Do you have any notes or description of your issue? (optional)\nType your note or send *skip* to continue\n\n0️⃣ Main menu'
    );
  }

  // Step 5 — Doctor selection (BEFORE date — doctor schedule determines available days)
  if (step === 5) {
    const doctors = cl.doctors || [];
    if (doctors.length === 0) {
      // No doctors configured — skip straight to date
      fd.doctor_id   = null;
      fd.doctor_name = null;
      await savePatient(phone, { ...patient, flow_step: 6, flow_data: fd });
      return sendMessage(phone, ar
        ? 'متى تفضل موعدك؟ 📅\nيمكنك قول:\n• غداً\n• الاثنين الجاي\n• 20 أبريل\n• أي تاريخ محدد\n\n0️⃣ القائمة الرئيسية'
        : 'When would you like your appointment? 📅\nYou can say:\n• Tomorrow\n• Next Monday\n• April 20\n• Any specific date\n\n0️⃣ Main menu'
      );
    }
    const num = parseInt(rawMsg);
    if (rawMsg.trim() === '0' || /^(skip|any|no preference|لا يهم|تخطي|أي طبيب)$/i.test(rawMsg.trim())) {
      fd.doctor_id   = null;
      fd.doctor_name = null;
    } else if (num >= 1 && num <= doctors.length) {
      const doc = doctors[num - 1];
      fd.doctor_id   = doc.id || null;
      fd.doctor_name = ar ? (doc.name_ar || doc.name) : doc.name;
    } else {
      // Free-text or unrecognised — re-show doctor menu
      return sendMessage(phone, doctorSelectionMsg(ar, doctors));
    }
    await savePatient(phone, { ...patient, flow_step: 6, flow_data: fd });
    return sendMessage(phone, ar
      ? 'متى تفضل موعدك؟ 📅\nيمكنك قول:\n• غداً\n• الاثنين الجاي\n• 20 أبريل\n• أي تاريخ محدد\n\n0️⃣ القائمة الرئيسية'
      : 'When would you like your appointment? 📅\nYou can say:\n• Tomorrow\n• Next Monday\n• April 20\n• Any specific date\n\n0️⃣ Main menu'
    );
  }

  // Step 6 — Date (with doctor schedule validation)
  if (step === 6) {
    const dateInput = rawMsg.trim();

    // Reject empty or single-char
    if (dateInput.length < 2) {
      return sendMessage(phone, ar
        ? 'يرجى إدخال تاريخ مثل: غداً، الاثنين، أو 20 أبريل 😊\n\n0️⃣ القائمة الرئيسية'
        : 'Please enter a date like: tomorrow, Monday, or April 20 😊\n\n0️⃣ Main menu'
      );
    }

    // 1) Fast local relative date calculation
    let parsedDate = calculateRelativeDate(dateInput);
    // 2) AI fallback for everything else
    if (!parsedDate) {
      try {
        const aiDate = await extractDate(dateInput);
        if (aiDate && aiDate.length > 2 && aiDate !== 'null') {
          parsedDate = aiDate;
        }
      } catch (e) {
        console.error('[Step6] extractDate error:', e.message);
      }
    }

    // Bug 2 fix — if still no parsed date, check if input looks like a date attempt
    if (!parsedDate || parsedDate === dateInput) {
      const looksLikeDate = /\d|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|tomorrow|tmrw|next|غداً|بكرة|الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت|الأحد|يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر|الأسبوع/i.test(dateInput);
      if (!looksLikeDate) {
        // Looks like a booking phrase or random text — re-ask, don't save garbage
        return sendMessage(phone, ar
          ? 'يرجى إدخال تاريخ الموعد 😊 مثال: غداً، 20 أبريل، الاثنين الجاي\n\n0️⃣ القائمة الرئيسية'
          : 'Please enter a date for your appointment 😊 Example: tomorrow, April 20, next Monday\n\n0️⃣ Main menu'
        );
      }
      // Looks like a date attempt — save as-is
      if (!parsedDate) parsedDate = dateInput;
    }

    console.log(`[Step6] date input="${dateInput}" parsed="${parsedDate}"`);

    // Doctor schedule validation — check if doctor works on the selected day
    if (fd.doctor_id && cl.id) {
      try {
        const { getDoctorSchedule, toDateISO, getDayName } = require('./slots');
        const isoDate = toDateISO(parsedDate);
        if (isoDate) {
          const schedule = await getDoctorSchedule(cl.id, fd.doctor_id);
          if (schedule && schedule.working_days) {
            const dayName = getDayName(isoDate);
            if (!schedule.working_days.includes(dayName)) {
              const workDays = Array.isArray(schedule.working_days)
                ? schedule.working_days.join(', ')
                : schedule.working_days;
              return sendMessage(phone, ar
                ? `د. ${fd.doctor_name} غير متاح في هذا اليوم. يعمل في: ${workDays}. يرجى اختيار تاريخ آخر:\n\n0️⃣ القائمة الرئيسية`
                : `Dr. ${fd.doctor_name} is not available on ${dayName}. They work on: ${workDays}. Please choose another date:\n\n0️⃣ Main menu`
              );
            }
          }
        }
      } catch (e) {
        console.error('[Step6] schedule check error:', e.message);
        // Non-blocking — proceed if schedule check fails
      }
    }

    fd.preferred_date     = normalizeDate(parsedDate); // BUG 3 — title-case + year
    fd.preferred_date_raw = dateInput;
    // Store ISO for slot lookups
    try {
      const { toDateISO } = require('./slots');
      fd.preferred_date_iso = toDateISO(parsedDate) || null;
    } catch (e) { fd.preferred_date_iso = null; }

    await savePatient(phone, { ...patient, flow_step: 7, flow_data: fd });
    return sendMessage(phone, ar ? '⏳ جاري التحقق من المواعيد المتاحة...' : '⏳ Checking available slots...');
  }

  // Step 7 — Dynamic time slots (based on doctor + date)
  // This step has two sub-phases: showing slots (7a) and receiving selection (7b)
  // fd.available_slots_shown = true after slots are displayed
  if (step === 7) {
    const { getAvailableSlots } = require('./slots');

    // 7a — Show available slots (first time entering step 7)
    if (!fd.available_slots_shown) {
      let slots = [];
      const isoDate = fd.preferred_date_iso;

      if (fd.doctor_id && isoDate && cl.id) {
        try {
          slots = await getAvailableSlots(cl.id, fd.doctor_id, isoDate);
        } catch (e) {
          console.error('[Step7] getAvailableSlots error:', e.message);
        }
      }

      // No slots for this doctor+date combo
      if (fd.doctor_id && slots.length === 0) {
        // Reset to step 6 to re-ask for date
        await savePatient(phone, { ...patient, flow_step: 6, flow_data: { ...fd, available_slots_shown: false } });
        return sendMessage(phone, ar
          ? `لا توجد مواعيد متاحة في ${fd.preferred_date} مع د. ${fd.doctor_name}. يرجى اختيار تاريخ آخر:\n\n0️⃣ القائمة الرئيسية`
          : `No slots available on ${fd.preferred_date} for Dr. ${fd.doctor_name}. Please choose another date:\n\n0️⃣ Main menu`
        );
      }

      // Build numbered slot list
      let slotLines, slotKeys, slotDisplays;
      if (slots.length > 0) {
        slotKeys     = slots.map(s => s.slot_time);
        slotDisplays = slots.map(s => ar ? s.slot_time_display_ar : s.slot_time_display); // BUG 1
        slotLines    = slotDisplays.map((d, i) => `${i + 1}️⃣ ${d}`);
      } else {
        // No doctor selected — use generic fixed slots
        slotKeys     = EN_SLOTS.map((_, i) => String(i + 1));
        slotDisplays = ar ? AR_SLOTS : EN_SLOTS; // BUG 1
        slotLines    = slotDisplays.map((s, i) => `${i + 1}️⃣ ${s}`);
      }

      const doctorLabel = fd.doctor_name
        ? (ar ? `مع د. ${fd.doctor_name}` : `with Dr. ${fd.doctor_name}`)
        : '';
      fd.available_slots_shown = true;
      fd.slot_keys             = slotKeys;
      fd.slot_displays         = slotDisplays; // BUG 1 — store formatted labels for fallback
      await savePatient(phone, { ...patient, flow_step: 7, flow_data: fd });

      const header7 = ar
        ? `المواعيد المتاحة ${doctorLabel} في ${fd.preferred_date}:`
        : `Available times ${doctorLabel} on ${fd.preferred_date}:`;
      const instruction7 = ar ? '\nأرسل رقم الموعد المناسب لك ⬆️' : '\nReply with a number to select your preferred time ⬆️'; // BUG 4
      return sendMessage(phone, `${header7}\n\n${slotLines.join('\n')}${instruction7}\n\n0️⃣ ${ar ? 'القائمة الرئيسية' : 'Main menu'}`);
    }

    // 7b — Patient is selecting a slot
    const slotKeys = fd.slot_keys || [];
    const num7 = parseInt(rawMsg.trim());

    if (num7 >= 1 && num7 <= slotKeys.length) {
      // Doctor-managed slots: store the slot_time key
      if (fd.doctor_id && fd.preferred_date_iso) {
        fd.slot_time_key = slotKeys[num7 - 1]; // HH:MM for bookSlot
        // Build display label from doctor slots (re-fetch or use index)
        const { getAvailableSlots: gas } = require('./slots');
        let displayEn = EN_SLOTS[num7 - 1] || slotKeys[num7 - 1];
        let displayAr = AR_SLOTS[num7 - 1] || slotKeys[num7 - 1];
        try {
          const slots2 = await gas(cl.id, fd.doctor_id, fd.preferred_date_iso);
          if (slots2[num7 - 1]) {
            displayEn = slots2[num7 - 1].slot_time_display;
            displayAr = slots2[num7 - 1].slot_time_display_ar;
          }
        } catch (e) { /* use fallback labels */ }
        fd.time_slot = ar ? displayAr : displayEn;
      } else {
        // Generic fixed slots
        fd.time_slot     = ar ? AR_SLOTS[num7 - 1] : EN_SLOTS[num7 - 1];
        fd.slot_time_key = null;
      }
    } else {
      // Try natural language → extractTimeSlot
      const matched = await extractTimeSlot(rawMsg, EN_SLOTS);
      if (!matched) {
        // Re-show slot list using formatted display labels (BUG 1 — not raw slot_time)
        const displays2 = fd.slot_displays || fd.slot_keys || [];
        const slotLines2 = displays2.map((d, i) => `${i + 1}️⃣ ${d}`);
        const instruction2 = ar ? '\nأرسل رقم الموعد المناسب لك ⬆️' : '\nReply with a number to select your preferred time ⬆️';
        return sendMessage(phone, ar
          ? `هذا الوقت غير متاح 😊 يرجى الاختيار من المواعيد المتاحة:\n\n${slotLines2.join('\n')}${instruction2}\n\n0️⃣ القائمة الرئيسية`
          : `That time isn't available 😊 Please choose from the available slots:\n\n${slotLines2.join('\n')}${instruction2}\n\n0️⃣ Main menu`
        );
      }
      // Bug 3 fix: store correct language format
      const enIndex = EN_SLOTS.indexOf(matched);
      fd.time_slot     = ar ? (AR_SLOTS[enIndex] || matched) : matched;
      fd.slot_time_key = null;
    }

    fd.slot_time_raw = rawMsg.trim(); // FIX 3 — preserve raw slot input
    await savePatient(phone, { ...patient, flow_step: 8, flow_data: fd });
    return sendMessage(phone, bookingSummaryMsg(ar, fd, phone, cl));
  }

  // Step 8 — Booking confirmation (use rawMsg directly — AI extraction unreliable here)
  if (step === 8) {
    const raw8 = rawMsg.trim();
    const confirmed = raw8 === '1' || /^(yes|confirm|نعم|أؤكد|تمام|ايوه|موافق|صح|يلا)$/i.test(raw8);
    const denied    = raw8 === '2' || /^(no|back|لا|لأ|العودة|رجوع)$/i.test(raw8);

    if (confirmed) {
      // If doctor slot exists → lock it atomically first
      if (fd.doctor_id && fd.preferred_date_iso && fd.slot_time_key && cl.id) {
        const { bookSlot } = require('./slots');
        const result = await bookSlot(cl.id, fd.doctor_id, fd.preferred_date_iso, fd.slot_time_key, phone);
        if (!result.success && result.reason === 'slot_taken') {
          // Slot was taken by another patient — reset to step 7 to re-show slots
          await savePatient(phone, { ...patient, flow_step: 7, flow_data: { ...fd, available_slots_shown: false } });
          return sendMessage(phone, ar
            ? `عذراً، تم حجز هذا الموعد للتو من قِبل شخص آخر 😊 إليك المواعيد المتاحة في ${fd.preferred_date}:`
            : `Sorry, that slot was just taken by another patient 😊 Here are the available slots on ${fd.preferred_date}:`
          );
        }
      }

      // FIX 3 — verify all fields present before saving
      console.log('[Booking] Saving fd:', JSON.stringify(fd));
      const savedAppt = await saveAppointment({
        phone:             fd.phone || phone,
        clinic_id:         cl.id || null,
        name:              fd.name,
        treatment:         fd.treatment,
        description:       fd.description,
        preferred_date:    fd.preferred_date,
        preferred_date_raw: fd.preferred_date_raw || null,
        time_slot:         fd.time_slot,
        slot_time_raw:     fd.slot_time_raw || null,
        doctor_id:         fd.doctor_id || null,
        doctor_name:       fd.doctor_name || null
      });

      // Link slot to appointment if both IDs are available
      if (savedAppt && fd.doctor_id && fd.preferred_date_iso && fd.slot_time_key && cl.id) {
        const { linkSlotToAppointment } = require('./slots');
        await linkSlotToAppointment(cl.id, fd.doctor_id, fd.preferred_date_iso, phone, savedAppt.id);
      }

      await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
      if (cl.staff_phone) {
        // FIX 5 — staff alert always in English regardless of patient language
        const STAFF_AR = ['9:00 صباحاً','9:30 صباحاً','10:00 صباحاً','10:30 صباحاً','11:00 صباحاً','11:30 صباحاً','12:00 مساءً','12:30 مساءً','2:00 مساءً','2:30 مساءً','3:00 مساءً','3:30 مساءً','4:00 مساءً','4:30 مساءً'];
        const STAFF_EN = ['9:00 AM','9:30 AM','10:00 AM','10:30 AM','11:00 AM','11:30 AM','12:00 PM','12:30 PM','2:00 PM','2:30 PM','3:00 PM','3:30 PM','4:00 PM','4:30 PM'];
        const arIdx = STAFF_AR.indexOf(fd.time_slot);
        const staffTime = arIdx >= 0 ? STAFF_EN[arIdx] : fd.time_slot;
        const doctorLine = fd.doctor_name ? `\n👨‍⚕️ Doctor: ${fd.doctor_name}` : '';
        await sendMessage(cl.staff_phone,
          `🦷 New Booking Alert!\n━━━━━━━━━━━━━━\n👤 Patient: ${fd.name}\n📱 Phone: ${fd.phone || phone}\n🔧 Treatment: ${fd.treatment}\n📝 Notes: ${fd.description || 'None'}${doctorLine}\n📅 Date: ${fd.preferred_date}\n⏰ Time: ${staffTime}\n━━━━━━━━━━━━━━\nBooked via WhatsApp AI ✅`
        );
      }
      return sendMessage(phone, ar
        ? `🎉 *تم تأكيد موعدك!*\n\n📅 ${fd.preferred_date}\n⏰ ${fd.time_slot}\n🏥 ${cl.name}\n🦷 ${fd.treatment}\n\nسنرسل لك تذكيراً قبل موعدك. نراك قريباً! 😊`
        : `🎉 *Appointment Confirmed!*\n\n📅 ${fd.preferred_date}\n⏰ ${fd.time_slot}\n🏥 ${cl.name}\n🦷 ${fd.treatment}\n\nWe'll send you a reminder before your appointment. See you then! 😊`
      );
    } else if (denied) {
      await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
      return sendMessage(phone, ar ? menuAR(cl.name) : menuEN(cl.name));
    } else {
      // Unrecognised input — re-show summary
      return sendMessage(phone, bookingSummaryMsg(ar, fd, phone, cl));
    }
  }
}

// ─────────────────────────────────────────────
// RESCHEDULE FLOW
// ─────────────────────────────────────────────
async function handleRescheduleFlow(phone, rawMsg, extractedValue, lang, ar, step, fd, patient, cl) {
  console.log('[Reschedule] step:', step, 'fd:', JSON.stringify(fd));
  try {
  const val = (extractedValue !== null && extractedValue !== undefined) ? String(extractedValue) : rawMsg;

  // Step 1 — New date (AI-parsed)
  if (step === 1) {
    const dateInput = rawMsg.trim();

    if (dateInput.length < 2) {
      await savePatient(phone, { ...patient, flow_step: 1, flow_data: fd });
      return sendMessage(phone, ar
        ? 'يرجى إدخال تاريخ مثل: غداً، الاثنين، أو 20 أبريل 😊'
        : 'Please enter a date like: tomorrow, Monday, or April 20 😊'
      );
    }


    // Bug 5 fix: use local relative-date calculation first, then AI fallback
    let parsedDate = calculateRelativeDate(dateInput);
    if (!parsedDate) {
      try {
        const extracted = await extractDate(dateInput);
        if (extracted && extracted.length > 2 && extracted !== 'null') {
          parsedDate = extracted;
        }
      } catch (e) {
        console.error('[RescheduleStep1] extractDate error:', e.message);
      }
    }
    if (!parsedDate) parsedDate = dateInput;

    console.log(`[RescheduleStep1] date input="${dateInput}" parsed="${parsedDate}"`);
    fd.new_date = parsedDate;
    await savePatient(phone, { ...patient, flow_step: 2, flow_data: fd });
    return sendMessage(phone, timeSlotMsg(ar));
  }

  // Step 2 — New time slot
  if (step === 2) {
    const num = parseInt(rawMsg);
    if (num >= 1 && num <= 8) {
      fd.new_slot = ar ? AR_SLOTS[num - 1] : EN_SLOTS[num - 1];
    } else {
      const matched = await extractTimeSlot(rawMsg, EN_SLOTS);
      if (!matched) {
        return sendMessage(phone, ar
          ? 'هذا الوقت غير متاح في جدولنا 😊 يرجى الاختيار من الأوقات المتاحة:\n\n1️⃣ 9:00 صباحاً\n2️⃣ 10:00 صباحاً\n3️⃣ 11:00 صباحاً\n4️⃣ 1:00 مساءً\n5️⃣ 2:00 مساءً\n6️⃣ 3:00 مساءً\n7️⃣ 4:00 مساءً\n8️⃣ 5:00 مساءً\n\n0️⃣ القائمة الرئيسية'
          : "That time isn't in our schedule 😊 Please choose from the available slots:\n\n1️⃣ 9:00 AM\n2️⃣ 10:00 AM\n3️⃣ 11:00 AM\n4️⃣ 1:00 PM\n5️⃣ 2:00 PM\n6️⃣ 3:00 PM\n7️⃣ 4:00 PM\n8️⃣ 5:00 PM\n\n0️⃣ Main menu"
        );
      }
      fd.new_slot = matched;
    }
    await savePatient(phone, { ...patient, flow_step: 3, flow_data: fd });
    return sendMessage(phone, ar
      ? `✅ الموعد الجديد:\n📅 ${fd.new_date} الساعة ⏰ ${fd.new_slot}\n\nهل تؤكد؟\n1️⃣ نعم\n2️⃣ لا`
      : `✅ New appointment:\n📅 ${fd.new_date} at ⏰ ${fd.new_slot}\n\nConfirm?\n1️⃣ Yes\n2️⃣ No`
    );
  }

  // Step 3 — Confirm reschedule
  if (step === 3) {
    const confirmed = val === '1' || /^(yes|نعم|تمام|ايوه|موافق)$/i.test(val);
    if (confirmed && fd.appointment_id) {
      await updateAppointment(fd.appointment_id, {
        preferred_date:    fd.new_date,
        time_slot:         fd.new_slot,
        reminder_sent_24h: false,
        reminder_sent_1h:  false
      });
      if (cl.staff_phone) {
        await sendMessage(cl.staff_phone,
          `🔄 Appointment Rescheduled!\n👤 Patient: ${fd.name}\n📱 Phone: ${phone}\n📅 New Date: ${fd.new_date}\n⏰ New Time: ${fd.new_slot}`
        );
      }
      await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
      return sendMessage(phone, ar
        ? `✅ تم إعادة جدولة موعدك!\nالموعد الجديد: ${fd.new_date} الساعة ${fd.new_slot}\nنراك قريباً! 😊`
        : `✅ Appointment rescheduled!\nNew appointment: ${fd.new_date} at ${fd.new_slot}\nWe'll see you then! 😊`
      );
    } else {
      await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
      return sendMessage(phone, ar ? menuAR(cl.name) : menuEN(cl.name));
    }
  }
  } catch (err) {
    console.error('[Reschedule] Error:', err.message);
    await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
    return sendMessage(phone, ar ? menuAR(cl.name) : menuEN(cl.name));
  }
}

// ─────────────────────────────────────────────
// CANCEL FLOW
// ─────────────────────────────────────────────
async function handleCancelFlow(phone, rawMsg, lang, ar, step, fd, patient, cl) {
  const val = rawMsg.trim();

  if (step === 1) {
    const confirmed = val === '1' || /^(yes|نعم|تمام|ايوه|موافق)$/i.test(val);
    if (confirmed && fd.appointment_id) {
      await updateAppointment(fd.appointment_id, { status: 'cancelled' });
      if (cl.staff_phone) {
        await sendMessage(cl.staff_phone,
          `❌ Appointment Cancelled!\n👤 Patient: ${fd.name}\n📱 Phone: ${phone}\n📅 Date: ${fd.appt_date}\n⏰ Time: ${fd.appt_slot}`
        );
      }
      await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
      return sendMessage(phone, ar
        ? 'تم إلغاء موعدك.\nنأمل أن نراك قريباً! 😊\n1️⃣ حجز موعد جديد\n2️⃣ العودة للقائمة'
        : 'Your appointment has been cancelled.\nWe hope to see you soon! 😊\n1️⃣ Book a new appointment\n2️⃣ Back to menu'
      );
    } else {
      await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
      return sendMessage(phone, ar
        ? `حسناً، تم الاحتفاظ بموعدك. نراك في ${fd.appt_date}! 😊`
        : `OK, your appointment is kept. See you on ${fd.appt_date}! 😊`
      );
    }
  }
}

// ─────────────────────────────────────────────
// Route intent (main menu, no active flow)
// ─────────────────────────────────────────────
async function routeIntent(phone, intent, lang, ar, rawMsg, patient, cl) {
  // Explicit menu number mapping — reliable regardless of AI interpretation
  const numMap = {
    '0': 'greeting',
    '1': 'booking', '2': 'my_appointment', '3': 'reschedule',
    '4': 'cancel',  '5': 'services',       '6': 'doctors',
    '7': 'prices',  '8': 'location',       '9': 'reviews', '10': 'human', '🔟': 'human'
  };
  const resolvedIntent = numMap[rawMsg.trim()] || intent;

  switch (resolvedIntent) {
    case 'greeting':
      return sendMessage(phone, ar ? menuAR(cl.name) : menuEN(cl.name));

    case 'booking':
      await savePatient(phone, { ...patient, current_flow: 'booking', flow_step: 1, flow_data: {} });
      return sendMessage(phone, ar
        ? 'رائع! لنبدأ الحجز 😊\nما اسمك الكريم؟\n\n0️⃣ القائمة الرئيسية'
        : "Great! Let's book your appointment 😊\nWhat's your full name?\n\n0️⃣ Main menu"
      );

    case 'my_appointment': {
      const appt = await getAppointment(phone);
      if (!appt) {
        return sendMessage(phone, ar
          ? 'ليس لديك أي مواعيد قادمة.\nهل تريد حجز موعد؟\n1️⃣ حجز موعد\n2️⃣ العودة للقائمة'
          : "You don't have any upcoming appointments.\nWould you like to book one?\n1️⃣ Book appointment\n2️⃣ Back to menu"
        );
      }
      return sendMessage(phone, ar
        ? `📋 موعدك القادم:\n\n👤 الاسم: ${appt.name}\n🦷 العلاج: ${appt.treatment}\n📅 التاريخ: ${appt.preferred_date}\n⏰ الوقت: ${appt.time_slot}\n🏥 العيادة: ${cl.name}\n📊 الحالة: مؤكد ✅\n\nهل تريد تغيير شيء؟\n1️⃣ إعادة جدولة\n2️⃣ إلغاء الموعد\n3️⃣ العودة للقائمة`
        : `📋 Your upcoming appointment:\n\n👤 Name: ${appt.name}\n🦷 Treatment: ${appt.treatment}\n📅 Date: ${appt.preferred_date}\n⏰ Time: ${appt.time_slot}\n🏥 Clinic: ${cl.name}\n📊 Status: Confirmed ✅\n\nNeed to change anything?\n1️⃣ Reschedule\n2️⃣ Cancel\n3️⃣ Back to menu`
      );
    }

    case 'reschedule': {
      const appt = await getAppointment(phone);
      if (!appt) {
        return sendMessage(phone, ar
          ? 'ليس لديك مواعيد قادمة للإعادة جدولة.'
          : 'You have no upcoming appointments to reschedule.'
        );
      }
      await savePatient(phone, { ...patient, current_flow: 'reschedule', flow_step: 1, flow_data: { appointment_id: appt.id, name: appt.name } });
      return sendMessage(phone, ar
        ? `موعدك الحالي:\n📅 ${appt.preferred_date} الساعة ⏰ ${appt.time_slot}\n\nما هو التاريخ الجديد المفضل لديك؟`
        : `Your current appointment:\n📅 ${appt.preferred_date} at ⏰ ${appt.time_slot}\n\nWhat's your new preferred date?`
      );
    }

    case 'cancel': {
      const appt = await getAppointment(phone);
      if (!appt) {
        return sendMessage(phone, ar
          ? 'ليس لديك مواعيد قادمة للإلغاء.'
          : 'You have no upcoming appointments to cancel.'
        );
      }
      await savePatient(phone, { ...patient, current_flow: 'cancel', flow_step: 1, flow_data: { appointment_id: appt.id, name: appt.name, appt_date: appt.preferred_date, appt_slot: appt.time_slot } });
      return sendMessage(phone, ar
        ? `هل أنت متأكد من إلغاء موعدك في ${appt.preferred_date} الساعة ${appt.time_slot}؟\n1️⃣ نعم، ألغِ الموعد\n2️⃣ لا، احتفظ بالموعد`
        : `Are you sure you want to cancel your appointment on ${appt.preferred_date} at ${appt.time_slot}?\n1️⃣ Yes, cancel it\n2️⃣ No, keep it`
      );
    }

    case 'services':
      return sendMessage(phone, servicesMsg(ar));

    case 'doctors':
      return sendMessage(phone, doctorsMsg(ar, cl));

    case 'prices':
      return sendMessage(phone, pricesMsg(ar));

    case 'location':
      return sendMessage(phone, locationMsg(ar, cl));

    case 'reviews':
      return sendMessage(phone, reviewMsg(ar, cl));

    case 'human':
      return sendMessage(phone, staffMsg(ar));

    default:
      return sendMessage(phone, ar
        ? `لم أفهم تماماً 😊 إليك ما يمكنني مساعدتك به:\n\n${menuAR(cl.name)}`
        : `I'm not sure I understood that 😊 Here's what I can help you with:\n\n${menuEN(cl.name)}`
      );
  }
}

// ─────────────────────────────────────────────
// Message builders
// ─────────────────────────────────────────────

function bookingSummaryMsg(ar, fd, phone, cl) {
  const doctor = fd.doctor_name || (ar ? 'بدون تفضيل' : 'No preference');
  const notes  = fd.description || (ar ? 'لا يوجد' : 'None');
  // FIX 4 — convert time to Arabic format in Arabic mode
  const SUM_EN = ['9:00 AM','9:30 AM','10:00 AM','10:30 AM','11:00 AM','11:30 AM','12:00 PM','12:30 PM','2:00 PM','2:30 PM','3:00 PM','3:30 PM','4:00 PM','4:30 PM'];
  const SUM_AR = ['9:00 صباحاً','9:30 صباحاً','10:00 صباحاً','10:30 صباحاً','11:00 صباحاً','11:30 صباحاً','12:00 مساءً','12:30 مساءً','2:00 مساءً','2:30 مساءً','3:00 مساءً','3:30 مساءً','4:00 مساءً','4:30 مساءً'];
  const idx = SUM_EN.indexOf(fd.time_slot);
  const displayTime = ar && idx >= 0 ? SUM_AR[idx] : fd.time_slot;
  return ar
    ? `✅ *ملخص الحجز*\n\n👤 *الاسم:* ${fd.name}\n📱 *الهاتف:* ${fd.phone || phone}\n🦷 *العلاج:* ${fd.treatment}\n📝 *الملاحظات:* ${notes}\n👨‍⚕️ *الطبيب:* ${doctor}\n📅 *التاريخ:* ${fd.preferred_date}\n⏰ *الوقت:* ${displayTime}\n🏥 *العيادة:* ${cl.name}\n\nهل كل شيء صحيح؟\n1️⃣ نعم، أؤكد الحجز ✅\n2️⃣ لا، أريد تغيير شيء`
    : `✅ *Booking Summary*\n\n👤 *Name:* ${fd.name}\n📱 *Phone:* ${fd.phone || phone}\n🦷 *Treatment:* ${fd.treatment}\n📝 *Notes:* ${notes}\n👨‍⚕️ *Doctor:* ${doctor}\n📅 *Date:* ${fd.preferred_date}\n⏰ *Time:* ${fd.time_slot}\n🏥 *Clinic:* ${cl.name}\n\nDoes everything look correct?\n1️⃣ Yes, confirm booking ✅\n2️⃣ No, make changes`;
}

function doctorSelectionMsg(ar, doctors) {
  const lines = doctors.map((doc, i) => ar
    ? `${i + 1}️⃣ د. ${doc.name_ar || doc.name}\n🎓 الدرجة: ${doc.degree_ar || doc.degree}\n⭐ التخصص: ${doc.specialization_ar || doc.specialization}\n📅 متاح: ${doc.available_ar || doc.available}`
    : `${i + 1}️⃣ Dr. ${doc.name}\n🎓 Degree: ${doc.degree}\n⭐ Specialization: ${doc.specialization}\n📅 Available: ${doc.available}`
  );
  return ar
    ? `👨‍⚕️ فريقنا الطبي:\n\n${lines.join('\n\n')}\n\nاضغط رقم للحجز مع طبيب محدد\nأو اضغط *0* للمتابعة بدون تحديد`
    : `👨‍⚕️ Our Dental Team:\n\n${lines.join('\n\n')}\n\nReply with a number to book with a specific doctor\nOr press *0* to continue without preference`;
}

function doctorsMsg(ar, cl) {
  const doctors = cl.doctors || [];
  if (!doctors.length) {
    return ar
      ? 'سيتم إضافة معلومات الأطباء قريباً.\n1️⃣ حجز موعد\n2️⃣ العودة للقائمة'
      : 'Doctor information will be available soon.\n1️⃣ Book appointment\n2️⃣ Back to menu';
  }
  const lines = doctors.map((doc, i) => ar
    ? `${i + 1}️⃣ د. ${doc.name_ar || doc.name}\n🎓 الدرجة: ${doc.degree_ar || doc.degree}\n⭐ التخصص: ${doc.specialization_ar || doc.specialization}\n📅 متاح: ${doc.available_ar || doc.available}`
    : `${i + 1}️⃣ Dr. ${doc.name}\n🎓 Degree: ${doc.degree}\n⭐ Specialization: ${doc.specialization}\n📅 Available: ${doc.available}`
  );
  return ar
    ? `👨‍⚕️ فريقنا الطبي:\n\n${lines.join('\n\n')}\n\nاضغط رقم للحجز مع طبيب محدد\nأو اضغط 0 للعودة للقائمة`
    : `👨‍⚕️ Our Dental Team:\n\n${lines.join('\n\n')}\n\nReply with a number to book with a specific doctor\nOr press 0 to go back to menu`;
}

function treatmentMenuMsg(ar) {
  return ar
    ? 'ما نوع العلاج الذي تحتاجه؟\n\n1️⃣ تنظيف وتلميع 🦷\n2️⃣ حشوات\n3️⃣ تقويم الأسنان 📐\n4️⃣ تبييض الأسنان ⚪\n5️⃣ خلع\n6️⃣ زراعة أسنان 🔬\n7️⃣ علاج العصب 🏥\n8️⃣ أخرى / غير متأكد\n\n0️⃣ القائمة الرئيسية'
    : 'What type of treatment do you need?\n\n1️⃣ Cleaning & Polishing 🦷\n2️⃣ Fillings\n3️⃣ Braces & Orthodontics 📐\n4️⃣ Teeth Whitening ⚪\n5️⃣ Extraction\n6️⃣ Dental Implants 🔬\n7️⃣ Root Canal 🏥\n8️⃣ Other / Not sure\n\n0️⃣ Main menu';
}

function timeSlotMsg(ar) {
  return ar
    ? 'اختر الوقت المناسب: ⏰\n\n1️⃣ 9:00 صباحاً\n2️⃣ 10:00 صباحاً\n3️⃣ 11:00 صباحاً\n4️⃣ 1:00 مساءً\n5️⃣ 2:00 مساءً\n6️⃣ 3:00 مساءً\n7️⃣ 4:00 مساءً\n8️⃣ 5:00 مساءً\n\n0️⃣ القائمة الرئيسية'
    : 'Choose your preferred time: ⏰\n\n1️⃣ 9:00 AM\n2️⃣ 10:00 AM\n3️⃣ 11:00 AM\n4️⃣ 1:00 PM\n5️⃣ 2:00 PM\n6️⃣ 3:00 PM\n7️⃣ 4:00 PM\n8️⃣ 5:00 PM\n\n0️⃣ Main menu';
}

function servicesMsg(ar) {
  return ar
    ? '🦷 خدماتنا:\n\n✨ تنظيف وتلميع الأسنان\n🔧 الحشوات والترميم\n📐 تقويم الأسنان\n⚪ تبييض الأسنان\n🔬 زراعة الأسنان\n❌ خلع الأسنان\n🏥 علاج العصب\n👶 طب أسنان الأطفال\n🦷 القشور والتيجان\n😁 ابتسامة هوليوود\n\n1️⃣ حجز موعد | 7️⃣ مشاهدة الأسعار | 0️⃣ القائمة الرئيسية'
    : '🦷 Our Services:\n\n✨ Cleaning & Polishing\n🔧 Fillings & Restorations\n📐 Braces & Orthodontics\n⚪ Teeth Whitening\n🔬 Dental Implants\n❌ Extractions\n🏥 Root Canal Treatment\n👶 Pediatric Dentistry\n🦷 Veneers & Crowns\n😁 Smile Makeover\n\n1️⃣ Book appointment | 7️⃣ See prices | 0️⃣ Main menu';
}

function pricesMsg(ar) {
  return ar
    ? '💰 أسعارنا التقريبية:\n\n✨ تنظيف: 150-250 ريال\n🔧 حشوة: 200-400 ريال\n⚪ تبييض: 800-1,500 ريال\n📐 تقويم: 3,000-8,000 ريال\n🔬 زراعة: 3,500-6,000 ريال\n🏥 علاج عصب: 800-1,500 ريال\n🦷 قشرة: 800-1,200 ريال للسن\n\n📌 الأسعار النهائية تُحدد بعد الفحص.\n\n1️⃣ حجز موعد | 0️⃣ القائمة الرئيسية'
    : '💰 Our Approximate Prices:\n\n✨ Cleaning: 150-250 SAR\n🔧 Filling: 200-400 SAR\n⚪ Whitening: 800-1,500 SAR\n📐 Braces: 3,000-8,000 SAR\n🔬 Implant: 3,500-6,000 SAR\n🏥 Root Canal: 800-1,500 SAR\n🦷 Veneer: 800-1,200 SAR per tooth\n\n📌 Final prices confirmed after examination.\n\n1️⃣ Book appointment | 0️⃣ Main menu';
}

function locationMsg(ar, cl) {
  return ar
    ? `📍 *موقع ${cl.name}*\n\n*العنوان:*\n${cl.location || 'تواصل معنا للعنوان'}\n\n🗺️ خرائط Google: ${cl.maps_link || 'https://maps.google.com'}\n\n*🕐 أوقات العمل:*\n*الأحد – الخميس:* 9:00 صباحاً – 9:00 مساءً\n*الجمعة:* 4:00 مساءً – 9:00 مساءً\n*السبت:* 9:00 صباحاً – 6:00 مساءً\n\n1️⃣ حجز موعد | 0️⃣ القائمة الرئيسية`
    : `📍 *${cl.name} Location*\n\n*Address:*\n${cl.location || 'Contact us for our address.'}\n\n🗺️ Google Maps: ${cl.maps_link || 'https://maps.google.com'}\n\n*🕐 Working Hours:*\n*Sun–Thu:* 9:00 AM – 9:00 PM\n*Fri:* 4:00 PM – 9:00 PM\n*Sat:* 9:00 AM – 6:00 PM\n\n1️⃣ Book appointment | 0️⃣ Main menu`;
}

function reviewMsg(ar, cl) {
  return ar
    ? `⭐ شكراً لاختيارك عيادتنا!\nرأيك يعني لنا الكثير 🙏\n\nيرجى تقييمنا على Google من هنا:\n${cl.review_link || 'https://g.page/r/your-review-link'}\n\nلن يأخذ منك سوى دقيقة واحدة وسيساعد المرضى الآخرين 😊`
    : `⭐ Thank you for choosing us!\nYour feedback means everything to us 🙏\n\nPlease leave us a Google review here:\n${cl.review_link || 'https://g.page/r/your-review-link'}\n\nIt only takes 1 minute and helps other patients find us 😊`;
}

function staffMsg(ar) {
  return ar
    ? '👩‍⚕️ جاري تحويلك إلى فريقنا الآن...\nالرجاء الانتظار لحظة 🙏\nسيرد عليك فريقنا قريباً.\n\nأوقات العمل: الأحد-الخميس 9ص-9م، الجمعة 4م-9م، السبت 9ص-6م'
    : '👩‍⚕️ Connecting you with our team now...\nPlease hold on for a moment 🙏\nOur staff will respond shortly during working hours.\n\nWorking hours: Sun-Thu 9AM-9PM, Fri 4PM-9PM, Sat 9AM-6PM';
}

module.exports = { handleMessage };
