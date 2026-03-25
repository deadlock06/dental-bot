const { getPatient, insertPatient, savePatient, saveAppointment } = require('./db');
const { sendMessage } = require('./whatsapp');
const { detectIntent } = require('./ai');

const LANG_SELECT = '🌐 Please choose your language:\n1️⃣ English\n2️⃣ العربية';

const MENU_EN = `Welcome back! 🦷✨
How can I help you today?

1️⃣ Book appointment
2️⃣ Reschedule
3️⃣ Our services
4️⃣ Prices
5️⃣ Location 📍
6️⃣ Leave a review ⭐
7️⃣ Talk to staff 👩‍⚕️

Just tap a number or tell me what you need 😊`;

const MENU_AR = `أهلاً بك! 🦷✨
كيف يمكنني مساعدتك؟

1️⃣ حجز موعد
2️⃣ إعادة جدولة
3️⃣ خدماتنا
4️⃣ الأسعار
5️⃣ الموقع 📍
6️⃣ تقييم ⭐
7️⃣ التحدث مع الفريق 👩‍⚕️

اضغط على رقم أو أخبرني بما تحتاج 😊`;

// ─────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────
async function handleMessage(phone, text) {
  const msg = text.trim();

  // ── Branch 1: Brand new patient (not in DB at all)
  let patient = await getPatient(phone);
  if (!patient) {
    await insertPatient(phone); // pure INSERT, language stays null
    return sendMessage(phone, LANG_SELECT);
  }

  // ── Branch 2: Patient exists but hasn't chosen a language yet
  if (!patient.language) {
    if (msg === '1' || /^english$/i.test(msg)) {
      await savePatient(phone, { language: 'en', current_flow: null, flow_step: 0, flow_data: {} });
      return sendMessage(phone, MENU_EN);
    }
    if (msg === '2' || /^(arabic|عربي|العربية)$/i.test(msg)) {
      await savePatient(phone, { language: 'ar', current_flow: null, flow_step: 0, flow_data: {} });
      return sendMessage(phone, MENU_AR);
    }
    // Any other input — re-show language selection
    return sendMessage(phone, LANG_SELECT);
  }

  // ── Branch 3: Patient exists and has a language — continue normally

  const lang = patient.language;
  const ar = lang === 'ar';
  const flow = patient.current_flow;
  const step = patient.flow_step || 0;
  const fd = patient.flow_data || {};

  // 4. Run EVERY message through AI with full context
  const ai = await detectIntent(msg, flow, step);
  const { intent, extracted_value } = ai;

  // 5. Handle change_language at any point
  if (intent === 'change_language') {
    const newLang = ai.detected_language === 'ar' ? 'ar' : 'en';
    await savePatient(phone, { ...patient, language: newLang, current_flow: null, flow_step: 0, flow_data: {} });
    const newAr = newLang === 'ar';
    return sendMessage(phone, newAr ? MENU_AR : MENU_EN);
  }

  // 6. If patient is in the booking flow
  if (flow === 'booking') {
    // If they want to do something else entirely, reset and route
    if (intent !== 'continue_flow' && intent !== 'unknown') {
      await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
      return routeIntent(phone, intent, lang, ar);
    }
    // Otherwise continue the booking flow, using AI-extracted value when available
    return handleBookingFlow(phone, msg, extracted_value, lang, ar, step, fd, patient);
  }

  // 7. No active flow — route by intent
  return routeIntent(phone, intent, lang, ar);
}

