const { getPatient, insertPatient, savePatient, saveAppointment, getAppointment, updateAppointment, checkDuplicateBooking } = require('./db');
const whatsapp = require('./whatsapp');
const { detectIntent, extractDate, extractTimeSlot } = require('./ai');
const { withMonitor, validateFlowState, logError } = require('./monitor');
const { DateTime } = require('luxon');

let calendarLib = null;
try {
  calendarLib = require('./calendar');
} catch (e) {
  console.log('[Bot] calendar.js not loaded:', e.message);
}

// ─────────────────────────────────────────────
// Processing lock — prevent duplicate message handling
// (Twilio retries or user double-taps)
// ─────────────────────────────────────────────
const processingLocks = new Map();

// ─────────────────────────────────────────────
// Stale flow reset — auto-clear flows abandoned >30 min ago
// ─────────────────────────────────────────────
async function clearStaleFlow(phone, patient) {
  if (!patient || !patient.current_flow) return patient; // no active flow, nothing to clear
  if (!patient.updated_at) return patient;
  const lastUpdate = new Date(patient.updated_at);
  const diffMinutes = (Date.now() - lastUpdate.getTime()) / 60000;
  if (diffMinutes > 30) {
    console.log(`[Bot] Stale flow detected for ${phone} (${Math.round(diffMinutes)}m idle) — resetting to main menu`);
    const reset = { ...patient, current_flow: null, flow_step: 0, flow_data: {} };
    await savePatient(phone, reset);
    return reset;
  }
  return patient;
}

// ─────────────────────────────────────────────
// Static strings
// ─────────────────────────────────────────────

const LANG_SELECT = '🌐 Welcome! Please choose your language / اختر لغتك:\n1️⃣ English\n2️⃣ العربية\n\n💡 Tap 1 for English, 2 for Arabic\nاضغط 1 للإنجليزية، 2 للعربية';

// ─── Smart Menu: tries interactive list, falls back to plain text ───
async function sendSmartMenu(phone, ar, cl) {
  const clinicName = typeof cl === 'string' ? cl : (cl?.name || 'Our Clinic');
  const vertical   = cl?.industry || 'dental';
  const plainText  = ar ? menuAR(cl) : menuEN(cl);
  try {
    await sendMainMenu(phone, clinicName, ar, plainText, vertical);
  } catch (e) {
    console.log('[Bot] Interactive menu failed, using plain text:', e.message);
    await sendMessage(phone, plainText);
  }
}

// Accept either a plain clinic name string or a full clinic object (for feature flags + custom messages)
function menuEN(clinicOrName) {
  const name = typeof clinicOrName === 'string' ? clinicOrName : (clinicOrName?.name || 'Our Clinic');
  const vertical = typeof clinicOrName === 'object' ? clinicOrName?.industry : 'dental';
  console.log('[Menu] Clinic name:', name, 'Vertical:', vertical);
  
  const cfg  = typeof clinicOrName === 'object' ? clinicOrName?.config : null;
  const vEmoji = vertical === 'dental' ? '🦷' : vertical === 'physio' ? '🧘' : '🩺';
  
  const welcome       = cfg?.messages?.welcome_en       || `Welcome to ${name}! ${vEmoji}✨`;
  const showReschedule = cfg?.features?.reschedule       !== false;
  const showCancel     = cfg?.features?.cancel           !== false;
  
  const assistantType = vertical === 'dental' ? 'dental assistant' : 'autonomous assistant';
  const teamLabel    = vertical === 'dental' ? 'Meet Our Doctors 👨‍⚕️' : 'Our Team 👨‍⚕️';
  
  let menu = `${welcome}\nI'm *Jake*, your AI ${assistantType}, available 24/7.\nHow can I help you today?\n\n1️⃣ Book appointment\n2️⃣ My appointment\n`;
  if (showReschedule) menu += `3️⃣ Reschedule\n`;
  if (showCancel)     menu += `4️⃣ Cancel appointment\n`;
  menu += `5️⃣ Our services\n6️⃣ ${teamLabel}\n7️⃣ Prices 💰\n8️⃣ Location 📍\n9️⃣ Leave a review ⭐\n🔟 Talk to staff 👩‍⚕️ (type 10)\n\n💡 Tap a number or tell me what you need 😊`;
  return menu;
}

function menuAR(clinicOrName) {
  const name = typeof clinicOrName === 'string' ? clinicOrName : (clinicOrName?.name || 'عيادتنا');
  const vertical = typeof clinicOrName === 'object' ? clinicOrName?.industry : 'dental';
  console.log('[Menu] Clinic name:', name, 'Vertical:', vertical);
  
  const cfg  = typeof clinicOrName === 'object' ? clinicOrName?.config : null;
  const vEmoji = vertical === 'dental' ? '🦷' : vertical === 'physio' ? '🧘' : '🩺';
  
  const welcome       = cfg?.messages?.welcome_ar       || `أهلاً وسهلاً بك في ${name}! ${vEmoji}✨`;
  const showReschedule = cfg?.features?.reschedule       !== false;
  const showCancel     = cfg?.features?.cancel           !== false;
  
  const assistantType = vertical === 'dental' ? 'لطب الأسنان' : 'الذكي';
  const teamLabel    = vertical === 'dental' ? 'تعرف على أطبائنا 👨‍⚕️' : 'تعرف على فريقنا 👨‍⚕️';
  
  let menu = `${welcome}\nأنا *جيك*، مساعدك ${assistantType}، متاح على مدار الساعة.\nكيف يمكنني مساعدتك اليوم؟\n\n1️⃣ حجز موعد\n2️⃣ موعدي الحالي\n`;
  if (showReschedule) menu += `3️⃣ إعادة جدولة\n`;
  if (showCancel)     menu += `4️⃣ إلغاء الموعد\n`;
  menu += `5️⃣ خدماتنا\n6️⃣ ${teamLabel}\n7️⃣ الأسعار 💰\n8️⃣ الموقع 📍\n9️⃣ تقييم العيادة ⭐\n🔟 التحدث مع الفريق 👩‍⚕️ (اكتب 10)\n\n💡 اضغط رقماً أو أخبرني بما تحتاج 😊`;
  return menu;
}


