const { getPatient, insertPatient, savePatient, saveAppointment, getAppointment, updateAppointment } = require('./db');
const { sendMessage } = require('./whatsapp');
const { detectIntent } = require('./ai');

// ─────────────────────────────────────────────
// Static strings
// ─────────────────────────────────────────────

const LANG_SELECT = '🌐 Please choose your language / اختر لغتك:\n1️⃣ English\n2️⃣ العربية';

function menuEN(clinicName) {
  return `Welcome to ${clinicName}! 🦷✨\nI'm your AI dental assistant, available 24/7.\nHow can I help you today?\n\n1️⃣ Book appointment\n2️⃣ My appointment\n3️⃣ Reschedule\n4️⃣ Cancel appointment\n5️⃣ Our services\n6️⃣ Prices 💰\n7️⃣ Location 📍\n8️⃣ Leave a review ⭐\n9️⃣ Talk to staff 👩‍⚕️\n\nJust tap a number or tell me what you need 😊`;
}

function menuAR(clinicName) {
  return `أهلاً وسهلاً بك في ${clinicName}! 🦷✨\nأنا مساعدك الذكي، متاح على مدار الساعة.\nكيف يمكنني مساعدتك اليوم؟\n\n1️⃣ حجز موعد\n2️⃣ موعدي الحالي\n3️⃣ إعادة جدولة\n4️⃣ إلغاء الموعد\n5️⃣ خدماتنا\n6️⃣ الأسعار 💰\n7️⃣ الموقع 📍\n8️⃣ تقييم العيادة ⭐\n9️⃣ التحدث مع الفريق 👩‍⚕️\n\nاضغط على رقم أو أخبرني بما تحتاج 😊`;
}