// ─────────────────────────────────────────────
// Booking flow — 7 steps
// ─────────────────────────────────────────────
async function handleBookingFlow(phone, rawMsg, extractedValue, lang, ar, step, fd, patient) {
  // Use AI-extracted value when available, fall back to raw message
  const val = (extractedValue !== null && extractedValue !== undefined) ? String(extractedValue) : rawMsg;

  // Step 1 — Name
  if (step === 1) {
    fd.name = val;
    await savePatient(phone, { ...patient, flow_step: 2, flow_data: fd });
    return sendMessage(phone, ar
      ? `شكراً ${fd.name} 😊\nرقم هاتفك: *${phone}*\nهل هذا صحيح؟\n1️⃣ نعم\n2️⃣ لا، أريد تغييره`
      : `Thanks ${fd.name} 😊\nYour number: *${phone}*\nIs this correct?\n1️⃣ Yes\n2️⃣ No, change it`
    );
  }

  // Step 2 — Confirm phone
  if (step === 2) {
    const confirmed = val === 'yes' || val === '1' || /yes|correct|نعم|صحيح/i.test(val);
    const wantsChange = val === 'no' || val === '2' || /no|change|لا|تغيير/i.test(val);
    if (wantsChange) {
      await savePatient(phone, { ...patient, flow_step: 21, flow_data: fd });
      return sendMessage(phone, ar ? 'من فضلك أدخل رقم هاتفك:' : 'Please enter your phone number:');
    }
    // Default: treat as confirmed
    fd.phone = phone;
    await savePatient(phone, { ...patient, flow_step: 3, flow_data: fd });
    return sendMessage(phone, ar
      ? 'اختر نوع العلاج:\n1️⃣ تنظيف وتلميع\n2️⃣ حشوات\n3️⃣ تقويم\n4️⃣ تبييض\n5️⃣ خلع\n6️⃣ زراعة\n7️⃣ أخرى'
      : 'Choose treatment type:\n1️⃣ Cleaning & Polishing\n2️⃣ Fillings\n3️⃣ Braces\n4️⃣ Whitening\n5️⃣ Extraction\n6️⃣ Implants\n7️⃣ Other'
    );
  }

  // Step 21 — Custom phone number
  if (step === 21) {
    fd.phone = val;
    await savePatient(phone, { ...patient, flow_step: 3, flow_data: fd });
    return sendMessage(phone, ar
      ? 'اختر نوع العلاج:\n1️⃣ تنظيف وتلميع\n2️⃣ حشوات\n3️⃣ تقويم\n4️⃣ تبييض\n5️⃣ خلع\n6️⃣ زراعة\n7️⃣ أخرى'
      : 'Choose treatment type:\n1️⃣ Cleaning & Polishing\n2️⃣ Fillings\n3️⃣ Braces\n4️⃣ Whitening\n5️⃣ Extraction\n6️⃣ Implants\n7️⃣ Other'
    );
  }

  // Step 3 — Treatment type
  if (step === 3) {
    // AI returns extracted_value as English treatment name when possible
    const treatments = ['', 'Cleaning & Polishing', 'Fillings', 'Braces', 'Whitening', 'Extraction', 'Implants', 'Other'];
    const treatmentsAr = ['', 'تنظيف وتلميع', 'حشوات', 'تقويم', 'تبييض', 'خلع', 'زراعة', 'أخرى'];
    const num = parseInt(rawMsg);

    if (extractedValue && isNaN(num)) {
      // AI extracted a treatment name from natural language
      fd.treatment = extractedValue;
    } else {
      fd.treatment = ar ? (treatmentsAr[num] || rawMsg) : (treatments[num] || rawMsg);
    }
    await savePatient(phone, { ...patient, flow_step: 4, flow_data: fd });
    return sendMessage(phone, ar
      ? 'هل لديك ملاحظات أو وصف للمشكلة؟ (اختياري)\nيمكنك كتابة ملاحظة أو إرسال 0 للتخطي'
      : 'Any notes or description of your issue? (optional)\nType a note or send 0 to skip'
    );
  }

  // Step 4 — Notes (fixed: single return, no double-message)
  if (step === 4) {
    fd.description = (val === '0' || val === 'skip' || /no|nothing|لا|تخطي/i.test(val)) ? '' : val;
    await savePatient(phone, { ...patient, flow_step: 5, flow_data: fd });
    return sendMessage(phone, ar
      ? 'متى تفضل موعدك؟\nمثال: غداً، الاثنين، 15 أبريل'
      : 'When would you like your appointment?\nExample: tomorrow, Monday, April 15'
    );
  }

  // Step 5 — Preferred date
  if (step === 5) {
    fd.preferred_date = val; // AI normalises Arabic/English dates
    await savePatient(phone, { ...patient, flow_step: 6, flow_data: fd });
    return sendMessage(phone, ar
      ? 'اختر وقتاً مناسباً:\n1️⃣ 9:00 ص\n2️⃣ 10:00 ص\n3️⃣ 11:00 ص\n4️⃣ 1:00 م\n5️⃣ 2:00 م\n6️⃣ 3:00 م\n7️⃣ 4:00 م\n8️⃣ 5:00 م'
      : 'Choose a time slot:\n1️⃣ 9:00 AM\n2️⃣ 10:00 AM\n3️⃣ 11:00 AM\n4️⃣ 1:00 PM\n5️⃣ 2:00 PM\n6️⃣ 3:00 PM\n7️⃣ 4:00 PM\n8️⃣ 5:00 PM'
    );
  }

  // Step 6 — Time slot
  if (step === 6) {
    const slots = ['', '9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM'];
    const slotsAr = ['', '9:00 ص', '10:00 ص', '11:00 ص', '1:00 م', '2:00 م', '3:00 م', '4:00 م', '5:00 م'];
    const num = parseInt(rawMsg);

    if (extractedValue && isNaN(num)) {
      fd.time_slot = extractedValue;
    } else {
      fd.time_slot = ar ? (slotsAr[num] || val) : (slots[num] || val);
    }

    const summary = ar
      ? `✅ ملخص الحجز:\n\n👤 الاسم: ${fd.name}\n📱 الهاتف: ${fd.phone || phone}\n🦷 العلاج: ${fd.treatment}\n📝 الملاحظات: ${fd.description || 'لا يوجد'}\n📅 التاريخ: ${fd.preferred_date}\n⏰ الوقت: ${fd.time_slot}\n\nهل تؤكد الحجز؟\n1️⃣ نعم، أؤكد ✅\n2️⃣ لا، إلغاء`
      : `✅ Booking Summary:\n\n👤 Name: ${fd.name}\n📱 Phone: ${fd.phone || phone}\n🦷 Treatment: ${fd.treatment}\n📝 Notes: ${fd.description || 'None'}\n📅 Date: ${fd.preferred_date}\n⏰ Time: ${fd.time_slot}\n\nConfirm your booking?\n1️⃣ Yes, confirm ✅\n2️⃣ No, cancel`;

    await savePatient(phone, { ...patient, flow_step: 7, flow_data: fd });
    return sendMessage(phone, summary);
  }

  // Step 7 — Confirmation
  if (step === 7) {
    const confirmed = val === 'yes' || val === '1' || /yes|confirm|نعم|أؤكد/i.test(val);
    if (confirmed) {
      await saveAppointment({ ...fd, phone: fd.phone || phone });
      await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
      return sendMessage(phone, ar
        ? '🎉 تم تأكيد حجزك بنجاح!\nسنتواصل معك قريباً لتأكيد الموعد.\nشكراً لك 😊'
        : '🎉 Booking confirmed!\nWe will be in touch shortly.\nThank you! 😊'
      );
    } else {
      await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });
      return sendMessage(phone, ar
        ? 'تم إلغاء الحجز. كيف يمكنني مساعدتك؟ 😊'
        : 'Booking cancelled. How can I help you? 😊'
      );
    }
  }
}