// ─────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────
async function handleMessage(phone, text, clinic) {
  const onboarding = require('./growth/onboarding-state-machine.js');
  // ── Processing lock — skip duplicate/retry messages ──
  if (processingLocks.get(phone)) {
    console.log(`[Bot] ⏳ Skipping duplicate message from ${phone} (lock active)`);
    return;
  }
  processingLocks.set(phone, true);

  try {
    const msg = text.trim();

    if (msg === '[Media/Unsupported]') {
      const patient = await getPatient(phone);
      const ar = patient?.language === 'ar';
      return sendMessage(phone, ar 
        ? 'عذراً، لا يمكنني معالجة الصور أو الملفات. يرجى إرسال رسالة نصية أو صوتية.' 
        : 'Sorry, I cannot process images or files. Please send a text or voice message.'
      );
    }
    
    // 1. Check for onboarding intent FIRST
    const activation = await onboarding.handleActivation(phone, msg, clinic || {});
    if (activation.handled) {
      return; // Stop here. Onboarding state machine took over.
    }
    
    // ... rest of logic

  const cl = clinic || {
    name: 'Our Clinic',
    vertical: 'dental',
    services: [],
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

  // ── Stale flow reset — clear abandoned flows older than 30 min ──
  patient = await clearStaleFlow(phone, patient);

  // ── Branch 2: No language chosen yet (or corrupt language value) ──
  if (!patient.language || !['ar', 'en'].includes(patient.language)) {
    if (patient.language && !['ar', 'en'].includes(patient.language)) {
      console.log(`[Bot] Corrupt language value "${patient.language}" for ${phone} — re-prompting`);
      await savePatient(phone, { ...patient, language: null, current_flow: null, flow_step: 0, flow_data: {} });
    }
    if (msg === '1' || /^english$/i.test(msg)) {
      await savePatient(phone, { ...patient, language: 'en', current_flow: null, flow_step: 0, flow_data: {} });
      return sendSmartMenu(phone, false, cl);
    }
    if (msg === '2' || /^(arabic|عربي|العربية)$/i.test(msg)) {
      await savePatient(phone, { ...patient, language: 'ar', current_flow: null, flow_step: 0, flow_data: {} });
      return sendSmartMenu(phone, true, cl);
    }
    return sendMessage(phone, LANG_SELECT);
  }

  // ── Branch 3: Full patient with valid language
  const lang = patient.language;
  const ar = lang === 'ar';
  const flow = patient.current_flow;
  const step = patient.flow_step || 0;
  const fd = patient.flow_data || {};

  // ── Universal commands — always work regardless of flow ──

  // Language selection reset
  if (/^(language|change language|اللغة|تغيير اللغة|change lang)$/i.test(msg.trim())) {
    await savePatient(phone, { ...patient, language: null, current_flow: null, flow_step: 0, flow_data: {} });
    return sendMessage(phone, LANG_SELECT);
  }

  // Language switch mid-conversation
  if (/^(english|switch to english|change to english)$/i.test(msg.trim())) {
    await savePatient(phone, { ...patient, language: 'en', current_flow: null, flow_step: 0, flow_data: {} });
    return sendSmartMenu(phone, false, cl);
  }
  if (/^(arabic|عربي|عربية|switch to arabic)$/i.test(msg.trim())) {
    await savePatient(phone, { ...patient, language: 'ar', current_flow: null, flow_step: 0, flow_data: {} });
    return sendSmartMenu(phone, true, cl);
  }

  // ── Determine which steps expect free-text input (don't run AI on these) ──
  // These steps expect names, notes, dates — AI will misclassify them as intents
  const FREE_TEXT_STEPS = {
    booking:    [1, 4, 6, 21],  // name, notes, date, custom phone
    reschedule: [1],             // new date
  };
  const isActiveFlow    = !!flow;
  const isFreeTextStep  = isActiveFlow && (FREE_TEXT_STEPS[flow] || []).includes(step);
  const isNumber        = /^\d+$/.test(msg.trim());

  // ── AI Intent Detection — skip for free-text flow steps ──
  let intent = 'continue_flow';
  let extracted_value = null;
  let confidence = 'high';

  if (!isFreeTextStep) {
    const ai = await detectIntent(msg, flow, step);
    intent          = ai.intent;
    extracted_value = ai.extracted_value;
    confidence      = ai.confidence || 'low';
  }

  // ── Greeting — show menu (but NOT if in a free-text step; patient name "hi" etc.) ──
  if (!isActiveFlow && intent === 'greeting') {
    await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
    return sendSmartMenu(phone, ar, cl);
  }

  // ── Active flow: "0" or "menu" — universal exit to main menu ──
  if (isActiveFlow && /^(0|menu|main menu|القائمة|قائمة رئيسية)$/i.test(msg.trim())) {
    await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
    return sendSmartMenu(phone, ar, cl);
  }

  // ── Slot numbers above 9: bypass AI extraction, pass raw number directly ──
  if (flow === 'booking' && step === 7) {
    const num = parseInt(msg.trim());
    if (!isNaN(num) && num >= 1 && num <= 20) {
      return handleBookingFlow(phone, msg, msg, lang, ar, step, fd, patient, cl);
    }
  }

  // ── Active flow routing with smart interrupt detection ──

  if (flow === 'my_appointment') {
    const r = msg.trim();
    if (r === '1') {
      if (cl.config?.features?.reschedule === false) {
        await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
        return sendMessage(phone, ar ? 'خاصية إعادة الجدولة غير متاحة حالياً. يرجى التواصل مع الفريق.' : 'Rescheduling is not available right now. Please contact our staff.');
      }
      const myAppt = await getAppointment(phone);
      if (!myAppt) {
        await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
        return sendMessage(phone, ar ? menuAR(cl) : menuEN(cl));
      }
      await savePatient(phone, { ...patient, current_flow: 'reschedule', flow_step: 1, flow_data: { appointment_id: myAppt.id, name: myAppt.name, calendar_event_id: myAppt.calendar_event_id || null } });
      return sendMessage(phone, ar
        ? `موعدك الحالي:\n📅 ${myAppt.preferred_date} الساعة ⏰ ${myAppt.time_slot}\n\nما هو التاريخ الجديد المفضل لديك؟\n\n💡 اكتب تاريخاً مثل: غداً، 20 أبريل، الاثنين الجاي\n0️⃣ القائمة الرئيسية`
        : `Your current appointment:\n📅 ${myAppt.preferred_date} at ⏰ ${myAppt.time_slot}\n\nWhat's your new preferred date?\n\n💡 Type a date like: tomorrow, April 20, next Monday\n0️⃣ Main menu`
      );
    }
    if (r === '2') {
      if (cl.config?.features?.cancel === false) {
        await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
        return sendMessage(phone, ar ? 'خاصية الإلغاء غير متاحة حالياً. يرجى التواصل مع الفريق.' : 'Cancellations are not available right now. Please contact our staff.');
      }
      const myAppt = await getAppointment(phone);
      if (!myAppt) {
        await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
        return sendMessage(phone, ar ? menuAR(cl) : menuEN(cl));
      }
      await savePatient(phone, { ...patient, current_flow: 'cancel', flow_step: 1, flow_data: { appointment_id: myAppt.id, name: myAppt.name, appt_date: myAppt.preferred_date, appt_slot: myAppt.time_slot, calendar_event_id: myAppt.calendar_event_id || null } });
      return sendMessage(phone, ar
        ? `هل أنت متأكد من إلغاء موعدك في ${myAppt.preferred_date} الساعة ${myAppt.time_slot}؟\n1️⃣ نعم، ألغِ الموعد\n2️⃣ لا، احتفظ بالموعد\n\n💡 اضغط 1 للإلغاء أو 2 للاحتفاظ بالموعد`
        : `Are you sure you want to cancel your appointment on ${myAppt.preferred_date} at ${myAppt.time_slot}?\n1️⃣ Yes, cancel it\n2️⃣ No, keep it\n\n💡 Tap 1 to cancel or 2 to keep it`
      );
    }
    // '3', '0', or anything else → main menu
    await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
    return sendMessage(phone, ar ? menuAR(cl) : menuEN(cl));
  }

  if (flow === 'booking') {
    // For free-text steps, go straight to flow handler — no interrupt check
    if (isFreeTextStep) {
      return handleBookingFlow(phone, msg, extracted_value, lang, ar, step, fd, patient, cl);
    }
    // For non-free-text steps (treatment select, slot select, confirm), check for explicit intent switch
    if (!isNumber && intent !== 'continue_flow' && intent !== 'unknown' && intent !== 'greeting') {
      // Only interrupt for strong signals: explicit intent keywords, not AI guesses
      const EXPLICIT_SWITCH_INTENTS = ['cancel', 'reschedule', 'my_appointment', 'human', 'help'];
      if (EXPLICIT_SWITCH_INTENTS.includes(intent)) {
        await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
        return routeIntent(phone, intent, lang, ar, msg, { ...patient, current_flow: null, flow_step: 0, flow_data: {} }, cl);
      }
      // For info intents (services, prices, location, etc.), answer then prompt to continue
      const interruptReply = await getIntentReply(intent, ar, cl);
      if (interruptReply) {
        await sendMessage(phone, interruptReply);
        return sendMessage(phone, ar
          ? 'بالمناسبة، أنت في منتصف حجز موعد 😊\nأكمل الخطوة الحالية للمتابعة، أو اضغط 0 للقائمة الرئيسية'
          : 'By the way, you\'re in the middle of booking 😊\nContinue the current step, or press 0 for main menu'
        );
      }
    }
    return handleBookingFlow(phone, msg, extracted_value, lang, ar, step, fd, patient, cl);
  }

  if (flow === 'reschedule') {
    // Free-text steps go straight to flow handler
    if (isFreeTextStep) {
      return handleRescheduleFlow(phone, msg, extracted_value, lang, ar, step, fd, patient, cl);
    }
    // Check for explicit intent switch on non-free-text steps
    if (!isNumber && intent !== 'continue_flow' && intent !== 'unknown' && intent !== 'greeting') {
      const EXPLICIT_SWITCH_INTENTS = ['cancel', 'booking', 'my_appointment', 'human', 'help'];
      if (EXPLICIT_SWITCH_INTENTS.includes(intent)) {
        await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
        return routeIntent(phone, intent, lang, ar, msg, { ...patient, current_flow: null, flow_step: 0, flow_data: {} }, cl);
      }
      const interruptReply = await getIntentReply(intent, ar, cl);
      if (interruptReply) {
        await sendMessage(phone, interruptReply);
        return sendMessage(phone, ar
          ? 'أنت في منتصف إعادة جدولة موعدك 😊\nأكمل الخطوة الحالية، أو اضغط 0 للقائمة الرئيسية'
          : 'You\'re in the middle of rescheduling 😊\nContinue the current step, or press 0 for main menu'
        );
      }
    }
    return handleRescheduleFlow(phone, msg, extracted_value, lang, ar, step, fd, patient, cl);
  }

  if (flow === 'cancel') {
    // Cancel flow only has numeric confirm steps — always check intents
    if (!isNumber && intent !== 'continue_flow' && intent !== 'unknown' && intent !== 'greeting') {
      const EXPLICIT_SWITCH_INTENTS = ['booking', 'reschedule', 'my_appointment', 'human', 'help'];
      if (EXPLICIT_SWITCH_INTENTS.includes(intent)) {
        await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
        return routeIntent(phone, intent, lang, ar, msg, { ...patient, current_flow: null, flow_step: 0, flow_data: {} }, cl);
      }
      const interruptReply = await getIntentReply(intent, ar, cl);
      if (interruptReply) {
        await sendMessage(phone, interruptReply);
        return sendMessage(phone, ar
          ? 'أنت في منتصف إلغاء موعدك 😊\nأكمل الخطوة الحالية، أو اضغط 0 للقائمة الرئيسية'
          : 'You\'re in the middle of cancelling 😊\nContinue the current step, or press 0 for main menu'
        );
      }
    }
    return handleCancelFlow(phone, msg, lang, ar, step, fd, patient, cl);
  }

    return routeIntent(phone, intent, lang, ar, msg, patient, cl);
  } finally {
    // Release lock after processing or on error
    processingLocks.delete(phone);
  }
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
    case 'help':           return ar ? helpMsgAR(cl) : helpMsgEN(cl);
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

// EXIT_RE — only menu/back commands. Intent words like 'cancel' are handled by AI routing above.
const EXIT_RE = /^(0|menu|main menu|back|go back|start over|قائمة|قائمة رئيسية|رجوع|ارجع|من البداية)$/i;

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
  const cleaned = t.replace(/^(ok|okay|how about|what about|maybe|perhaps|let's try|try)\s+/i, '').trim();
  
  // Pin to Saudi Arabia (Asia/Riyadh) for all relative calculations
  const now = DateTime.now().setZone('Asia/Riyadh');
  const fmt = (d) => d.toFormat('cccc, LLLL d, yyyy'); // matches "Tuesday, April 20, 2026"

  if (/^(tomorrow|tmrw|غداً|بكرة|غدا)$/i.test(cleaned))
    return fmt(new Date(now.getTime() + 86400000));

  if (/^(today|اليوم)$/i.test(cleaned))
    return fmt(now);

  const afterDaysMatch = cleaned.match(/(?:after|in|بعد|في)\s+(\d+)\s+(?:days?|أيام?|يوم)/i);
  if (afterDaysMatch)
    return fmt(new Date(now.getTime() + parseInt(afterDaysMatch[1]) * 86400000));

  // "ok monday" / "next monday" / bare weekday name
  const nextWeekdayMatch = cleaned.match(/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
  if (nextWeekdayMatch) return getNextWeekday(nextWeekdayMatch[1]);
  if (/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.test(cleaned))
    return getNextWeekday(cleaned);

  if (/next week|الأسبوع الجاي|بعد أسبوع/i.test(cleaned))
    return fmt(new Date(now.getTime() + 7 * 86400000));

  const weeksMatch = cleaned.match(/in\s+(\d+)\s+weeks?/i);
  if (weeksMatch)
    return fmt(new Date(now.getTime() + parseInt(weeksMatch[1]) * 7 * 86400000));

  // ── Direct month-day parser ("April 21", "april 4", "21 April", "may 15") ──
  const MONTHS = { january:0, february:1, march:2, april:3, may:4, june:5, july:6, august:7, september:8, october:9, november:10, december:11 };
  const MONTHS_AR = { 'يناير':0, 'فبراير':1, 'مارس':2, 'أبريل':3, 'مايو':4, 'يونيو':5, 'يوليو':6, 'أغسطس':7, 'سبتمبر':8, 'أكتوبر':9, 'نوفمبر':10, 'ديسمبر':11 };
  // English: "April 21" or "21 April"
  const mdMatch = cleaned.match(/^(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})$/i)
               || cleaned.match(/^(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)$/i);
  if (mdMatch) {
    let monthName, day;
    if (isNaN(parseInt(mdMatch[1]))) { monthName = mdMatch[1].toLowerCase(); day = parseInt(mdMatch[2]); }
    else { monthName = mdMatch[2].toLowerCase(); day = parseInt(mdMatch[1]); }
    const month = MONTHS[monthName];
    if (month !== undefined && day >= 1 && day <= 31) {
      const year = now.getFullYear();
      let d = new Date(year, month, day);
      d.setHours(0, 0, 0, 0);
      const todayMidnight = new Date(now); todayMidnight.setHours(0, 0, 0, 0);
      if (d < todayMidnight) d = new Date(year + 1, month, day);
      return fmt(d);
    }
  }
  // Arabic: "أبريل 21" or "21 أبريل"
  const arMonthNames = Object.keys(MONTHS_AR).join('|');
  const mdMatchAR = cleaned.match(new RegExp(`^(${arMonthNames})\\s+(\\d{1,2})$`))
                 || cleaned.match(new RegExp(`^(\\d{1,2})\\s+(${arMonthNames})$`));
  if (mdMatchAR) {
    let monthName, day;
    if (isNaN(parseInt(mdMatchAR[1]))) { monthName = mdMatchAR[1]; day = parseInt(mdMatchAR[2]); }
    else { monthName = mdMatchAR[2]; day = parseInt(mdMatchAR[1]); }
    const month = MONTHS_AR[monthName];
    if (month !== undefined && day >= 1 && day <= 31) {
      const year = now.getFullYear();
      let d = new Date(year, month, day);
      d.setHours(0, 0, 0, 0);
      const todayMidnight = new Date(now); todayMidnight.setHours(0, 0, 0, 0);
      if (d < todayMidnight) d = new Date(year + 1, month, day);
      return fmt(d);
    }
  }

  return null;
}

// Phase 1 — Robust ISO date from any parsed date string.
// Always returns YYYY-MM-DD with year >= current year, or null.
function getDateISO(parsedDate) {
  if (!parsedDate) return null;
  try {
    const currentYear = new Date().getFullYear();
    // Try direct parse — works when year is already present (e.g. "Wednesday, April 3, 2026")
    const d = new Date(parsedDate);
    if (!isNaN(d.getTime()) && d.getFullYear() >= currentYear) {
      return d.toISOString().split('T')[0];
    }
    // Year missing or wrong — append current year and try again
    const d2 = new Date(parsedDate + ` ${currentYear}`);
    if (!isNaN(d2.getTime())) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (d2 >= today) return d2.toISOString().split('T')[0];
      // Date with current year is already past → use next year
      const d3 = new Date(parsedDate + ` ${currentYear + 1}`);
      if (!isNaN(d3.getTime())) return d3.toISOString().split('T')[0];
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Slot number formatting — plain text for all slots
function formatSlotNumber(i) {
  return `${i + 1}.`;
}

// FIX 3 — Get next N days the doctor works, starting from tomorrow
function getNextAvailableDays(workingDays, count) {
  const days     = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const daysAR   = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  const monthsEN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const monthsAR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  const result = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const checkDate = new Date(today);
  checkDate.setDate(checkDate.getDate() + 1); // start from tomorrow
  let guard = 0;
  while (result.length < count && guard++ < 60) {
    const dayName = days[checkDate.getDay()];
    if (workingDays.includes(dayName)) {
      result.push({
        iso:       checkDate.toISOString().split('T')[0],
        displayEN: `${dayName}, ${monthsEN[checkDate.getMonth()]} ${checkDate.getDate()}`,
        displayAR: `${daysAR[checkDate.getDay()]}، ${checkDate.getDate()} ${monthsAR[checkDate.getMonth()]}`
      });
    }
    checkDate.setDate(checkDate.getDate() + 1);
  }
  return result;
}

// ─────────────────────────────────────────────
// Doctor helpers
// ─────────────────────────────────────────────

// Format "HH:MM" → "9AM" / "9:30AM"
function formatTimeFromHHMM(timeStr) {
  if (!timeStr) return '';
  const parts = timeStr.split(':').map(Number);
  const h = parts[0], m = parts[1] || 0;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return m > 0 ? `${displayH}:${String(m).padStart(2, '0')}${ampm}` : `${displayH}${ampm}`;
}

// Returns doctor list in the format doctorSelectionMsg() expects.
// Priority: clinic.doctors JSONB → doctor_schedules table fallback.
async function getClinicDoctors(cl) {
  // 1. Prefer JSONB array on the clinic record (legacy path)
  if (Array.isArray(cl.doctors) && cl.doctors.length > 0) {
    console.log(`[Doctors] Using cl.doctors JSONB (${cl.doctors.length} doctors)`);
    return cl.doctors;
  }
  // 2. Fallback: query doctor_schedules directly
  if (!cl.id) {
    console.log('[Doctors] No clinic id — cannot fetch from doctor_schedules');
    return [];
  }
  try {
    const { getDoctorsByClinic } = require('./db');
    const schedules = await getDoctorsByClinic(cl.id);
    console.log(`[Doctors] doctor_schedules fallback: ${schedules.length} doctors for clinic ${cl.id}`);
    const DAYS_SHORT = { Sunday:'Sun', Monday:'Mon', Tuesday:'Tue', Wednesday:'Wed', Thursday:'Thu', Friday:'Fri', Saturday:'Sat' };
    const DAYS_AR_MAP = { Sunday:'الأحد', Monday:'الاثنين', Tuesday:'الثلاثاء', Wednesday:'الأربعاء', Thursday:'الخميس', Friday:'الجمعة', Saturday:'السبت' };
    return schedules.map(s => {
      const days = Array.isArray(s.working_days) ? s.working_days : [];
      const daysShort = days.map(d => DAYS_SHORT[d] || d).join('–');
      const daysArStr = days.map(d => DAYS_AR_MAP[d] || d).join('، ');
      const startFmt  = formatTimeFromHHMM(s.start_time);
      const endFmt    = formatTimeFromHHMM(s.end_time);
      return {
        id:               s.doctor_id,
        name:             s.doctor_name,
        name_ar:          s.doctor_name,
        degree:           '',
        degree_ar:        '',
        specialization:   daysShort ? `${daysShort}, ${startFmt}–${endFmt}` : 'General Dentistry',
        specialization_ar: daysArStr ? `${daysArStr}، ${startFmt}–${endFmt}` : 'طب أسنان عام',
        available:        `${startFmt}–${endFmt}`,
        available_ar:     `${startFmt}–${endFmt}`
      };
    });
  } catch (e) {
    console.error('[Doctors] getClinicDoctors error:', e.message);
    return [];
  }
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
      ? 'رائع! لنبدأ الحجز 😊\nما اسمك الكريم؟\n\n💡 اكتب اسمك وأرسل\n0️⃣ القائمة الرئيسية'
      : "Great! Let's book your appointment 😊\nWhat's your full name?\n\n💡 Type your name and send\n0️⃣ Main menu"
    );
  }

  // Step 4 — Notes (optional): handle BEFORE EXIT_RE so "0" skips instead of exiting
  if (step === 4) {
    const isSkip = rawMsg.trim() === '0' || /^(skip|no|nothing|لا|تخطي)$/i.test(rawMsg.trim());
    fd.description = isSkip ? '' : rawMsg.trim();
    await savePatient(phone, { ...patient, flow_step: 5, flow_data: fd });
    // Step 5 — doctor selection: query live from doctor_schedules if cl.doctors JSONB is empty
    const doctors4 = await getClinicDoctors(cl);
    if (doctors4.length > 0) {
      return sendMessage(phone, doctorSelectionMsg(ar, doctors4, cl.industry));
    }
    // No doctors found anywhere — skip to date selection
    return sendMessage(phone, ar
      ? 'متى تفضل موعدك؟ 📅\n\n💡 اكتب تاريخاً مثل: غداً، 20 أبريل، الاثنين الجاي\n0️⃣ القائمة الرئيسية'
      : 'When would you like your appointment? 📅\n\n💡 Type a date like: tomorrow, April 20, next Monday\n0️⃣ Main menu'
    );
  }

  // Exit keywords — only during data-entry steps, not on binary confirm steps
  if (step <= 7 && EXIT_RE.test(rawMsg.trim())) {
    await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
    return sendMessage(phone, ar ? menuAR(cl) : menuEN(cl));
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
      ? `شكراً ${fd.name}! 😊\nرقم واتساب الخاص بك: *${phone}*\nهل هذا صحيح؟\n1️⃣ نعم، هذا صحيح\n2️⃣ لا، أريد رقماً آخر\n\n💡 اضغط 1 للتأكيد أو 2 للتغيير\n0️⃣ القائمة الرئيسية`
      : `Thanks ${fd.name}! 😊\nYour WhatsApp number is: *${phone}*\nIs this correct?\n1️⃣ Yes, that's correct\n2️⃣ No, use a different number\n\n💡 Tap 1 to confirm or 2 to change\n0️⃣ Main menu`
    );
  }

  // Step 2 — Confirm phone
  if (step === 2) {
    if (val === '2' || /^(no|change|لا|تغيير)$/i.test(val)) {
      await savePatient(phone, { ...patient, flow_step: 21, flow_data: fd });
      return sendMessage(phone, ar ? 'من فضلك أدخل رقم هاتفك:\n\n💡 اكتب رقم هاتفك وأرسل' : 'Please enter your phone number:\n\n💡 Type your phone number and send');
    }
    fd.phone = phone;
    await savePatient(phone, { ...patient, flow_step: 3, flow_data: fd });
    return sendMessage(phone, treatmentMenuMsg(ar, cl.industry, cl.services));
  }

  // Step 21 — Custom phone entry
  if (step === 21) {
    fd.phone = val;
    await savePatient(phone, { ...patient, flow_step: 3, flow_data: fd });
    return sendMessage(phone, treatmentMenuMsg(ar, cl.industry, cl.services));
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
      ? 'هل لديك ملاحظات أو وصف للمشكلة؟ (اختياري)\n\n💡 اكتب ملاحظتك أو أرسل *skip* للتخطي\n0️⃣ القائمة الرئيسية'
      : 'Any notes or description of your issue? (optional)\n\n💡 Type your note or send *skip* to continue\n0️⃣ Main menu'
    );
  }

  // Step 5 — Doctor selection (BEFORE date — doctor schedule determines available days)
  if (step === 5) {
    // Always fetch live — covers the case where cl.doctors JSONB is empty but doctor_schedules has data
    const doctors = await getClinicDoctors(cl);
    if (doctors.length === 0) {
      // No doctors configured anywhere — skip straight to date
      fd.doctor_id   = null;
      fd.doctor_name = null;
      await savePatient(phone, { ...patient, flow_step: 6, flow_data: fd });
      return sendMessage(phone, ar
        ? 'متى تفضل موعدك؟ 📅\n\n💡 اكتب تاريخاً مثل: غداً، 20 أبريل، الاثنين الجاي\n0️⃣ القائمة الرئيسية'
        : 'When would you like your appointment? 📅\n\n💡 Type a date like: tomorrow, April 20, next Monday\n0️⃣ Main menu'
      );
    }
    const num = parseInt(rawMsg);
    if (rawMsg.trim() === '0' || /^(skip|any|no preference|لا يهم|تخطي|أي طبيب)$/i.test(rawMsg.trim())) {
      fd.doctor_id   = null;
      fd.doctor_name = null;
    } else if (num >= 1 && num <= doctors.length) {
      const doc = doctors[num - 1];
      fd.doctor_id      = doc.id || null;
      fd.doctor_name    = doc.name;                  // always English — for DB + staff
      fd.doctor_name_ar = doc.name_ar || doc.name;  // for patient-facing Arabic
    } else {
      // Free-text or unrecognised — re-show live doctor menu
      return sendMessage(phone, doctorSelectionMsg(ar, doctors));
    }
    // If doctor selected, fetch working days and suggest next available dates
    if (fd.doctor_id && cl.id) {
      try {
        const { getDoctorSchedule } = require('./slots');
        const schedule = await getDoctorSchedule(cl.id, fd.doctor_id);
        if (schedule && Array.isArray(schedule.working_days) && schedule.working_days.length > 0) {
          const suggestions = getNextAvailableDays(schedule.working_days, 4);
          if (suggestions.length > 0) {
            fd.suggested_dates = suggestions;
            await savePatient(phone, { ...patient, flow_step: 6, flow_data: fd });
            const docLabel  = ar ? `د. ${fd.doctor_name_ar || fd.doctor_name}` : `Dr. ${fd.doctor_name}`;
            const dateLines = suggestions.map((d, i) => `${formatSlotNumber(i)} ${ar ? d.displayAR : d.displayEN}`).join('\n');
            return sendMessage(phone, ar
              ? `متى تفضل موعدك؟ 📅\n\n${docLabel} متاح في:\n${dateLines}\n\n💡 اضغط رقماً أو اكتب أي تاريخ آخر\n0️⃣ القائمة الرئيسية`
              : `When would you like your appointment? 📅\n\n${docLabel} is available on:\n${dateLines}\n\n💡 Tap a number or type any other date\n0️⃣ Main menu`
            );
          }
        }
      } catch (e) {
        console.error('[Step5] getDoctorSchedule error:', e.message);
      }
    }

    await savePatient(phone, { ...patient, flow_step: 6, flow_data: fd });
    return sendMessage(phone, ar
      ? 'متى تفضل موعدك؟ 📅\n\n💡 اكتب تاريخاً مثل: غداً، 20 أبريل، الاثنين الجاي\n0️⃣ القائمة الرئيسية'
      : 'When would you like your appointment? 📅\n\n💡 Type a date like: tomorrow, April 20, next Monday\n0️⃣ Main menu'
    );
  }

  // Step 6 — Date (with doctor schedule validation)
  if (step === 6) {
    const dateInput = rawMsg.trim();

    // Handle suggested date number selection (1-N from step 5 doctor suggestions)
    let parsedDate = null;
    let isSuggested = false;
    const suggestedDates = Array.isArray(fd.suggested_dates) ? fd.suggested_dates : null;
    if (suggestedDates && suggestedDates.length > 0) {
      const n = parseInt(dateInput);
      if (!isNaN(n) && n >= 1 && n <= suggestedDates.length) {
        parsedDate = suggestedDates[n - 1].iso;
        isSuggested = true;
      }
    }

    if (!parsedDate) {
      // Reject empty or single-char
      if (dateInput.length < 2) {
        return sendMessage(phone, ar
          ? 'يرجى إدخال تاريخ مثل: غداً، الاثنين، أو 20 أبريل 😊\n\n0️⃣ القائمة الرئيسية'
          : 'Please enter a date like: tomorrow, Monday, or April 20 😊\n\n0️⃣ Main menu'
        );
      }

      // 1) Fast local relative date calculation
      parsedDate = calculateRelativeDate(dateInput);
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
          return sendMessage(phone, ar
            ? 'يرجى إدخال تاريخ الموعد 😊 مثال: غداً، 20 أبريل، الاثنين الجاي\n\n0️⃣ القائمة الرئيسية'
            : 'Please enter a date for your appointment 😊 Example: tomorrow, April 20, next Monday\n\n0️⃣ Main menu'
          );
        }
        if (!parsedDate) parsedDate = dateInput;
      }
    }

    console.log(`[Step6] date input="${dateInput}" parsed="${parsedDate}"`);

    // Phase 1 — derive ISO (getDateISO guarantees year >= 2026)
    const isoDate = getDateISO(parsedDate);

    // Doctor schedule validation — skip if patient picked from pre-validated suggestions
    if (!isSuggested && fd.doctor_id && cl.id && isoDate) {
      try {
        const { getDoctorSchedule, getDayName } = require('./slots');
        const schedule = await getDoctorSchedule(cl.id, fd.doctor_id);
        if (schedule && schedule.working_days) {
          const dayName = getDayName(isoDate);
          if (!schedule.working_days.includes(dayName)) {
            const DAYS_AR = { Sunday:'الأحد', Monday:'الاثنين', Tuesday:'الثلاثاء', Wednesday:'الأربعاء', Thursday:'الخميس', Friday:'الجمعة', Saturday:'السبت' };
            const workDays = ar
              ? (Array.isArray(schedule.working_days) ? schedule.working_days.map(d => DAYS_AR[d] || d).join('، ') : schedule.working_days)
              : (Array.isArray(schedule.working_days) ? schedule.working_days.join(', ') : schedule.working_days);
            const docDisplayName = ar ? (fd.doctor_name_ar || fd.doctor_name) : fd.doctor_name;
            return sendMessage(phone, ar
              ? `د. ${docDisplayName} غير متاح في هذا اليوم. يعمل في: ${workDays}. يرجى اختيار تاريخ آخر:\n\n0️⃣ القائمة الرئيسية`
              : `Dr. ${fd.doctor_name} is not available on ${dayName}. They work on: ${workDays}. Please choose another date:\n\n0️⃣ Main menu`
            );
          }
        }
      } catch (e) {
        console.error('[Step6] schedule check error:', e.message);
      }
    }

    fd.preferred_date_iso = isoDate;
    fd.preferred_date     = isoDate
      ? new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : normalizeDate(parsedDate);
    fd.preferred_date_raw = dateInput;

    // FIX 1 — Fetch slots and show directly (no intermediate "Checking" message)
    let slotsForDisplay = [];
    if (fd.doctor_id && isoDate && cl.id) {
      const { getAvailableSlots } = require('./slots');
      try {
        slotsForDisplay = await getAvailableSlots(cl.id, fd.doctor_id, isoDate);
      } catch (e) {
        console.error('[Step6] getAvailableSlots error:', e.message);
      }
      if (slotsForDisplay.length === 0) {
        const docDisplayName6 = ar ? (fd.doctor_name_ar || fd.doctor_name) : fd.doctor_name;
        return sendMessage(phone, ar
          ? `لا توجد مواعيد متاحة في ${fd.preferred_date} مع د. ${docDisplayName6}. يرجى اختيار تاريخ آخر:\n\n0️⃣ القائمة الرئيسية`
          : `No slots available on ${fd.preferred_date} for Dr. ${fd.doctor_name}. Please choose another date:\n\n0️⃣ Main menu`
        );
      }
    }

    // Build slot list
    let slotKeys, slotDisplays, slotLines;
    if (slotsForDisplay.length > 0) {
      slotKeys     = slotsForDisplay.map(s => s.slot_time);
      slotDisplays = slotsForDisplay.map(s => ar ? s.slot_time_display_ar : s.slot_time_display);
      slotLines    = slotDisplays.map((d, i) => `${formatSlotNumber(i)} ${d}`);
    } else {
      slotKeys     = EN_SLOTS.map((_, i) => String(i + 1));
      slotDisplays = ar ? AR_SLOTS : EN_SLOTS;
      slotLines    = slotDisplays.map((s, i) => `${formatSlotNumber(i)} ${s}`);
    }

    const docDisplayName6 = ar ? (fd.doctor_name_ar || fd.doctor_name) : fd.doctor_name;
    const doctorLabel6 = docDisplayName6
      ? (ar ? `مع د. ${docDisplayName6}` : `with Dr. ${fd.doctor_name}`)
      : '';
    fd.available_slots_shown = true;
    fd.slot_keys             = slotKeys;
    fd.slot_displays         = slotDisplays;
    await savePatient(phone, { ...patient, flow_step: 7, flow_data: fd });

    const header6      = ar
      ? `المواعيد المتاحة ${doctorLabel6} في ${fd.preferred_date}:`
      : `Available times ${doctorLabel6} on ${fd.preferred_date}:`;
    const instruction6 = ar ? '\n\n💡 اضغط رقماً لاختيار موعدك' : '\n\n💡 Tap a number to select your time';
    return sendMessage(phone, `${header6}\n\n${slotLines.join('\n')}${instruction6}\n\n0️⃣ ${ar ? 'القائمة الرئيسية' : 'Main menu'}`);
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
        const docName7a = ar ? (fd.doctor_name_ar || fd.doctor_name) : fd.doctor_name;
        return sendMessage(phone, ar
          ? `لا توجد مواعيد متاحة في ${fd.preferred_date} مع د. ${docName7a}. يرجى اختيار تاريخ آخر:\n\n0️⃣ القائمة الرئيسية`
          : `No slots available on ${fd.preferred_date} for Dr. ${fd.doctor_name}. Please choose another date:\n\n0️⃣ Main menu`
        );
      }

      // Build numbered slot list
      let slotLines, slotKeys, slotDisplays;
      if (slots.length > 0) {
        slotKeys     = slots.map(s => s.slot_time);
        slotDisplays = slots.map(s => ar ? s.slot_time_display_ar : s.slot_time_display);
        slotLines    = slotDisplays.map((d, i) => `${formatSlotNumber(i)} ${d}`);
      } else {
        // No doctor selected — use generic fixed slots
        slotKeys     = EN_SLOTS.map((_, i) => String(i + 1));
        slotDisplays = ar ? AR_SLOTS : EN_SLOTS;
        slotLines    = slotDisplays.map((s, i) => `${formatSlotNumber(i)} ${s}`);
      }

      const docName7 = ar ? (fd.doctor_name_ar || fd.doctor_name) : fd.doctor_name;
      const doctorLabel = docName7
        ? (ar ? `مع د. ${docName7}` : `with Dr. ${fd.doctor_name}`)
        : '';
      fd.available_slots_shown = true;
      fd.slot_keys             = slotKeys;
      fd.slot_displays         = slotDisplays; // BUG 1 — store formatted labels for fallback
      await savePatient(phone, { ...patient, flow_step: 7, flow_data: fd });

      const header7 = ar
        ? `المواعيد المتاحة ${doctorLabel} في ${fd.preferred_date}:`
        : `Available times ${doctorLabel} on ${fd.preferred_date}:`;
      const instruction7 = ar ? '\n\n💡 اضغط رقماً لاختيار موعدك' : '\n\n💡 Tap a number to select your time';
      return sendMessage(phone, `${header7}\n\n${slotLines.join('\n')}${instruction7}\n\n0️⃣ ${ar ? 'القائمة الرئيسية' : 'Main menu'}`);
    }

    // 7b — Patient is selecting a slot

    // BUG 1 — Handle duplicate-booking response (patient chose 1=reschedule or 2=different date)
    if (fd.waiting_duplicate_response) {
      const r = rawMsg.trim();
      if (r === '1' || /^(yes|نعم|تمام|ايوه|موافق|أعد الجدولة)$/i.test(r)) {
        if (cl.config?.features?.reschedule === false) {
          await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
          return sendMessage(phone, ar
            ? 'خاصية إعادة الجدولة غير متاحة حالياً. يرجى التواصل مع الفريق.'
            : 'Rescheduling is not available right now. Please contact our staff.'
          );
        }
        const existingAppt = await getAppointment(phone);
        if (!existingAppt) {
          await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
          return sendMessage(phone, ar ? menuAR(cl) : menuEN(cl));
        }
        await savePatient(phone, { ...patient, current_flow: 'reschedule', flow_step: 1, flow_data: { appointment_id: existingAppt.id, name: existingAppt.name, calendar_event_id: existingAppt.calendar_event_id || null } });
        return sendMessage(phone, ar
          ? `موعدك الحالي:\n📅 ${existingAppt.preferred_date} الساعة ⏰ ${existingAppt.time_slot}\n\nما هو التاريخ الجديد المفضل لديك؟`
          : `Your current appointment:\n📅 ${existingAppt.preferred_date} at ⏰ ${existingAppt.time_slot}\n\nWhat's your new preferred date?`
        );
      }
      if (r === '2' || /^(no|لا|لأ)$/i.test(r)) {
        await savePatient(phone, { ...patient, flow_step: 6, flow_data: { ...fd, waiting_duplicate_response: false, available_slots_shown: false, slot_keys: null, slot_displays: null, preferred_date: null, preferred_date_iso: null } });
        return sendMessage(phone, ar
          ? 'يرجى اختيار تاريخ آخر 📅\nيمكنك قول:\n• غداً\n• الاثنين الجاي\n• 20 أبريل\n\n0️⃣ القائمة الرئيسية'
          : 'Please choose a different date 📅\nYou can say:\n• Tomorrow\n• Next Monday\n• April 20\n\n0️⃣ Main menu'
        );
      }
      // Unrecognised — re-show the duplicate prompt
      return sendMessage(phone, ar
        ? 'لديك موعد محجوز في هذا اليوم 😊\nهل تريد إعادة جدولة موعدك الحالي؟\n1. نعم، أعد الجدولة\n2. لا، اختر تاريخاً آخر\n\n💡 اضغط 1 أو 2 للمتابعة\n0️⃣ القائمة الرئيسية'
        : 'You already have a booking on this date 😊\nWould you like to reschedule your existing appointment instead?\n1. Yes, reschedule\n2. No, choose a different date\n\n💡 Tap 1 or 2 to continue\n0️⃣ Main menu'
      );
    }

    const slotKeys = fd.slot_keys || [];
    const num7 = parseInt(rawMsg.trim());

    if (num7 >= 1 && num7 <= slotKeys.length) {
      // Doctor-managed slots: store the slot_time key
      if (fd.doctor_id && fd.preferred_date_iso) {
        fd.slot_time_key = slotKeys[num7 - 1]; // HH:MM for bookSlot
        // Build display label from doctor slots (re-fetch or use index)
        const { getAvailableSlots: gas } = require('./slots');
        let displayEn = EN_SLOTS[num7 - 1] || slotKeys[num7 - 1];
        let displayAr = AR_SLOTS[num7 - 1] || toArabicTime(displayEn);
        try {
          const slots2 = await gas(cl.id, fd.doctor_id, fd.preferred_date_iso);
          if (slots2[num7 - 1]) {
            displayEn = slots2[num7 - 1].slot_time_display;
            displayAr = slots2[num7 - 1].slot_time_display_ar;
          }
        } catch (e) { /* use fallback labels */ }
        fd.time_slot    = displayEn; // always English — for DB and reminder parsing
        fd.time_slot_ar = displayAr; // Arabic — for patient-facing display
      } else {
        // Generic fixed slots
        fd.time_slot    = EN_SLOTS[num7 - 1]; // always English — for DB and reminder parsing
        fd.time_slot_ar = AR_SLOTS[num7 - 1]; // Arabic — for patient-facing display
        fd.slot_time_key = null;
      }
    } else {
      // Try natural language → extractTimeSlot
      const matched = await extractTimeSlot(rawMsg, EN_SLOTS);
      if (!matched) {
        // Re-show slot list using formatted display labels
        const displays2 = fd.slot_displays || fd.slot_keys || [];
        const slotLines2 = displays2.map((d, i) => `${formatSlotNumber(i)} ${d}`);
        const instruction2 = ar ? '\n\n💡 اضغط رقماً لاختيار موعدك' : '\n\n💡 Tap a number to select your time';
        return sendMessage(phone, ar
          ? `هذا الوقت غير متاح 😊 يرجى الاختيار من المواعيد المتاحة:\n\n${slotLines2.join('\n')}${instruction2}\n\n0️⃣ القائمة الرئيسية`
          : `That time isn't available 😊 Please choose from the available slots:\n\n${slotLines2.join('\n')}${instruction2}\n\n0️⃣ Main menu`
        );
      }
      // Always store English — convert to Arabic only at display time
      const enIndex = EN_SLOTS.indexOf(matched);
      fd.time_slot    = matched; // always English
      fd.time_slot_ar = AR_SLOTS[enIndex] || toArabicTime(matched);
      // RISK 2 FIX: Resolve slot_time_key from doctor slots so atomic bookSlot() fires correctly.
      // Without this, natural-language time inputs skip the atomic lock → double-booking possible.
      fd.slot_time_key = null; // default — will be overwritten below if doctor slot found
      if (fd.doctor_id && fd.preferred_date_iso && cl.id) {
        try {
          const { getAvailableSlots: gasNL } = require('./slots');
          const nlSlots = await gasNL(cl.id, fd.doctor_id, fd.preferred_date_iso);
          // Match by display label (EN)
          const nlMatch = nlSlots.find(s => s.slot_time_display === matched);
          if (nlMatch) {
            fd.slot_time_key = nlMatch.slot_time; // e.g. "09:00"
            console.log(`[Step7] NL match resolved slot_time_key: "${fd.slot_time_key}"`);
          } else {
            console.warn(`[Step7] NL match "${matched}" not found in doctor slots — atomic lock skipped`);
          }
        } catch (e) {
          console.error('[Step7] NL slot_time_key resolve error:', e.message);
        }
      }
    }

    fd.slot_time_raw = rawMsg.trim();

    // ─── Phase 5: Booking validation rules ──────────────────────────
    if (fd.preferred_date_iso) {
      const minHours = cl.config?.booking_rules?.min_advance_hours ?? 1;
      const maxDays  = cl.config?.booking_rules?.max_advance_days  ?? 30;
      const slotHHMM = fd.slot_time_key || '09:00';
      const bookingDT = new Date(`${fd.preferred_date_iso}T${slotHHMM}:00`);
      const now = new Date();
      const hoursUntil = (bookingDT - now) / 3600000;
      const daysUntil  = (bookingDT - now) / 86400000;

      if (hoursUntil < minHours) {
        return sendMessage(phone, ar
          ? `يجب الحجز قبل ${minHours} ساعة على الأقل. يرجى اختيار وقت آخر.`
          : `Bookings must be made at least ${minHours} hour(s) in advance. Please choose another time.`
        );
      }
      if (daysUntil > maxDays) {
        await savePatient(phone, { ...patient, flow_step: 6, flow_data: { ...fd, available_slots_shown: false } });
        return sendMessage(phone, ar
          ? `لا يمكن الحجز أكثر من ${maxDays} يوماً مسبقاً. يرجى اختيار تاريخ أقرب:`
          : `Cannot book more than ${maxDays} days in advance. Please choose a closer date:`
        );
      }

      const isDuplicate = await checkDuplicateBooking(phone, fd.preferred_date_iso);
      if (isDuplicate) {
        fd.waiting_duplicate_response = true;
        await savePatient(phone, { ...patient, flow_step: 7, flow_data: fd });
        return sendMessage(phone, ar
          ? 'لديك موعد محجوز في هذا اليوم 😊\nهل تريد إعادة جدولة موعدك الحالي؟\n1. نعم، أعد الجدولة\n2. لا، اختر تاريخاً آخر\n0. القائمة الرئيسية'
          : 'You already have a booking on this date 😊\nWould you like to reschedule your existing appointment instead?\n1. Yes, reschedule\n2. No, choose a different date\n0. Main menu'
        );
      }
    }
    // ────────────────────────────────────────────────────────────────

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
      let slotLocked = false;
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
        if (result.success) slotLocked = true;
      }

      console.log('[Booking] Saving fd:', JSON.stringify(fd));
      console.log('[TRACE] Step 8 Execution: point A');

      // FIX: Validate preferred_date_iso — must be YYYY-MM-DD, never free text
      const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
      let safeIso = fd.preferred_date_iso || null;
      if (safeIso && !ISO_RE.test(safeIso)) {
        console.warn(`[Booking] preferred_date_iso corrupt: "${safeIso}" — re-deriving`);
        safeIso = getDateISO(safeIso) || getDateISO(fd.preferred_date) || null;
      }
      if (!safeIso && fd.preferred_date) {
        safeIso = getDateISO(fd.preferred_date) || null;
      }
      if (safeIso && !ISO_RE.test(safeIso)) {
        console.error(`[Booking] Still invalid ISO after re-derive: "${safeIso}" — nulling`);
        safeIso = null;
      }
      console.log(`[Booking] preferred_date_iso (safe): "${safeIso}"`);
      console.log('[TRACE] Step 8 Execution: point B - safeIso validation done');

      // RISK 3 FIX: If saveAppointment fails after slot is locked, release slot to prevent orphaned locks
      let savedAppt = null;
      try {
        savedAppt = await saveAppointment({
          phone:              fd.phone || phone,
          clinic_id:          cl.id || null,
          name:               fd.name,
          treatment:          fd.treatment,
          description:        fd.description,
          preferred_date:     fd.preferred_date,
          preferred_date_iso: safeIso,
          preferred_date_raw: fd.preferred_date_raw || null,
          time_slot:          fd.time_slot,
          slot_time_raw:      fd.slot_time_raw || null,
          doctor_id:          fd.doctor_id || null,
          doctor_name:        fd.doctor_name || null
        });
        if (!savedAppt) throw new Error('saveAppointment returned null');
        if (savedAppt.error === 'SLOT_TAKEN') throw new Error('SLOT_TAKEN');
        if (savedAppt.error) throw new Error(savedAppt.details || 'DB_ERROR');
      } catch (saveErr) {
        console.error('[Booking] saveAppointment FAILED:', saveErr.message);
        // Release the slot we just locked — otherwise it's stuck as 'booked' with no appointment
        if (slotLocked && fd.doctor_id && safeIso && cl.id) {
          try {
            const { releaseSlotByPatient } = require('./slots');
            await releaseSlotByPatient(cl.id, fd.doctor_id, safeIso, phone);
            console.log('[Booking] Slot released after appointment save failure');
          } catch (releaseErr) {
            console.error('[Booking] Slot release also failed:', releaseErr.message);
          }
        }

        if (saveErr.message === 'SLOT_TAKEN') {
          return sendMessage(phone, ar
            ? 'عذراً، تم حجز هذا الموعد للتو! يرجى اختيار وقت آخر.\n\n0️⃣ القائمة الرئيسية'
            : 'Sorry, this slot was just taken! Please choose another time.\n\n0️⃣ Main menu'
          );
        }

        return sendMessage(phone, ar
          ? 'عذراً، حدث خطأ أثناء تأكيد الحجز. يرجى المحاولة مرة أخرى.\n\n0️⃣ القائمة الرئيسية'
          : 'Sorry, there was an error confirming your booking. Please try again.\n\n0️⃣ Main menu'
        );
      }

      // Link slot to appointment if both IDs are available
      if (savedAppt && fd.doctor_id && safeIso && fd.slot_time_key && cl.id) {
        const { linkSlotToAppointment } = require('./slots');
        await linkSlotToAppointment(cl.id, fd.doctor_id, safeIso, phone, savedAppt.id);
      }

      // Phase 3 — Google Calendar event (pro clinics only)
      if (savedAppt && calendarLib && cl.plan === 'pro' && cl.google_calendar_id && cl.config?.features?.google_calendar !== false && safeIso) {
        try {
          const eventId = await calendarLib.createBookingEvent(cl.google_calendar_id, {
            name:               fd.name,
            phone:              fd.phone || phone,
            treatment:          fd.treatment,
            description:        fd.description || '',
            doctor_name:        fd.doctor_name || null,
            preferred_date_iso: safeIso,
            time_slot:          fd.time_slot
          });
          if (eventId) {
            await updateAppointment(savedAppt.id, { calendar_event_id: eventId });
            console.log('[Booking] Calendar event created:', eventId);
          }
        } catch (calErr) {
          console.error('[Booking] Calendar error (non-blocking):', calErr.message);
        }
      }

      // Phase 4: respect staff_notifications feature flag (default on)
      // NOTE: patient state reset is intentionally deferred until AFTER confirmation is sent
      console.log('[TRACE] Step 8 Execution: point C - Calendar done, starting Staff Notif');
      if (cl.staff_phone && cl.config?.features?.staff_notifications !== false) {
        const staffTime = fd.time_slot;
        const doctorLine = fd.doctor_name ? `\n👨‍⚕️ Doctor: ${fd.doctor_name}` : '';
        await sendMessage(cl.staff_phone,
          `🦷 New Booking Alert!\n━━━━━━━━━━━━━━\n👤 Patient: ${fd.name}\n📱 Phone: ${fd.phone || phone}\n🔧 Treatment: ${fd.treatment}\n📝 Notes: ${fd.description || 'None'}${doctorLine}\n📅 Date: ${fd.preferred_date}\n⏰ Time: ${staffTime}\n━━━━━━━━━━━━━━\nBooked via WhatsApp AI ✅`
        );
      }
      console.log('[TRACE] Step 8 Execution: point D - Setting up Reminder');

      // ── Post-booking test reminder (3-minute delay for testing) ──
      const reminderPhone  = phone;
      const reminderName   = fd.name;
      const reminderDate   = fd.preferred_date;
      const reminderTime   = ar ? (fd.time_slot_ar || fd.time_slot) : fd.time_slot;
      const reminderClinic = cl.name;
      const reminderAr     = ar;
      console.log(`[Reminder] ⏱️ 3-min reminder scheduled for ${reminderPhone}`);
      
      // Instantly confirm to the user that the timer has started
      await sendMessage(reminderPhone, reminderAr ? '⏳ تم تفعيل مؤقت الاختبار الخاص بك لمدة 3 دقائق الآن!' : '⏳ Your 3-minute reminder test timer has just started!');

      setTimeout(async () => {
        try {
          const msg = reminderAr
            ? `⏰ *تذكير بموعدك!* 🦷\n\nمرحباً ${reminderName}،\nتم تأكيد موعدك بنجاح:\n📅 ${reminderDate}\n⏰ ${reminderTime}\n🏥 ${reminderClinic}\n\nنتطلع لرؤيتك! 😊`
            : `⏰ *Appointment Reminder!* 🦷\n\nHi ${reminderName},\nYour appointment is confirmed:\n📅 ${reminderDate}\n⏰ ${reminderTime}\n🏥 ${reminderClinic}\n\nWe look forward to seeing you! 😊`;
          await sendMessage(reminderPhone, msg);
          console.log(`[Reminder] ✅ 3-min post-booking reminder sent to: ${reminderPhone}`);
        } catch (e) {
          console.error('[Reminder] ❌ Post-booking reminder error:', e.message);
        }
      }, 3 * 60 * 1000); // 3 minutes — change to production timing when ready

      const confirmDocAR = fd.doctor_name_ar || fd.doctor_name;
      const doctorConfirmLine = fd.doctor_name
        ? (ar ? `\n👨‍⚕️ الطبيب: ${confirmDocAR}` : `\n👨‍⚕️ Doctor: ${fd.doctor_name}`)
        : '';
      const confirmTreatment = ar ? (TREATMENT_MAP_AR[fd.treatment] || fd.treatment) : fd.treatment;
      const confirmDate      = ar ? toArabicDate(fd.preferred_date) : fd.preferred_date;
      const confirmTime = ar ? (fd.time_slot_ar || toArabicTime(fd.time_slot)) : fd.time_slot;

      // FIX: Send confirmation FIRST, then clear patient state.
      // This guarantees the patient always receives their confirmation message.
      // If sendMessage throws, the patient remains in step 8 and can retry.
      await sendMessage(phone, ar
        ? `🎉 *تم تأكيد موعدك!*\n\n📅 ${confirmDate}\n⏰ ${confirmTime}\n🏥 ${cl.name}\n🦷 ${confirmTreatment}${doctorConfirmLine}\n\nفي الاستخدام الحقيقي، أنا أتولى كل هذا بنسبة 100%.\n\n⚡ اشترك الآن بـ 299 ريال/الشهر أو تحدث مع جيك للأسئلة.\n\n💡 اكتب *help* في أي وقت لرؤية خياراتك\n0️⃣ القائمة الرئيسية`
        : `🎉 *Appointment Confirmed!*\n\n📅 ${fd.preferred_date}\n⏰ ${fd.time_slot}\n🏥 ${cl.name}\n🦷 ${fd.treatment}${doctorConfirmLine}\n\nIn real use, I handle 100% of this.\n\n⚡ Activate for 299 SAR/month or Chat with Jake for questions.\n\n💡 Type *help* anytime to see your options\n0️⃣ Main menu`
      );

      // Now safe to clear flow — confirmation is already delivered
      await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
      return;
    } else if (denied) {
      await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
      return sendMessage(phone, ar ? menuAR(cl) : menuEN(cl));
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
        ? 'يرجى إدخال تاريخ الموعد الجديد 😊\n\n💡 اكتب تاريخاً مثل: غداً، 20 أبريل، الاثنين الجاي'
        : 'Please enter your new appointment date 😊\n\n💡 Type a date like: tomorrow, April 20, next Monday'
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
    // Phase 1 — normalise year using getDateISO
    const reschedISO = getDateISO(parsedDate);
    if (!reschedISO) {
      console.warn(`[RescheduleStep1] Invalid date rejected: "${dateInput}"`);
      return sendMessage(phone, ar
        ? 'عذراً، لم أتمكن من فهم التاريخ. يرجى إدخال تاريخ صحيح 😊\n\n💡 اكتب تاريخاً مثل: غداً، 20 أبريل'
        : "Sorry, I couldn't understand that date. Please enter a valid date 😊\n\n💡 Type a date like: tomorrow, April 20"
      );
    }
    parsedDate = new Date(reschedISO + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    console.log(`[RescheduleStep1] date input="${dateInput}" parsed="${parsedDate}"`);
    fd.new_date = parsedDate;
    await savePatient(phone, { ...patient, flow_step: 2, flow_data: fd });
    return sendMessage(phone, timeSlotMsg(ar));
  }

  // Step 2 — New time slot
  if (step === 2) {
    const num = parseInt(rawMsg);
    if (num >= 1 && num <= 8) {
      fd.new_slot    = EN_SLOTS[num - 1]; // always English — for DB and reminder parsing
      fd.new_slot_ar = AR_SLOTS[num - 1]; // Arabic — for patient-facing display
    } else {
      const matched = await extractTimeSlot(rawMsg, EN_SLOTS);
      if (!matched) {
        return sendMessage(phone, ar
          ? 'هذا الوقت غير متاح في جدولنا 😊 يرجى الاختيار من الأوقات المتاحة:\n\n1. 9:00 صباحاً\n2. 10:00 صباحاً\n3. 11:00 صباحاً\n4. 1:00 مساءً\n5. 2:00 مساءً\n6. 3:00 مساءً\n7. 4:00 مساءً\n8. 5:00 مساءً\n\n💡 اضغط رقماً لاختيار موعدك\n0️⃣ القائمة الرئيسية'
          : "That time isn't in our schedule 😊 Please choose from the available slots:\n\n1. 9:00 AM\n2. 10:00 AM\n3. 11:00 AM\n4. 1:00 PM\n5. 2:00 PM\n6. 3:00 PM\n7. 4:00 PM\n8. 5:00 PM\n\n💡 Tap a number to select your time\n0️⃣ Main menu"
        );
      }
      const enIdx = EN_SLOTS.indexOf(matched);
      fd.new_slot    = matched;
      fd.new_slot_ar = AR_SLOTS[enIdx] || toArabicTime(matched);
    }
    const newSlotDisplay = ar ? (fd.new_slot_ar || toArabicTime(fd.new_slot)) : fd.new_slot;
    await savePatient(phone, { ...patient, flow_step: 3, flow_data: fd });
    return sendMessage(phone, ar
      ? `✅ الموعد الجديد:\n📅 ${fd.new_date} الساعة ⏰ ${newSlotDisplay}\n\nهل تؤكد؟\n1️⃣ نعم\n2️⃣ لا\n\n💡 اضغط 1 للتأكيد أو 2 للإلغاء`
      : `✅ New appointment:\n📅 ${fd.new_date} at ⏰ ${fd.new_slot}\n\nConfirm?\n1️⃣ Yes\n2️⃣ No\n\n💡 Tap 1 to confirm or 2 to cancel`
    );
  }

  // Step 3 — Confirm reschedule
  if (step === 3) {
    const confirmed = val === '1' || /^(yes|نعم|تمام|ايوه|موافق)$/i.test(val);
    if (confirmed && fd.appointment_id) {
      console.log(`[TRACE Reschedule Step 3] Executing confirmation logic for ${phone}`);

      // ── Post-reschedule test reminder (3-minute delay for testing) ──
      const reminderPhone  = phone;
      const reminderAr     = ar;
      
      await sendMessage(reminderPhone, reminderAr ? '⏳ تم تفعيل مؤقت الاختبار الخاص بك لمدة 3 دقائق الآن! (إعادة جدولة)' : '⏳ Your 3-minute reminder test timer has just started! (Reschedule)');

      setTimeout(async () => {
        try {
          const msg = reminderAr
            ? `⏰ *تذكير بموعدك!* 🦷\n\nمرحباً ${fd.name}،\nتم تأكيد موعدك بنجاح:\n📅 ${fd.new_date}\n⏰ ${fd.new_slot}\n🏥 ${cl.name}\n\nنتطلع لرؤيتك! 😊`
            : `⏰ *Appointment Reminder!* 🦷\n\nHi ${fd.name},\nYour appointment is confirmed:\n📅 ${fd.new_date}\n⏰ ${fd.new_slot}\n🏥 ${cl.name}\n\nWe look forward to seeing you! 😊`;
          await sendMessage(reminderPhone, msg);
          console.log(`[Reminder] ✅ 3-min post-booking reminder sent to: ${reminderPhone} (Reschedule)`);
        } catch (e) {
          console.error('[Reminder] ❌ Post-booking reminder error:', e.message);
        }
      }, 3 * 60 * 1000); // 3 minutes

      // Proceed with update
      const newDateISO = getDateISO(fd.new_date) || null;
      await updateAppointment(fd.appointment_id, {
        preferred_date:     fd.new_date,
        preferred_date_iso: newDateISO,
        time_slot:          fd.new_slot,
        reminder_sent_24h:  false,
        reminder_sent_1h:   false
      });

      // Phase 3 — update Google Calendar event if exists
      if (calendarLib && fd.calendar_event_id && cl.google_calendar_id && newDateISO) {
        try {
          await calendarLib.updateBookingEvent(cl.google_calendar_id, fd.calendar_event_id, {
            preferred_date_iso: newDateISO,
            time_slot:          fd.new_slot
          });
        } catch (calErr) {
          console.error('[Reschedule] Calendar update error (non-blocking):', calErr.message);
        }
      }
      if (cl.staff_phone && cl.config?.features?.staff_notifications !== false) {
        await sendMessage(cl.staff_phone,
          `🔄 Appointment Rescheduled!\n━━━━━━━━━━━━━━\n👤 Patient: ${fd.name}\n📱 Phone: ${phone}\n📅 New Date: ${fd.new_date}\n⏰ New Time: ${fd.new_slot}\n━━━━━━━━━━━━━━\nRescheduled via WhatsApp AI 🔄`
        );
      }

      try {
        const { releaseSlotByPatient } = require('./slots');
        await releaseSlotByPatient(cl.id, fd.old_doctor_id, fd.old_date_iso, phone);
      } catch (e) {}

      await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
      const reschedSlotDisplay = ar ? (fd.new_slot_ar || toArabicTime(fd.new_slot)) : fd.new_slot;
      return sendMessage(phone, ar
        ? `✅ تم إعادة جدولة موعدك!\n📅 ${fd.new_date} الساعة ⏰ ${reschedSlotDisplay}\nنراك قريباً! 😊\n\n💡 اكتب *help* في أي وقت\n0️⃣ القائمة الرئيسية`
        : `✅ Appointment rescheduled!\n📅 ${fd.new_date} at ⏰ ${fd.new_slot}\nWe'll see you then! 😊\n\n💡 Type *help* anytime\n0️⃣ Main menu`
      );
    } else {
      await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
      return sendMessage(phone, ar ? menuAR(cl) : menuEN(cl));
    }
  }
  } catch (err) {
    console.error('[Reschedule] Error:', err.message);
    await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
    return sendMessage(phone, ar ? menuAR(cl) : menuEN(cl));
  }
}