// ─────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────
async function handleMessage(phone, text, clinic) {
  const msg = text.trim();

  // Fallback clinic if none found in DB yet
  const cl = clinic || {
    name: 'Our Clinic',
    location: 'Please contact us for our address.',
    maps_link: 'https://maps.google.com',
    review_link: 'https://g.page/r/your-review-link',
    staff_phone: null,
    plan: 'basic'
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

  // Run through AI intent detection with full context
  const ai = await detectIntent(msg, flow, step);
  const { intent, extracted_value } = ai;

  // Handle language change at any point
  if (intent === 'change_language') {
    const newLang = ai.detected_language === 'ar' ? 'ar' : 'en';
    await savePatient(phone, { ...patient, language: newLang, current_flow: null, flow_step: 0, flow_data: {} });
    return sendMessage(phone, newLang === 'ar' ? menuAR(cl.name) : menuEN(cl.name));
  }

  // Active flow routing
  if (flow === 'booking') {
    if (intent !== 'continue_flow' && intent !== 'unknown') {
      // Interrupt: answer their question, then offer to continue
      const interruptReply = await getIntentReply(phone, intent, lang, ar, cl);
      if (interruptReply) {
        await sendMessage(phone, interruptReply);
        return sendMessage(phone, ar
          ? 'بالمناسبة، كنت في منتصف حجز موعد. هل تريد المتابعة؟\n1️⃣ نعم، أكمل\n2️⃣ لا، ابدأ من جديد'
          : 'By the way, you were in the middle of booking. Would you like to continue?\n1️⃣ Yes, continue\n2️⃣ No, start over'
        );
      }
    }
    return handleBookingFlow(phone, msg, extracted_value, lang, ar, step, fd, patient, cl);
  }

  if (flow === 'reschedule') {
    return handleRescheduleFlow(phone, msg, extracted_value, lang, ar, step, fd, patient, cl);
  }

  if (flow === 'cancel') {
    return handleCancelFlow(phone, msg, lang, ar, step, fd, patient, cl);
  }

  // No active flow — route by intent
  return routeIntent(phone, intent, lang, ar, msg, patient, cl);
}

// ─────────────────────────────────────────────
// Return a text reply for an intent (for interrupt handling)
// ─────────────────────────────────────────────
async function getIntentReply(phone, intent, lang, ar, cl) {
  switch (intent) {
    case 'greeting': return ar ? menuAR(cl.name) : menuEN(cl.name);
    case 'services': return servicesMsg(ar);
    case 'prices': return pricesMsg(ar);
    case 'location': return locationMsg(ar, cl);
    case 'reviews': return reviewMsg(ar, cl);
    case 'human': return staffMsg(ar);
    default: return null;
  }
}

// ─────────────────────────────────────────────
// BOOKING FLOW — 7 steps
// ─────────────────────────────────────────────
const EXIT_RE = /^(menu|main menu|back|go back|start over|cancel|stop|exit|quit|قائمة|قائمة رئيسية|رجوع|ارجع|إلغاء|توقف|خروج|من البداية)$/i;

async function handleBookingFlow(phone, rawMsg, extractedValue, lang, ar, step, fd, patient, cl) {
  const val = (extractedValue !== null && extractedValue !== undefined) ? String(extractedValue) : rawMsg;

  // Exit keywords — cancel flow and show menu
  if (EXIT_RE.test(rawMsg.trim())) {
    await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
    return sendMessage(phone, ar ? menuAR(cl.name) : menuEN(cl.name));
  }

  // Step 1 — Name
  if (step === 1) {
    fd.name = val;
    await savePatient(phone, { ...patient, flow_step: 2, flow_data: fd });
    return sendMessage(phone, ar
      ? `شكراً ${fd.name} 😊\nرقم واتساب الخاص بك: *${phone}*\nهل هذا صحيح؟\n1️⃣ نعم، هذا صحيح\n2️⃣ لا، أريد رقماً آخر`
      : `Thanks ${fd.name} 😊\nYour WhatsApp number is: *${phone}*\nIs this correct?\n1️⃣ Yes, that's correct\n2️⃣ No, use a different number`
    );
  }

  // Step 2 — Confirm phone
  if (step === 2) {
    const wantsChange = val === '2' || /^(no|change|لا|تغيير)$/i.test(val);
    if (wantsChange) {
      await savePatient(phone, { ...patient, flow_step: 21, flow_data: fd });
      return sendMessage(phone, ar ? 'من فضلك أدخل رقم هاتفك:' : 'Please enter your phone number:');
    }
    fd.phone = phone;
    await savePatient(phone, { ...patient, flow_step: 3, flow_data: fd });
    return sendMessage(phone, treatmentMenuMsg(ar));
  }

  // Step 21 — Custom phone
  if (step === 21) {
    fd.phone = val;
    await savePatient(phone, { ...patient, flow_step: 3, flow_data: fd });
    return sendMessage(phone, treatmentMenuMsg(ar));
  }

  // Step 3 — Treatment
  if (step === 3) {
    const treatments = ['', 'Cleaning & Polishing', 'Fillings', 'Braces & Orthodontics', 'Teeth Whitening', 'Extraction', 'Dental Implants', 'Root Canal', 'Other'];
    const treatmentsAr = ['', 'تنظيف وتلميع', 'حشوات', 'تقويم الأسنان', 'تبييض الأسنان', 'خلع', 'زراعة أسنان', 'علاج العصب', 'أخرى'];
    const num = parseInt(rawMsg);
    if (extractedValue && isNaN(num)) {
      fd.treatment = extractedValue;
    } else {
      fd.treatment = ar ? (treatmentsAr[num] || rawMsg) : (treatments[num] || rawMsg);
    }
    await savePatient(phone, { ...patient, flow_step: 4, flow_data: fd });
    return sendMessage(phone, ar
      ? 'هل لديك ملاحظات أو وصف للمشكلة؟ (اختياري)\nاكتب ملاحظتك أو أرسل *0* للتخطي'
      : 'Do you have any notes or description of your issue? (optional)\nType your note or send *0* to skip'
    );
  }

  // Step 4 — Notes
  if (step === 4) {
    fd.description = (val === '0' || /^(skip|no|nothing|لا|تخطي)$/i.test(val)) ? '' : val;
    await savePatient(phone, { ...patient, flow_step: 5, flow_data: fd });
    return sendMessage(phone, ar
      ? 'متى تفضل موعدك؟ 📅\nيمكنك قول:\n• غداً\n• الاثنين\n• 20 أبريل\n• أي تاريخ محدد'
      : 'When would you like your appointment? 📅\nYou can say:\n• Tomorrow\n• Monday\n• April 20\n• Any specific date'
    );
  }

  // Step 5 — Date
  if (step === 5) {
    fd.preferred_date = val;
    await savePatient(phone, { ...patient, flow_step: 6, flow_data: fd });
    return sendMessage(phone, timeSlotMsg(ar));
  }

  // Step 6 — Time slot
  if (step === 6) {
    const slots = ['', '9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM'];
    const slotsAr = ['', '9:00 صباحاً', '10:00 صباحاً', '11:00 صباحاً', '1:00 مساءً', '2:00 مساءً', '3:00 مساءً', '4:00 مساءً', '5:00 مساءً'];
    const num = parseInt(rawMsg);
    if (extractedValue && isNaN(num)) {
      fd.time_slot = extractedValue;
    } else {
      fd.time_slot = ar ? (slotsAr[num] || val) : (slots[num] || val);
    }

    const summary = ar
      ? `✅ ملخص الحجز:\n\n👤 الاسم: ${fd.name}\n📱 الهاتف: ${fd.phone || phone}\n🦷 العلاج: ${fd.treatment}\n📝 الملاحظات: ${fd.description || 'لا يوجد'}\n📅 التاريخ: ${fd.preferred_date}\n⏰ الوقت: ${fd.time_slot}\n🏥 العيادة: ${cl.name}\n\nهل تؤكد الحجز؟\n1️⃣ نعم، أؤكد ✅\n2️⃣ لا، العودة`
      : `✅ Booking Summary:\n\n👤 Name: ${fd.name}\n📱 Phone: ${fd.phone || phone}\n🦷 Treatment: ${fd.treatment}\n📝 Notes: ${fd.description || 'None'}\n📅 Date: ${fd.preferred_date}\n⏰ Time: ${fd.time_slot}\n🏥 Clinic: ${cl.name}\n\nConfirm your booking?\n1️⃣ Yes, confirm ✅\n2️⃣ No, go back`;

    await savePatient(phone, { ...patient, flow_step: 7, flow_data: fd });
    return sendMessage(phone, summary);
  }

  // Step 7 — Confirm
  if (step === 7) {
    const confirmed = val === '1' || /^(yes|confirm|نعم|أؤكد)$/i.test(val);
    if (confirmed) {
      const appt = await saveAppointment({
        phone: fd.phone || phone,
        clinic_id: cl.id || null,
        name: fd.name,
        treatment: fd.treatment,
        description: fd.description,
        preferred_date: fd.preferred_date,
        time_slot: fd.time_slot
      });
      await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
      // Staff notification
      if (cl.staff_phone) {
        await sendMessage(cl.staff_phone,
          `🦷 New Booking Alert!\n━━━━━━━━━━━━━━\n👤 Patient: ${fd.name}\n📱 Phone: ${fd.phone || phone}\n🔧 Treatment: ${fd.treatment}\n📝 Notes: ${fd.description || 'None'}\n📅 Date: ${fd.preferred_date}\n⏰ Time: ${fd.time_slot}\n━━━━━━━━━━━━━━\nBooked via WhatsApp AI ✅`
        );
      }
      return sendMessage(phone, ar
        ? `🎉 تم تأكيد موعدك بنجاح!\nنراك في ${fd.preferred_date} الساعة ${fd.time_slot}.\nسنرسل لك تذكيراً قبل موعدك.\nشكراً لك! 😊🦷`
        : `🎉 Your appointment is confirmed!\nWe'll see you on ${fd.preferred_date} at ${fd.time_slot}.\nWe'll send you a reminder before your appointment.\nThank you! 😊🦷`
      );
    } else {
      await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
      return sendMessage(phone, ar
        ? 'حسناً، تم إلغاء الحجز. أرسل أي رسالة للعودة للقائمة.'
        : 'OK, booking cancelled. Send any message to return to the menu.'
      );
    }
  }
}

// ─────────────────────────────────────────────
// RESCHEDULE FLOW
// ─────────────────────────────────────────────
async function handleRescheduleFlow(phone, rawMsg, extractedValue, lang, ar, step, fd, patient, cl) {
  const val = (extractedValue !== null && extractedValue !== undefined) ? String(extractedValue) : rawMsg;

  // Step 1 — Ask new date
  if (step === 1) {
    fd.new_date = val;
    await savePatient(phone, { ...patient, flow_step: 2, flow_data: fd });
    return sendMessage(phone, timeSlotMsg(ar));
  }

  // Step 2 — New time slot
  if (step === 2) {
    const slots = ['', '9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM'];
    const slotsAr = ['', '9:00 صباحاً', '10:00 صباحاً', '11:00 صباحاً', '1:00 مساءً', '2:00 مساءً', '3:00 مساءً', '4:00 مساءً', '5:00 مساءً'];
    const num = parseInt(rawMsg);
    fd.new_slot = ar ? (slotsAr[num] || val) : (slots[num] || val);

    const summary = ar
      ? `✅ الموعد الجديد:\n📅 ${fd.new_date} الساعة ⏰ ${fd.new_slot}\n\nهل تؤكد؟\n1️⃣ نعم\n2️⃣ لا`
      : `✅ New appointment:\n📅 ${fd.new_date} at ⏰ ${fd.new_slot}\n\nConfirm?\n1️⃣ Yes\n2️⃣ No`;
    await savePatient(phone, { ...patient, flow_step: 3, flow_data: fd });
    return sendMessage(phone, summary);
  }

  // Step 3 — Confirm reschedule
  if (step === 3) {
    const confirmed = val === '1' || /^(yes|نعم)$/i.test(val);
    if (confirmed && fd.appointment_id) {
      await updateAppointment(fd.appointment_id, {
        preferred_date: fd.new_date,
        time_slot: fd.new_slot,
        reminder_sent_24h: false,
        reminder_sent_1h: false
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
}

// ─────────────────────────────────────────────
// CANCEL FLOW
// ─────────────────────────────────────────────
async function handleCancelFlow(phone, rawMsg, lang, ar, step, fd, patient, cl) {
  const val = rawMsg.trim();

  // Step 1 — Confirm cancellation
  if (step === 1) {
    const confirmed = val === '1' || /^(yes|نعم)$/i.test(val);
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
  switch (intent) {
    case 'greeting':
      return sendMessage(phone, ar ? menuAR(cl.name) : menuEN(cl.name));

    case 'booking':
      await savePatient(phone, { ...patient, current_flow: 'booking', flow_step: 1, flow_data: {} });
      return sendMessage(phone, ar
        ? 'رائع! لنبدأ الحجز 😊\nما اسمك الكريم؟'
        : 'Great! Let\'s book your appointment 😊\nWhat\'s your full name?'
      );

    case 'my_appointment': {
      const appt = await getAppointment(phone);
      if (!appt) {
        return sendMessage(phone, ar
          ? 'ليس لديك مواعيد قادمة.\nهل تريد حجز موعد؟\n1️⃣ حجز موعد\n2️⃣ العودة للقائمة'
          : 'You don\'t have any upcoming appointments.\nWould you like to book one?\n1️⃣ Book appointment\n2️⃣ Back to menu'
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

    case 'prices':
      return sendMessage(phone, pricesMsg(ar));

    case 'location':
      return sendMessage(phone, locationMsg(ar, cl));

    case 'reviews':
      return sendMessage(phone, reviewMsg(ar, cl));

    case 'human':
      return sendMessage(phone, staffMsg(ar));

    default:
      return sendMessage(phone, ar ? menuAR(cl.name) : menuEN(cl.name));
  }
}

// ─────────────────────────────────────────────
// Static message builders
// ─────────────────────────────────────────────

function treatmentMenuMsg(ar) {
  return ar
    ? 'ما نوع العلاج الذي تحتاجه؟\n\n1️⃣ تنظيف وتلميع 🦷\n2️⃣ حشوات\n3️⃣ تقويم الأسنان 📐\n4️⃣ تبييض الأسنان ⚪\n5️⃣ خلع\n6️⃣ زراعة أسنان 🔬\n7️⃣ علاج العصب 🏥\n8️⃣ أخرى / غير متأكد'
    : 'What type of treatment do you need?\n\n1️⃣ Cleaning & Polishing 🦷\n2️⃣ Fillings\n3️⃣ Braces & Orthodontics 📐\n4️⃣ Teeth Whitening ⚪\n5️⃣ Extraction\n6️⃣ Dental Implants 🔬\n7️⃣ Root Canal 🏥\n8️⃣ Other / Not sure';
}

function timeSlotMsg(ar) {
  return ar
    ? 'اختر الوقت المناسب: ⏰\n\n1️⃣ 9:00 صباحاً\n2️⃣ 10:00 صباحاً\n3️⃣ 11:00 صباحاً\n4️⃣ 1:00 مساءً\n5️⃣ 2:00 مساءً\n6️⃣ 3:00 مساءً\n7️⃣ 4:00 مساءً\n8️⃣ 5:00 مساءً'
    : 'Choose your preferred time: ⏰\n\n1️⃣ 9:00 AM\n2️⃣ 10:00 AM\n3️⃣ 11:00 AM\n4️⃣ 1:00 PM\n5️⃣ 2:00 PM\n6️⃣ 3:00 PM\n7️⃣ 4:00 PM\n8️⃣ 5:00 PM';
}

function servicesMsg(ar) {
  return ar
    ? '🦷 خدماتنا:\n\n✨ تنظيف وتلميع الأسنان\n🔧 الحشوات والترميم\n📐 تقويم الأسنان\n⚪ تبييض الأسنان\n🔬 زراعة الأسنان\n❌ خلع الأسنان\n🏥 علاج العصب\n👶 طب أسنان الأطفال\n🦷 القشور والتيجان\n😁 ابتسامة هوليوود\n\nهل أنت مستعد للحجز؟\n1️⃣ حجز موعد\n2️⃣ مشاهدة الأسعار\n3️⃣ العودة للقائمة'
    : '🦷 Our Services:\n\n✨ Cleaning & Polishing\n🔧 Fillings & Restorations\n📐 Braces & Orthodontics\n⚪ Teeth Whitening\n🔬 Dental Implants\n❌ Extractions\n🏥 Root Canal Treatment\n👶 Pediatric Dentistry\n🦷 Veneers & Crowns\n😁 Smile Makeover\n\nReady to book?\n1️⃣ Book appointment\n2️⃣ See prices\n3️⃣ Back to menu';
}

function pricesMsg(ar) {
  return ar
    ? '💰 أسعارنا التقريبية:\n\n✨ تنظيف: 150-250 ريال\n🔧 حشوة: 200-400 ريال\n⚪ تبييض: 800-1,500 ريال\n📐 تقويم: 3,000-8,000 ريال\n🔬 زراعة: 3,500-6,000 ريال\n🏥 علاج عصب: 800-1,500 ريال\n🦷 قشرة: 800-1,200 ريال للسن\n\n📌 الأسعار النهائية تُحدد بعد الفحص.\n1️⃣ حجز موعد\n2️⃣ العودة للقائمة'
    : '💰 Our Approximate Prices:\n\n✨ Cleaning: 150-250 SAR\n🔧 Filling: 200-400 SAR\n⚪ Whitening: 800-1,500 SAR\n📐 Braces: 3,000-8,000 SAR\n🔬 Implant: 3,500-6,000 SAR\n🏥 Root Canal: 800-1,500 SAR\n🦷 Veneer: 800-1,200 SAR per tooth\n\n📌 Final prices confirmed after examination.\n1️⃣ Book appointment\n2️⃣ Back to menu';
}

function locationMsg(ar, cl) {
  return ar
    ? `📍 موقعنا:\n${cl.location || 'تواصل معنا للعنوان'}\n\n🗺️ خرائط Google: ${cl.maps_link || 'https://maps.google.com'}\n\n🕐 أوقات العمل:\nالأحد - الخميس: 9:00 صباحاً - 9:00 مساءً\nالجمعة: 4:00 مساءً - 9:00 مساءً\nالسبت: 9:00 صباحاً - 6:00 مساءً\n\n1️⃣ حجز موعد\n2️⃣ العودة للقائمة`
    : `📍 Our Location:\n${cl.location || 'Contact us for our address.'}\n\n🗺️ Google Maps: ${cl.maps_link || 'https://maps.google.com'}\n\n🕐 Working Hours:\nSunday - Thursday: 9:00 AM - 9:00 PM\nFriday: 4:00 PM - 9:00 PM\nSaturday: 9:00 AM - 6:00 PM\n\n1️⃣ Book appointment\n2️⃣ Back to menu`;
}

function reviewMsg(ar, cl) {
  return ar
    ? `⭐ شكراً لاختيارك عيادتنا!\nرأيك يعني لنا الكثير 🙏\n\nيرجى تقييمنا على Google من هنا:\n${cl.review_link || 'https://g.page/r/your-review-link'}\n\nلن يأخذ منك سوى دقيقة واحدة وسيساعد المرضى الآخرين 😊`
    : `⭐ Thank you for choosing us!\nYour feedback means everything to us 🙏\n\nPlease leave us a Google review here:\n${cl.review_link || 'https://g.page/r/your-review-link'}\n\nIt only takes 1 minute and helps other patients find us 😊`;
}

function staffMsg(ar) {
  return ar
    ? '👩‍⚕️ جاري تحويلك إلى فريقنا الآن...\nالرجاء الانتظار لحظة 🙏\nسيرد عليك فريقنا قريباً خلال ساعات العمل.\n\nأوقات العمل: الأحد-الخميس 9ص-9م، الجمعة 4م-9م، السبت 9ص-6م'
    : '👩‍⚕️ Connecting you with our team now...\nPlease hold on for a moment 🙏\nOur staff will respond shortly during working hours.\n\nWorking hours: Sun-Thu 9AM-9PM, Fri 4PM-9PM, Sat 9AM-6PM';
}

module.exports = { handleMessage };