// ─────────────────────────────────────────────
// Route intent to response
// ─────────────────────────────────────────────
async function routeIntent(phone, intent, lang, ar) {
  switch (intent) {
    case 'greeting':
      return sendMessage(phone, ar ? MENU_AR : MENU_EN);

    case 'booking': {
      await savePatient(phone, {
        language: lang,
        current_flow: 'booking',
        flow_step: 1,
        flow_data: {}
      });
      return sendMessage(phone, ar
        ? 'رائع! لنبدأ الحجز 😊\nما اسمك الكامل؟'
        : 'Great! Let\'s book your appointment 😊\nWhat is your full name?'
      );
    }

    case 'reschedule':
      return sendMessage(phone, ar
        ? 'لإعادة الجدولة يرجى التواصل معنا مباشرة.\n👩‍⚕️ سنقوم بتحويلك إلى الفريق الآن 🙏'
        : 'To reschedule please contact us directly.\n👩‍⚕️ Connecting you to our team now 🙏'
      );

    case 'services':
      return sendMessage(phone, ar
        ? '🦷 خدماتنا:\n\n✨ تنظيف وتلميع الأسنان\n🔧 الحشوات\n📐 تقويم الأسنان\n⚪ تبييض الأسنان\n🔬 الزراعة\n❌ الخلع\n🏥 علاج العصب\n\nللحجز اضغط 1 😊'
        : '🦷 Our Services:\n\n✨ Cleaning & Polishing\n🔧 Fillings\n📐 Braces & Orthodontics\n⚪ Teeth Whitening\n🔬 Dental Implants\n❌ Extractions\n🏥 Root Canal\n\nPress 1 to book 😊'
      );

    case 'prices':
      return sendMessage(phone, ar
        ? '💰 الأسعار التقريبية:\n\n✨ تنظيف: 150-250 ريال\n🔧 حشوة: 200-400 ريال\n⚪ تبييض: 800-1500 ريال\n📐 تقويم: 3000-8000 ريال\n🔬 زراعة: 3500-6000 ريال\n\n📌 الأسعار النهائية تُحدد بعد الفحص'
        : '💰 Approximate Prices:\n\n✨ Cleaning: 150-250 SAR\n🔧 Filling: 200-400 SAR\n⚪ Whitening: 800-1500 SAR\n📐 Braces: 3,000-8,000 SAR\n🔬 Implant: 3,500-6,000 SAR\n\n📌 Final prices confirmed after examination'
      );

    case 'location':
      return sendMessage(phone, ar
        ? '📍 موقعنا:\nالرياض، حي النرجس، شارع الأمير فيصل\n\n🗺️ خرائط Google: https://maps.google.com\n\n🕐 أوقات العمل:\nالأحد - الخميس: 9ص - 9م\nالجمعة: 4م - 9م\nالسبت: 9ص - 6م'
        : '📍 Our Location:\nRiyadh, Al Narjis District, Prince Faisal St\n\n🗺️ Google Maps: https://maps.google.com\n\n🕐 Working Hours:\nSun - Thu: 9AM - 9PM\nFri: 4PM - 9PM\nSat: 9AM - 6PM'
      );

    case 'reviews':
      return sendMessage(phone, ar
        ? '⭐ شكراً لك! رأيك يهمنا جداً\nاضغط هنا لتقييمنا:\nhttps://g.page/r/your-review-link'
        : '⭐ Thank you! Your feedback means a lot\nLeave us a review here:\nhttps://g.page/r/your-review-link'
      );

    case 'human':
      return sendMessage(phone, ar
        ? '👩‍⚕️ سأقوم بتحويلك إلى أحد موظفينا الآن.\nالرجاء الانتظار قليلاً 🙏'
        : '👩‍⚕️ I will connect you with our staff now.\nPlease hold on 🙏'
      );

    default:
      return sendMessage(phone, ar ? MENU_AR : MENU_EN);
  }
}

module.exports = { handleMessage };