// ─────────────────────────────────────────────
// CANCEL FLOW
// ─────────────────────────────────────────────
async function handleCancelFlow(phone, rawMsg, lang, ar, step, fd, patient, cl) {
  const val = rawMsg.trim();

  if (step === 1) {
    const confirmed = val === '1' || /^(yes|نعم|تمام|ايوه|موافق)$/i.test(val);
    const denied    = val === '2' || /^(no|لا|لأ|keep|احتفظ)$/i.test(val);

    if (confirmed && fd.appointment_id) {
      await updateAppointment(fd.appointment_id, { status: 'cancelled' });
      // Delete Google Calendar event if exists
      if (calendarLib && fd.calendar_event_id && cl.google_calendar_id) {
        try {
          await calendarLib.deleteBookingEvent(cl.google_calendar_id, fd.calendar_event_id);
        } catch (calErr) {
          console.error('[Cancel] Calendar delete error (non-blocking):', calErr.message);
        }
      }
      // Release doctor slot if applicable
      if (fd.doctor_id && fd.appt_date_iso && cl.id) {
        try {
          const { releaseSlotByPatient } = require('./slots');
          await releaseSlotByPatient(cl.id, fd.doctor_id, fd.appt_date_iso, phone);
        } catch (e) {
          console.error('[Cancel] releaseSlot error (non-blocking):', e.message);
        }
      }
      // Staff notification with feature flag
      if (cl.staff_phone && cl.config?.features?.staff_notifications !== false) {
        await sendMessage(cl.staff_phone,
          `❌ Appointment Cancelled!\n━━━━━━━━━━━━━━\n👤 Patient: ${fd.name}\n📱 Phone: ${phone}\n📅 Date: ${fd.appt_date}\n⏰ Time: ${fd.appt_slot}\n━━━━━━━━━━━━━━\nCancelled via WhatsApp AI ❌`
        );
      }
      await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
      return sendMessage(phone, ar
        ? 'تم إلغاء موعدك.\nنأمل أن نراك قريباً! 😊\n\n1️⃣ حجز موعد جديد\n💡 اكتب *help* في أي وقت\n0️⃣ القائمة الرئيسية'
        : 'Your appointment has been cancelled.\nWe hope to see you soon! 😊\n\n1️⃣ Book a new appointment\n💡 Type *help* anytime\n0️⃣ Main menu'
      );
    } else if (denied) {
      await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
      return sendMessage(phone, ar
        ? `حسناً، تم الاحتفاظ بموعدك. نراك في ${fd.appt_date}! 😊\n\n0️⃣ القائمة الرئيسية`
        : `OK, your appointment is kept. See you on ${fd.appt_date}! 😊\n\n0️⃣ Main menu`
      );
    } else {
      // Invalid input — re-prompt
      return sendMessage(phone, ar
        ? `يرجى الاختيار:\n1️⃣ نعم، ألغِ الموعد\n2️⃣ لا، احتفظ بالموعد\n\n💡 اضغط 1 للإلغاء أو 2 للاحتفاظ\n0️⃣ القائمة الرئيسية`
        : `Please choose:\n1️⃣ Yes, cancel it\n2️⃣ No, keep it\n\n💡 Tap 1 to cancel or 2 to keep\n0️⃣ Main menu`
      );
    }
  }

  // Catch-all for unexpected steps — reset to menu
  await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
  return sendMessage(phone, ar ? menuAR(cl) : menuEN(cl));
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
      return sendMessage(phone, ar ? menuAR(cl) : menuEN(cl));

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
          ? 'ليس لديك أي مواعيد قادمة.\nهل تريد حجز موعد؟\n1️⃣ حجز موعد\n0️⃣ القائمة الرئيسية'
          : "You don't have any upcoming appointments.\nWould you like to book one?\n1️⃣ Book appointment\n0️⃣ Main menu"
        );
      }
      await savePatient(phone, { ...patient, current_flow: 'my_appointment', flow_step: 1, flow_data: { appointment_id: appt.id } });
      const apptTimeDisplay = ar ? toArabicTime(appt.time_slot) : appt.time_slot;
      return sendMessage(phone, ar
        ? `📋 موعدك القادم:\n\n👤 الاسم: ${appt.name}\n🦷 العلاج: ${appt.treatment}\n📅 التاريخ: ${appt.preferred_date}\n⏰ الوقت: ${apptTimeDisplay}\n🏥 العيادة: ${cl.name}\n📊 الحالة: مؤكد ✅\n\nهل تريد تغيير شيء؟\n1️⃣ إعادة جدولة\n2️⃣ إلغاء الموعد\n3️⃣ العودة للقائمة\n\n💡 اضغط رقماً للمتابعة`
        : `📋 Your upcoming appointment:\n\n👤 Name: ${appt.name}\n🦷 Treatment: ${appt.treatment}\n📅 Date: ${appt.preferred_date}\n⏰ Time: ${appt.time_slot}\n🏥 Clinic: ${cl.name}\n📊 Status: Confirmed ✅\n\nNeed to change anything?\n1️⃣ Reschedule\n2️⃣ Cancel\n3️⃣ Back to menu\n\n💡 Tap a number to continue`
      );
    }

    case 'reschedule': {
      // Phase 4: feature flag
      if (cl.config?.features?.reschedule === false) {
        return sendMessage(phone, ar
          ? 'خاصية إعادة الجدولة غير متاحة حالياً. يرجى التواصل مع الفريق.'
          : 'Rescheduling is not available right now. Please contact our staff.'
        );
      }
      const appt = await getAppointment(phone);
      if (!appt) {
        return sendMessage(phone, ar
          ? 'ليس لديك مواعيد قادمة للإعادة جدولة.'
          : 'You have no upcoming appointments to reschedule.'
        );
      }
      await savePatient(phone, { ...patient, current_flow: 'reschedule', flow_step: 1, flow_data: { appointment_id: appt.id, name: appt.name, calendar_event_id: appt.calendar_event_id || null } });
      return sendMessage(phone, ar
        ? `موعدك الحالي:\n📅 ${appt.preferred_date} الساعة ⏰ ${appt.time_slot}\n\nما هو التاريخ الجديد المفضل لديك؟\n\n💡 اكتب تاريخاً مثل: غداً، 20 أبريل، الاثنين الجاي\n0️⃣ القائمة الرئيسية`
        : `Your current appointment:\n📅 ${appt.preferred_date} at ⏰ ${appt.time_slot}\n\nWhat's your new preferred date?\n\n💡 Type a date like: tomorrow, April 20, next Monday\n0️⃣ Main menu`
      );
    }

    case 'cancel': {
      // Phase 4: feature flag
      if (cl.config?.features?.cancel === false) {
        return sendMessage(phone, ar
          ? 'خاصية الإلغاء غير متاحة حالياً. يرجى التواصل مع الفريق.'
          : 'Cancellations are not available right now. Please contact our staff.'
        );
      }
      const appt = await getAppointment(phone);
      if (!appt) {
        return sendMessage(phone, ar
          ? 'ليس لديك مواعيد قادمة للإلغاء.'
          : 'You have no upcoming appointments to cancel.'
        );
      }
      await savePatient(phone, { ...patient, current_flow: 'cancel', flow_step: 1, flow_data: { appointment_id: appt.id, name: appt.name, appt_date: appt.preferred_date, appt_slot: appt.time_slot, calendar_event_id: appt.calendar_event_id || null } });
      return sendMessage(phone, ar
        ? `هل أنت متأكد من إلغاء موعدك في ${appt.preferred_date} الساعة ${appt.time_slot}؟\n1️⃣ نعم، ألغِ الموعد\n2️⃣ لا، احتفظ بالموعد\n\n💡 اضغط 1 للإلغاء أو 2 للاحتفاظ بالموعد`
        : `Are you sure you want to cancel your appointment on ${appt.preferred_date} at ${appt.time_slot}?\n1️⃣ Yes, cancel it\n2️⃣ No, keep it\n\n💡 Tap 1 to cancel or 2 to keep it`
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

    case 'help':
      return sendMessage(phone, ar ? helpMsgAR(cl) : helpMsgEN(cl));

    case 'human':
      return sendMessage(phone, staffMsg(ar));

    default:
      return sendMessage(phone, ar
        ? `لم أفهم تماماً 😊\n\n💡 اضغط رقماً للاختيار، أو اكتب *help* لرؤية الخيارات\n0️⃣ القائمة الرئيسية`
        : `I'm not sure I understood that 😊\n\n💡 Tap a number to choose, or type *help* to see all options\n0️⃣ Main menu`
      );
  }
}

