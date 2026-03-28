const { getPatient, insertPatient, savePatient, saveAppointment, getAppointment, updateAppointment } = require('./db');
const { sendMessage } = require('./whatsapp');
const { detectIntent, extractDate, extractTimeSlot } = require('./ai');

// ─────────────────────────────────────────────
// Static strings
// ─────────────────────────────────────────────

const LANG_SELECT = '🌐 Please choose your language / اختر لغتك:\n1️⃣ English\n2️⃣ العربية';

function menuEN(clinicName) {
  return `Welcome to ${clinicName}! 🦷✨\nI'm your AI dental assistant, available 24/7.\nHow can I help you today?\n\n1️⃣ Book appointment\n2️⃣ My appointment\n3️⃣ Reschedule\n4️⃣ Cancel appointment\n5️⃣ Our services\n6️⃣ Meet Our Doctors 👨‍⚕️\n7️⃣ Prices 💰\n8️⃣ Location 📍\n9️⃣ Leave a review ⭐\n🔟 Talk to staff 👩‍⚕️\n\nJust tap a number or tell me what you need 😊`;
}

function menuAR(clinicName) {
  return `أهلاً وسهلاً بك في ${clinicName}! 🦷✨\nأنا مساعدك الذكي، متاح على مدار الساعة.\nكيف يمكنني مساعدتك اليوم؟\n\n1️⃣ حجز موعد\n2️⃣ موعدي الحالي\n3️⃣ إعادة جدولة\n4️⃣ إلغاء الموعد\n5️⃣ خدماتنا\n6️⃣ تعرف على أطبائنا 👨‍⚕️\n7️⃣ الأسعار 💰\n8️⃣ الموقع 📍\n9️⃣ تقييم العيادة ⭐\n🔟 التحدث مع الفريق 👩‍⚕️\n\nاضغط على رقم أو أخبرني بما تحتاج 😊`;
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

  const ai = await detectIntent(msg, flow, step);
  const { intent, extracted_value } = ai;

  // Language change — show picker so patient explicitly chooses
  if (intent === 'change_language' || /^(change language|language|لغة|تغيير اللغة|change lang)$/i.test(msg)) {
    await savePatient(phone, { ...patient, language: null, current_flow: null, flow_step: 0, flow_data: {} });
    return sendMessage(phone, LANG_SELECT);
  }

  // Active flow routing
  if (flow === 'booking') {
    if (intent !== 'continue_flow' && intent !== 'unknown') {
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
    case 'services':  return servicesMsg(ar);
    case 'doctors':   return doctorsMsg(ar, cl);
    case 'prices':    return pricesMsg(ar);
    case 'location':  return locationMsg(ar, cl);
    case 'reviews':   return reviewMsg(ar, cl);
    case 'human':     return staffMsg(ar);
    default:          return null;
  }
}

// ─────────────────────────────────────────────
// BOOKING FLOW — steps 1-8
// ─────────────────────────────────────────────

const EXIT_RE = /^(menu|main menu|back|go back|start over|cancel|stop|exit|quit|قائمة|قائمة رئيسية|رجوع|ارجع|إلغاء|توقف|خروج|من البداية)$/i;

const EN_SLOTS = ['9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM'];
const AR_SLOTS = ['9:00 صباحاً', '10:00 صباحاً', '11:00 صباحاً', '1:00 مساءً', '2:00 مساءً', '3:00 مساءً', '4:00 مساءً', '5:00 مساءً'];

async function handleBookingFlow(phone, rawMsg, extractedValue, lang, ar, step, fd, patient, cl) {
  const val = (extractedValue !== null && extractedValue !== undefined) ? String(extractedValue) : rawMsg;

  // Exit keywords — only during data-entry steps, not on binary confirm steps
  if (step <= 6 && EXIT_RE.test(rawMsg.trim())) {
    await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
    return sendMessage(phone, ar ? menuAR(cl.name) : menuEN(cl.name));
  }

  // Step 1 — Name
  if (step === 1) {
    // Clean: strip common prefixes, capitalize each word
    let name = val.trim();
    name = name.replace(/^(my name is|i'm|i am|call me|اسمي|أنا|انا)\s+/i, '').trim();
    name = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    fd.name = name;
    await savePatient(phone, { ...patient, flow_step: 2, flow_data: fd });
    return sendMessage(phone, ar
      ? `شكراً ${fd.name}! 😊\nرقم واتساب الخاص بك: *${phone}*\nهل هذا صحيح؟\n1️⃣ نعم، هذا صحيح\n2️⃣ لا، أريد رقماً آخر`
      : `Thanks ${fd.name}! 😊\nYour WhatsApp number is: *${phone}*\nIs this correct?\n1️⃣ Yes, that's correct\n2️⃣ No, use a different number`
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
    const treatments   = ['', 'Cleaning & Polishing', 'Fillings', 'Braces & Orthodontics', 'Teeth Whitening', 'Extraction', 'Dental Implants', 'Root Canal', 'Other'];
    const treatmentsAr = ['', 'تنظيف وتلميع', 'حشوات', 'تقويم الأسنان', 'تبييض الأسنان', 'خلع', 'زراعة أسنان', 'علاج العصب', 'أخرى'];
    const num = parseInt(rawMsg);
    if (!isNaN(num) && num >= 1 && num <= 8) {
      // Number selection
      fd.treatment = ar ? treatmentsAr[num] : treatments[num];
    } else if (extractedValue && treatments.includes(String(extractedValue))) {
      // AI mapped to exact treatment name
      fd.treatment = String(extractedValue);
    } else if (extractedValue && extractedValue !== null) {
      // AI extracted something — use it
      fd.treatment = String(extractedValue);
    } else {
      // Free text fallback
      fd.treatment = rawMsg;
    }
    await savePatient(phone, { ...patient, flow_step: 4, flow_data: fd });
    return sendMessage(phone, ar
      ? 'هل لديك ملاحظات أو وصف للمشكلة؟ (اختياري)\nاكتب ملاحظتك أو أرسل *0* للتخطي'
      : 'Do you have any notes or description of your issue? (optional)\nType your note or send *0* to skip'
    );
  }

  // Step 4 — Notes (optional)
  if (step === 4) {
    fd.description = (rawMsg.trim() === '0' || /^(skip|no|nothing|لا|تخطي)$/i.test(rawMsg.trim())) ? '' : rawMsg.trim();
    await savePatient(phone, { ...patient, flow_step: 5, flow_data: fd });
    return sendMessage(phone, ar
      ? 'متى تفضل موعدك؟ 📅\nيمكنك قول:\n• غداً\n• الاثنين الجاي\n• 20 أبريل\n• أي تاريخ محدد'
      : 'When would you like your appointment? 📅\nYou can say:\n• Tomorrow\n• Next Monday\n• April 20\n• Any specific date'
    );
  }

  // Step 5 — Date (AI-parsed)
  if (step === 5) {
    const dateInput = rawMsg.trim();

    // Reject only truly empty or single-char input
    if (dateInput.length < 2) {
      await savePatient(phone, { ...patient, flow_step: 5, flow_data: fd });
      return sendMessage(phone, ar
        ? 'يرجى إدخال تاريخ مثل: غداً، الاثنين، أو 20 أبريل 😊'
        : 'Please enter a date like: tomorrow, Monday, or April 20 😊'
      );
    }

    // Try AI extraction — ALWAYS fall back to raw input on any failure
    let parsedDate = dateInput;
    try {
      const extracted = await extractDate(dateInput);
      if (extracted && extracted.length > 2 && extracted !== 'null') {
        parsedDate = extracted;
      }
    } catch (e) {
      console.error('[Step5] extractDate error:', e.message);
    }

    console.log(`[Step5] date input="${dateInput}" parsed="${parsedDate}"`);
    fd.preferred_date = parsedDate;
    await savePatient(phone, { ...patient, flow_step: 6, flow_data: fd });
    return sendMessage(phone, timeSlotMsg(ar));
  }

  // Step 6 — Time slot (number or natural language)
  if (step === 6) {
    const num = parseInt(rawMsg);
    if (num >= 1 && num <= 8) {
      fd.time_slot = ar ? AR_SLOTS[num - 1] : EN_SLOTS[num - 1];
    } else if (extractedValue && EN_SLOTS.includes(String(extractedValue))) {
      fd.time_slot = String(extractedValue);
    } else {
      const matched = await extractTimeSlot(rawMsg, EN_SLOTS);
      if (!matched) {
        // Time not in schedule — re-show time menu, stay on step 6
        return sendMessage(phone, ar
          ? 'هذا الوقت غير متاح في جدولنا 😊 يرجى الاختيار من الأوقات المتاحة:\n\n1️⃣ 9:00 صباحاً\n2️⃣ 10:00 صباحاً\n3️⃣ 11:00 صباحاً\n4️⃣ 1:00 مساءً\n5️⃣ 2:00 مساءً\n6️⃣ 3:00 مساءً\n7️⃣ 4:00 مساءً\n8️⃣ 5:00 مساءً'
          : "That time isn't in our schedule 😊 Please choose from the available slots:\n\n1️⃣ 9:00 AM\n2️⃣ 10:00 AM\n3️⃣ 11:00 AM\n4️⃣ 1:00 PM\n5️⃣ 2:00 PM\n6️⃣ 3:00 PM\n7️⃣ 4:00 PM\n8️⃣ 5:00 PM"
        );
      }
      fd.time_slot = matched;
    }

    // Show doctor selection if clinic has doctors, else go straight to summary
    const doctors = cl.doctors || [];
    if (doctors.length > 0) {
      await savePatient(phone, { ...patient, flow_step: 7, flow_data: fd });
      return sendMessage(phone, doctorSelectionMsg(ar, doctors));
    } else {
      await savePatient(phone, { ...patient, flow_step: 8, flow_data: fd });
      return sendMessage(phone, bookingSummaryMsg(ar, fd, phone, cl));
    }
  }

  // Step 7 — Doctor selection (optional)
  if (step === 7) {
    const doctors = cl.doctors || [];
    const num = parseInt(rawMsg);
    if (rawMsg.trim() === '0' || /^(skip|any|no preference|لا يهم|تخطي|أي طبيب)$/i.test(rawMsg.trim())) {
      fd.doctor_name = null;
    } else if (num >= 1 && num <= doctors.length) {
      const doc = doctors[num - 1];
      fd.doctor_name = ar ? (doc.name_ar || doc.name) : doc.name;
    } else {
      fd.doctor_name = extractedValue ? String(extractedValue) : rawMsg;
    }
    await savePatient(phone, { ...patient, flow_step: 8, flow_data: fd });
    return sendMessage(phone, bookingSummaryMsg(ar, fd, phone, cl));
  }

  // Step 8 — Booking confirmation (use rawMsg directly — AI extraction unreliable here)
  if (step === 8) {
    const raw8 = rawMsg.trim();
    const confirmed = raw8 === '1' || /^(yes|confirm|نعم|أؤكد|تمام|ايوه|موافق|صح|يلا)$/i.test(raw8);
    const denied    = raw8 === '2' || /^(no|back|لا|لأ|العودة|رجوع)$/i.test(raw8);

    if (confirmed) {
      await saveAppointment({
        phone:          fd.phone || phone,
        clinic_id:      cl.id || null,
        name:           fd.name,
        treatment:      fd.treatment,
        description:    fd.description,
        preferred_date: fd.preferred_date,
        time_slot:      fd.time_slot,
        doctor_name:    fd.doctor_name || null
      });
      await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
      if (cl.staff_phone) {
        const doctorLine = fd.doctor_name ? `\n👨‍⚕️ Doctor: ${fd.doctor_name}` : '';
        await sendMessage(cl.staff_phone,
          `🦷 New Booking Alert!\n━━━━━━━━━━━━━━\n👤 Patient: ${fd.name}\n📱 Phone: ${fd.phone || phone}\n🔧 Treatment: ${fd.treatment}\n📝 Notes: ${fd.description || 'None'}${doctorLine}\n📅 Date: ${fd.preferred_date}\n⏰ Time: ${fd.time_slot}\n━━━━━━━━━━━━━━\nBooked via WhatsApp AI ✅`
        );
      }
      return sendMessage(phone, ar
        ? `🎉 تم تأكيد موعدك بنجاح!\nنراك في ${fd.preferred_date} الساعة ${fd.time_slot}.\nسنرسل لك تذكيراً قبل موعدك.\nشكراً لك! 😊🦷`
        : `🎉 Your appointment is confirmed!\nWe'll see you on ${fd.preferred_date} at ${fd.time_slot}.\nWe'll send you a reminder before your appointment.\nThank you! 😊🦷`
      );
    } else if (denied) {
      await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
      return sendMessage(phone, ar
        ? 'حسناً، تم إلغاء الحجز. أرسل أي رسالة للعودة للقائمة.'
        : 'OK, booking cancelled. Send any message to return to the menu.'
      );
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

    let parsedDate = dateInput;
    try {
      const extracted = await extractDate(dateInput);
      if (extracted && extracted.length > 2 && extracted !== 'null') {
        parsedDate = extracted;
      }
    } catch (e) {
      console.error('[RescheduleStep1] extractDate error:', e.message);
    }

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
          ? 'هذا الوقت غير متاح في جدولنا 😊 يرجى الاختيار من الأوقات المتاحة:\n\n1️⃣ 9:00 صباحاً\n2️⃣ 10:00 صباحاً\n3️⃣ 11:00 صباحاً\n4️⃣ 1:00 مساءً\n5️⃣ 2:00 مساءً\n6️⃣ 3:00 مساءً\n7️⃣ 4:00 مساءً\n8️⃣ 5:00 مساءً'
          : "That time isn't in our schedule 😊 Please choose from the available slots:\n\n1️⃣ 9:00 AM\n2️⃣ 10:00 AM\n3️⃣ 11:00 AM\n4️⃣ 1:00 PM\n5️⃣ 2:00 PM\n6️⃣ 3:00 PM\n7️⃣ 4:00 PM\n8️⃣ 5:00 PM"
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
    '1': 'booking', '2': 'my_appointment', '3': 'reschedule',
    '4': 'cancel',  '5': 'services',       '6': 'doctors',
    '7': 'prices',  '8': 'location',       '9': 'reviews', '10': 'human'
  };
  const resolvedIntent = numMap[rawMsg.trim()] || intent;

  switch (resolvedIntent) {
    case 'greeting':
      return sendMessage(phone, ar ? menuAR(cl.name) : menuEN(cl.name));

    case 'booking':
      await savePatient(phone, { ...patient, current_flow: 'booking', flow_step: 1, flow_data: {} });
      return sendMessage(phone, ar
        ? 'رائع! لنبدأ الحجز 😊\nما اسمك الكريم؟'
        : "Great! Let's book your appointment 😊\nWhat's your full name?"
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
  return ar
    ? `✅ *ملخص الحجز*\n\n👤 *الاسم:* ${fd.name}\n📱 *الهاتف:* ${fd.phone || phone}\n🦷 *العلاج:* ${fd.treatment}\n📝 *الملاحظات:* ${notes}\n👨‍⚕️ *الطبيب:* ${doctor}\n📅 *التاريخ:* ${fd.preferred_date}\n⏰ *الوقت:* ${fd.time_slot}\n🏥 *العيادة:* ${cl.name}\n\nهل كل شيء صحيح؟\n1️⃣ نعم، أؤكد الحجز ✅\n2️⃣ لا، أريد تغيير شيء`
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
    ? '👩‍⚕️ جاري تحويلك إلى فريقنا الآن...\nالرجاء الانتظار لحظة 🙏\nسيرد عليك فريقنا قريباً.\n\nأوقات العمل: الأحد-الخميس 9ص-9م، الجمعة 4م-9م، السبت 9ص-6م'
    : '👩‍⚕️ Connecting you with our team now...\nPlease hold on for a moment 🙏\nOur staff will respond shortly during working hours.\n\nWorking hours: Sun-Thu 9AM-9PM, Fri 4PM-9PM, Sat 9AM-6PM';
}

module.exports = { handleMessage };