// ─────────────────────────────────────────────
// Message builders
// ─────────────────────────────────────────────

function helpMsgEN(cl) {
  const showReschedule = cl?.config?.features?.reschedule !== false;
  const showCancel     = cl?.config?.features?.cancel     !== false;
  let msg = `Here's how I can help you 😊\n\n📱 *Just type a number:*\n1. Book a new appointment\n2. View your current appointment\n`;
  if (showReschedule) msg += `3. Reschedule your appointment\n`;
  if (showCancel)     msg += `4. Cancel your appointment\n`;
  msg += `5. See our services\n6. Meet our doctors\n7. View prices\n8. Get our location\n9. Leave a review\n10. Talk to our staff\n\n`;
  msg += `💬 *Or just tell me what you need:*\n- 'I have a toothache' → I'll book you in\n- 'How much for braces?' → I'll show prices\n- 'Where are you?' → I'll share location\n- 'Cancel my appointment' → I'll handle it\n\nType 0 anytime to return to main menu 😊`;
  return msg;
}

function helpMsgAR(cl) {
  const showReschedule = cl?.config?.features?.reschedule !== false;
  const showCancel     = cl?.config?.features?.cancel     !== false;
  let msg = `إليك كيف يمكنني مساعدتك 😊\n\n📱 *اكتب رقماً فقط:*\n1. حجز موعد جديد\n2. عرض موعدك الحالي\n`;
  if (showReschedule) msg += `3. إعادة جدولة الموعد\n`;
  if (showCancel)     msg += `4. إلغاء الموعد\n`;
  msg += `5. خدماتنا\n6. تعرف على أطبائنا\n7. الأسعار\n8. موقعنا\n9. تقييم العيادة\n10. التحدث مع الفريق\n\n`;
  msg += `💬 *أو أخبرني بما تحتاج:*\n- 'سني يوجعني' ← سأحجز لك موعداً\n- 'كم سعر التقويم؟' ← سأعرض الأسعار\n- 'وين العيادة؟' ← سأشارك الموقع\n- 'أبغى ألغي موعدي' ← سأتولى الأمر\n\nاكتب 0 في أي وقت للعودة للقائمة الرئيسية 😊`;
  return msg;
}

// Arabic treatment name lookup (BUG 5)
const TREATMENT_MAP_AR = {
  'Cleaning & Polishing': 'تنظيف وتلميع',
  'Fillings':             'حشوات',
  'Braces & Orthodontics':'تقويم الأسنان',
  'Teeth Whitening':      'تبييض الأسنان',
  'Extraction':           'خلع',
  'Dental Implants':      'زراعة أسنان',
  'Root Canal':           'علاج العصب',
  'Other':                'أخرى'
};

// Convert any "H:MM AM/PM" time string to Arabic "H:MM صباحاً/مساءً"
function toArabicTime(timeStr) {
  if (!timeStr) return timeStr;
  if (/صباحاً|مساءً/.test(timeStr)) return timeStr; // already Arabic
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return timeStr;
  const ampm = match[3].toUpperCase() === 'AM' ? 'صباحاً' : 'مساءً';
  return `${match[1]}:${match[2]} ${ampm}`;
}

// Convert English date string to Arabic (BUG 6)
function toArabicDate(dateStr) {
  if (!dateStr) return dateStr;
  const MONTHS_AR = { January:'يناير', February:'فبراير', March:'مارس', April:'أبريل', May:'مايو', June:'يونيو', July:'يوليو', August:'أغسطس', September:'سبتمبر', October:'أكتوبر', November:'نوفمبر', December:'ديسمبر' };
  const DAYS_AR   = { Sunday:'الأحد', Monday:'الاثنين', Tuesday:'الثلاثاء', Wednesday:'الأربعاء', Thursday:'الخميس', Friday:'الجمعة', Saturday:'السبت' };
  let result = dateStr;
  Object.entries(DAYS_AR).forEach(([en, ar])   => { result = result.replace(en, ar); });
  Object.entries(MONTHS_AR).forEach(([en, ar]) => { result = result.replace(en, ar); });
  return result;
}

function bookingSummaryMsg(ar, fd, phone, cl) {
  const doctorDisplay = ar
    ? ((fd.doctor_name_ar || fd.doctor_name) ? (fd.doctor_name_ar || fd.doctor_name) : 'بدون تفضيل')
    : (fd.doctor_name || 'No preference');
  const notes = fd.description || (ar ? 'لا يوجد' : 'None');
  // fd.time_slot is always English; convert to Arabic for display if needed
  const displayTime      = ar ? (fd.time_slot_ar || toArabicTime(fd.time_slot)) : fd.time_slot;
  const displayTreatment = ar ? (TREATMENT_MAP_AR[fd.treatment] || fd.treatment) : fd.treatment;
  const displayDate      = ar ? toArabicDate(fd.preferred_date) : fd.preferred_date;
  return ar
    ? `✅ *ملخص الحجز*\n\n👤 *الاسم:* ${fd.name}\n📱 *الهاتف:* ${fd.phone || phone}\n🦷 *العلاج:* ${displayTreatment}\n📝 *الملاحظات:* ${notes}\n👨‍⚕️ *الطبيب:* ${doctorDisplay}\n📅 *التاريخ:* ${displayDate}\n⏰ *الوقت:* ${displayTime}\n🏥 *العيادة:* ${cl.name}\n\nهل كل شيء صحيح؟\n1️⃣ نعم، أؤكد الحجز ✅\n2️⃣ لا، أريد تغيير شيء\n\n💡 اضغط 1 للتأكيد أو 2 للعودة`
    : `✅ *Booking Summary*\n\n👤 *Name:* ${fd.name}\n📱 *Phone:* ${fd.phone || phone}\n🦷 *Treatment:* ${fd.treatment}\n📝 *Notes:* ${notes}\n👨‍⚕️ *Doctor:* ${fd.doctor_name || 'No preference'}\n📅 *Date:* ${fd.preferred_date}\n⏰ *Time:* ${fd.time_slot}\n🏥 *Clinic:* ${cl.name}\n\nDoes everything look correct?\n1️⃣ Yes, confirm booking ✅\n2️⃣ No, make changes\n\n💡 Tap 1 to confirm or 2 to go back`;
}

function doctorSelectionMsg(ar, doctors) {
  const lines = doctors.map((doc, i) => ar
    ? `${i + 1}. د. ${doc.name_ar || doc.name}\n🎓 الدرجة: ${doc.degree_ar || doc.degree}\n⭐ التخصص: ${doc.specialization_ar || doc.specialization}\n📅 متاح: ${doc.available_ar || doc.available}`
    : `${i + 1}. Dr. ${doc.name}\n🎓 Degree: ${doc.degree}\n⭐ Specialization: ${doc.specialization}\n📅 Available: ${doc.available}`
  );
  return ar
    ? `👨‍⚕️ فريقنا الطبي:\n\n${lines.join('\n\n')}\n\n💡 اضغط رقماً للحجز مع طبيب محدد أو اضغط *0* للمتابعة بدون تحديد`
    : `👨‍⚕️ Our Dental Team:\n\n${lines.join('\n\n')}\n\n💡 Tap a number to book with a specific doctor, or press *0* to skip`;
}

function doctorsMsg(ar, cl) {
  const doctors = cl.doctors || [];
  if (!doctors.length) {
    return ar
      ? 'سيتم إضافة معلومات الأطباء قريباً.\n1️⃣ حجز موعد\n2️⃣ العودة للقائمة'
      : 'Doctor information will be available soon.\n1️⃣ Book appointment\n2️⃣ Back to menu';
  }
  const lines = doctors.map((doc, i) => ar
    ? `${i + 1}. د. ${doc.name_ar || doc.name}\n🎓 الدرجة: ${doc.degree_ar || doc.degree}\n⭐ التخصص: ${doc.specialization_ar || doc.specialization}\n📅 متاح: ${doc.available_ar || doc.available}`
    : `${i + 1}. Dr. ${doc.name}\n🎓 Degree: ${doc.degree}\n⭐ Specialization: ${doc.specialization}\n📅 Available: ${doc.available}`
  );
  return ar
    ? `👨‍⚕️ فريقنا الطبي:\n\n${lines.join('\n\n')}\n\n💡 اضغط رقماً للحجز مع طبيب محدد أو اضغط 0 للقائمة الرئيسية`
    : `👨‍⚕️ Our Dental Team:\n\n${lines.join('\n\n')}\n\n💡 Tap a number to book or 0 for main menu`;
}

function treatmentMenuMsg(ar) {
  return ar
    ? 'ما نوع العلاج الذي تحتاجه؟\n\n1. تنظيف وتلميع 🦷\n2. حشوات\n3. تقويم الأسنان 📐\n4. تبييض الأسنان ⚪\n5. خلع\n6. زراعة أسنان 🔬\n7. علاج العصب 🏥\n8. أخرى / غير متأكد\n\n💡 اضغط رقماً للاختيار\n0️⃣ القائمة الرئيسية'
    : 'What type of treatment do you need?\n\n1. Cleaning & Polishing 🦷\n2. Fillings\n3. Braces & Orthodontics 📐\n4. Teeth Whitening ⚪\n5. Extraction\n6. Dental Implants 🔬\n7. Root Canal 🏥\n8. Other / Not sure\n\n💡 Tap a number to choose\n0️⃣ Main menu';
}

function timeSlotMsg(ar) {
  return ar
    ? 'اختر الوقت المناسب: ⏰\n\n1. 9:00 صباحاً\n2. 10:00 صباحاً\n3. 11:00 صباحاً\n4. 1:00 مساءً\n5. 2:00 مساءً\n6. 3:00 مساءً\n7. 4:00 مساءً\n8. 5:00 مساءً\n\n💡 اضغط رقماً لاختيار موعدك\n0️⃣ القائمة الرئيسية'
    : 'Choose your preferred time: ⏰\n\n1. 9:00 AM\n2. 10:00 AM\n3. 11:00 AM\n4. 1:00 PM\n5. 2:00 PM\n6. 3:00 PM\n7. 4:00 PM\n8. 5:00 PM\n\n💡 Tap a number to select your time\n0️⃣ Main menu';
}

function servicesMsg(ar) {
  return ar
    ? '🦷 خدماتنا:\n\n✨ تنظيف وتلميع الأسنان\n🔧 الحشوات والترميم\n📐 تقويم الأسنان\n⚪ تبييض الأسنان\n🔬 زراعة الأسنان\n❌ خلع الأسنان\n🏥 علاج العصب\n👶 طب أسنان الأطفال\n🦷 القشور والتيجان\n😁 ابتسامة هوليوود\n\n💡 اضغط 1 للحجز أو 0 للقائمة الرئيسية'
    : '🦷 Our Services:\n\n✨ Cleaning & Polishing\n🔧 Fillings & Restorations\n📐 Braces & Orthodontics\n⚪ Teeth Whitening\n🔬 Dental Implants\n❌ Extractions\n🏥 Root Canal Treatment\n👶 Pediatric Dentistry\n🦷 Veneers & Crowns\n😁 Smile Makeover\n\n💡 Tap 1 to book or 0 for main menu';
}

function pricesMsg(ar) {
  return ar
    ? '💰 أسعارنا التقريبية:\n\n✨ تنظيف: 150-250 ريال\n🔧 حشوة: 200-400 ريال\n⚪ تبييض: 800-1,500 ريال\n📐 تقويم: 3,000-8,000 ريال\n🔬 زراعة: 3,500-6,000 ريال\n🏥 علاج عصب: 800-1,500 ريال\n🦷 قشرة: 800-1,200 ريال للسن\n\n📌 الأسعار النهائية تُحدد بعد الفحص.\n\n💡 اضغط 1 للحجز أو 0 للقائمة الرئيسية'
    : '💰 Our Approximate Prices:\n\n✨ Cleaning: 150-250 SAR\n🔧 Filling: 200-400 SAR\n⚪ Whitening: 800-1,500 SAR\n📐 Braces: 3,000-8,000 SAR\n🔬 Implant: 3,500-6,000 SAR\n🏥 Root Canal: 800-1,500 SAR\n🦷 Veneer: 800-1,200 SAR per tooth\n\n📌 Final prices confirmed after examination.\n\n💡 Tap 1 to book or 0 for main menu';
}

function locationMsg(ar, cl) {
  return ar
    ? `📍 *موقع ${cl.name}*\n\n*العنوان:*\n${cl.location || 'تواصل معنا للعنوان'}\n\n🗺️ خرائط Google: ${cl.maps_link || 'https://maps.google.com'}\n\n*🕐 أوقات العمل:*\n*الأحد – الخميس:* 9:00 صباحاً – 9:00 مساءً\n*الجمعة:* 4:00 مساءً – 9:00 مساءً\n*السبت:* 9:00 صباحاً – 6:00 مساءً\n\n💡 اضغط 1 للحجز أو 0 للقائمة الرئيسية`
    : `📍 *${cl.name} Location*\n\n*Address:*\n${cl.location || 'Contact us for our address.'}\n\n🗺️ Google Maps: ${cl.maps_link || 'https://maps.google.com'}\n\n*🕐 Working Hours:*\n*Sun–Thu:* 9:00 AM – 9:00 PM\n*Fri:* 4:00 PM – 9:00 PM\n*Sat:* 9:00 AM – 6:00 PM\n\n💡 Tap 1 to book or 0 for main menu`;
}

function reviewMsg(ar, cl) {
  return ar
    ? `⭐ شكراً لاختيارك عيادتنا!\nرأيك يعني لنا الكثير 🙏\n\nيرجى تقييمنا على Google من هنا:\n${cl.review_link || 'https://g.page/r/your-review-link'}\n\nلن يأخذ منك سوى دقيقة واحدة وسيساعد المرضى الآخرين 😊\n\n0️⃣ القائمة الرئيسية`
    : `⭐ Thank you for choosing us!\nYour feedback means everything to us 🙏\n\nPlease leave us a Google review here:\n${cl.review_link || 'https://g.page/r/your-review-link'}\n\nIt only takes 1 minute and helps other patients find us 😊\n\n0️⃣ Main menu`;
}

function staffMsg(ar) {
  return ar
    ? '👩‍⚕️ جاري تحويلك إلى فريقنا الآن...\nالرجاء الانتظار لحظة 🙏\nسيرد عليك فريقنا قريباً 😊\n\n0️⃣ القائمة الرئيسية'
    : '👩‍⚕️ Connecting you with our team now...\nPlease hold on for a moment 🙏\nOur staff will respond to your message shortly 😊\n\n0️⃣ Main menu';
}

module.exports = { handleMessage };
