const twilio = require('twilio');

async function sendMessage(to, text) {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken  = process.env.TWILIO_AUTH_TOKEN;
    const from       = process.env.TWILIO_WHATSAPP_FROM;

    const { wrapTwilio } = require('./lib/resilience');
    const client = twilio(accountSid, authToken);
    await wrapTwilio(async () => {
      return await client.messages.create({
        from: from,
        to:   `whatsapp:+${to}`,
        body: text
      });
    });
  } catch (err) {
    console.error('sendMessage error:', err.message);
  }
}

// ─────────────────────────────────────────────
// Interactive list message (tap-to-select menus)
// Falls back to plain sendMessage if Twilio rejects it.
// sections format: [{ title, rows: [{ id, title, description }] }]
// ─────────────────────────────────────────────
async function sendInteractiveList(to, header, body, buttonText, sections, fallbackText) {
  console.log('[WhatsApp] Sending interactive menu to:', to);
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken  = process.env.TWILIO_AUTH_TOKEN;
    const from       = process.env.TWILIO_WHATSAPP_FROM;
    console.log('[WhatsApp] TWILIO_WHATSAPP_FROM:', from || 'MISSING');

    const client = twilio(accountSid, authToken);

    // Build plain-text menu (Twilio sandbox doesn't support interactive lists)
    let text = `*${header}*\n\n${body}\n`;
    let idx = 1;
    for (const section of sections) {
      text += `\n*${section.title}*\n`;
      for (const row of section.rows) {
        text += `${idx}. ${row.title}\n`;
        idx++;
      }
    }
    text += '\nReply with a number to choose.';

    const { wrapTwilio } = require('./lib/resilience');
    await wrapTwilio(async () => {
      return await client.messages.create({ from, to: `whatsapp:+${to}`, body: text });
    });
  } catch (err) {
    console.error('[WhatsApp] sendInteractiveList error:', err.message);
    // Fallback to plain text
    if (fallbackText) {
      await sendMessage(to, fallbackText);
    }
  }
}

// ─────────────────────────────────────────────
// industry Icons Helper
// ─────────────────────────────────────────────
function getindustryIcon(industry) {
  const icons = {
    dental:      '🦷',
    physio:      '🧘',
    dermatology: '🧴',
    cosmetic:    '✨',
    general:     '🩺',
    orthopedic:  '🦴',
    pediatric:   '👶'
  };
  return icons[industry] || '🩺';
}

// ─────────────────────────────────────────────
// Main menu interactive sections (EN)
// ─────────────────────────────────────────────
function getMenuSectionsEN(industry = 'dental') {
  const vIcon = getindustryIcon(industry);
  return [
    {
      title: 'Appointments',
      rows: [
        { id: '1', title: 'Book Appointment 📅',  description: 'Schedule a new visit' },
        { id: '2', title: 'My Appointment 📋',    description: 'View my booking' },
        { id: '3', title: 'Reschedule 🔄',        description: 'Change appointment time' },
        { id: '4', title: 'Cancel ❌',            description: 'Cancel my appointment' }
      ]
    },
    {
      title: 'Information',
      rows: [
        { id: '5',  title: `Our Services ${vIcon}`, description: 'View treatments' },
        { id: '6',  title: 'Our Doctors 👨‍⚕️',        description: 'Meet our team' },
        { id: '7',  title: 'Prices 💰',               description: 'View price list' },
        { id: '8',  title: 'Location 📍',             description: 'Find us on maps' },
        { id: '9',  title: 'Leave Review ⭐',         description: 'Share your experience' },
        { id: '10', title: 'Talk to Staff 👩‍⚕️',       description: 'Speak to a person' }
      ]
    }
  ];
}

// ─────────────────────────────────────────────
// Main menu interactive sections (AR)
// ─────────────────────────────────────────────
function getMenuSectionsAR(industry = 'dental') {
  const vIcon = getindustryIcon(industry);
  return [
    {
      title: 'المواعيد',
      rows: [
        { id: '1', title: 'حجز موعد 📅',       description: 'احجز زيارة جديدة' },
        { id: '2', title: 'موعدي الحالي 📋',    description: 'عرض حجزي' },
        { id: '3', title: 'إعادة جدولة 🔄',    description: 'تغيير وقت الموعد' },
        { id: '4', title: 'إلغاء الموعد ❌',   description: 'إلغاء موعدي' }
      ]
    },
    {
      title: 'المعلومات',
      rows: [
        { id: '5',  title: `خدماتنا ${vIcon}`,      description: 'عرض العلاجات' },
        { id: '6',  title: 'أطباؤنا 👨‍⚕️',             description: 'تعرف على فريقنا' },
        { id: '7',  title: 'الأسعار 💰',              description: 'قائمة الأسعار' },
        { id: '8',  title: 'الموقع 📍',               description: 'جدنا على الخريطة' },
        { id: '9',  title: 'تقييم العيادة ⭐',        description: 'شارك تجربتك' },
        { id: '10', title: 'التحدث مع الفريق 👩‍⚕️',   description: 'تحدث مع موظف' }
      ]
    }
  ];
}

// ─────────────────────────────────────────────
// Send the main menu as an interactive list
// Falls back to plain text on failure.
// ─────────────────────────────────────────────
async function sendMainMenu(to, clinicName, ar, plainTextFallback, industry = 'dental') {
  const vIcon = getindustryIcon(industry);
  if (ar) {
    await sendInteractiveList(
      to,
      `أهلاً في ${clinicName}! ${vIcon}`,
      'كيف يمكنني مساعدتك اليوم؟',
      'اختر خدمة',
      getMenuSectionsAR(industry),
      plainTextFallback
    );
  } else {
    await sendInteractiveList(
      to,
      `Welcome to ${clinicName}! ${vIcon}`,
      `I'm your AI autonomous assistant. How can I help you today?`,
      'Choose an option',
      getMenuSectionsEN(industry),
      plainTextFallback
    );
  }
}

// ─────────────────────────────────────────────
// Doctor selection interactive list
// doctors: [{ id, name, name_ar, degree, degree_ar, specialization, specialization_ar, available, available_ar }]
// ─────────────────────────────────────────────
async function sendDoctorMenu(to, ar, doctors, plainTextFallback, industry = 'dental') {
  const rows = doctors.map((doc, i) => ({
    id:          String(i + 1),
    title:       ar ? `د. ${doc.name_ar || doc.name}` : `Dr. ${doc.name}`,
    description: ar
      ? `${doc.specialization_ar || doc.specialization} — ${doc.available_ar || doc.available}`
      : `${doc.specialization} — ${doc.available}`
  }));
  // Add "no preference" option
  rows.push({
    id:          '0',
    title:       ar ? 'بدون تفضيل' : 'No preference',
    description: ar ? 'أي طبيب متاح' : 'Any available doctor'
  });

  const teamTitle = {
    dental:      { ar: 'فريقنا الطبي', en: 'Our Dental Team' },
    physio:      { ar: 'طاقم العلاج الطبيعي', en: 'Our Physio Team' },
    dermatology: { ar: 'أطباؤنا المختصون', en: 'Our Specialists' },
    general:     { ar: 'فريقنا الطبي', en: 'Our Medical Team' }
  };
  const titleSet = teamTitle[industry] || teamTitle.general;

  await sendInteractiveList(
    to,
    ar ? '👨‍⚕️ اختر طبيبك' : '👨‍⚕️ Choose Your Doctor',
    ar ? 'اضغط لاختيار طبيب أو تابع بدون تفضيل' : 'Tap to select a doctor or continue without preference',
    ar ? 'اختر' : 'Select',
    [{ title: ar ? titleSet.ar : titleSet.en, rows }],
    plainTextFallback
  );
}

// ─────────────────────────────────────────────
// Treatment selection interactive list
// ─────────────────────────────────────────────
async function sendTreatmentMenu(to, ar, plainTextFallback, industry = 'dental', customServices = []) {
  const vIcon = getindustryIcon(industry);
  
  // 1. Use custom services if provided (from clinics.services JSONB)
  let rows = [];
  if (Array.isArray(customServices) && customServices.length > 0) {
    rows = customServices.map((s, i) => ({
      id:          String(i + 1),
      title:       ar ? (s.name_ar || s.name) : (s.name || s.name_ar),
      description: ar ? (s.desc_ar || s.desc || '') : (s.desc || s.desc_ar || '')
    }));
  } else {
    // 2. Fallback to industry defaults
    const defaults = {
      dental: ar
        ? [
            { id: '1', title: 'تنظيف وتلميع 🦷',       description: 'إزالة الجير والتلميع' },
            { id: '2', title: 'حشوات',                  description: 'علاج التسوس' },
            { id: '3', title: 'تقويم الأسنان 📐',       description: 'تقويم وتصحيح الأسنان' },
            { id: '4', title: 'تبييض الأسنان ⚪',        description: 'تفتيح لون الأسنان' },
            { id: '5', title: 'خلع',                    description: 'خلع سن' },
            { id: '6', title: 'زراعة أسنان 🔬',         description: 'زراعة سن جذري' },
            { id: '7', title: 'علاج العصب 🏥',          description: 'علاج قناة الجذر' },
            { id: '8', title: 'أخرى / غير متأكد',       description: 'استشارة أو علاج آخر' }
          ]
        : [
            { id: '1', title: 'Cleaning & Polishing 🦷', description: 'Scaling and polishing' },
            { id: '2', title: 'Fillings',                description: 'Cavity treatment' },
            { id: '3', title: 'Braces & Orthodontics 📐',description: 'Teeth straightening' },
            { id: '4', title: 'Teeth Whitening ⚪',      description: 'Brighten your smile' },
            { id: '5', title: 'Extraction',              description: 'Tooth removal' },
            { id: '6', title: 'Dental Implants 🔬',     description: 'Permanent tooth replacement' },
            { id: '7', title: 'Root Canal 🏥',           description: 'Root canal treatment' },
            { id: '8', title: 'Other / Not sure',        description: 'Consultation or other' }
          ],
      physio: ar
        ? [
            { id: '1', title: 'تقييم أولي 📋',           description: 'فحص وتشخيص أولي' },
            { id: '2', title: 'علاج يدوي 💆',             description: 'مساج طبي وتحريك مفاصل' },
            { id: '3', title: 'إبر جافة 📍',              description: 'علاج نقاط الألم' },
            { id: '4', title: 'تأهيل إصابات 🏃',          description: 'إصابات ملاعب ورباط صليبي' },
            { id: '5', title: 'علاج طبيعي منزلي 🏠',      description: 'زيارة منزلية' }
          ]
        : [
            { id: '1', title: 'Initial Assessment 📋',   description: 'Diagnosis and plan' },
            { id: '2', title: 'Manual Therapy 💆',       description: 'Massage and manipulation' },
            { id: '3', title: 'Dry Needling 📍',         description: 'Trigger point therapy' },
            { id: '4', title: 'Injury Rehab 🏃',         description: 'Sports and post-op' },
            { id: '5', title: 'Home Physio 🏠',          description: 'At-home therapy visit' }
          ]
    };
    rows = defaults[industry] || defaults.dental;
  }

  await sendInteractiveList(
    to,
    ar ? `${vIcon} نوع الخدمة` : `${vIcon} Service Type`,
    ar ? 'ما الذي يمكننا مساعدتك به؟' : 'How can we help you today?',
    ar ? 'اختر الخدمة' : 'Select service',
    [{ title: ar ? 'الخدمات' : 'Services', rows }],
    plainTextFallback
  );
}

// ─────────────────────────────────────────────
// Time slot selection interactive list
// slots: [{ id (1-based), label }] or use default 8 fixed slots
// ─────────────────────────────────────────────
async function sendTimeSlotMenu(to, ar, slots, header, plainTextFallback) {
  const rows = slots.map((s, i) => ({
    id:          String(i + 1),
    title:       s.label,
    description: ''
  }));

  await sendInteractiveList(
    to,
    header || (ar ? '⏰ اختر الوقت' : '⏰ Choose a Time'),
    ar ? 'اختر الوقت المناسب لك:' : 'Select your preferred time:',
    ar ? 'اختر وقتاً' : 'Select time',
    [{ title: ar ? 'الأوقات المتاحة' : 'Available Times', rows }],
    plainTextFallback
  );
}

// ─────────────────────────────────────────────
// Quick-reply buttons (up to 3 buttons)
// buttons: [{ id, title }]
// ─────────────────────────────────────────────
async function sendButtonMessage(to, body, buttons, fallbackText) {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken  = process.env.TWILIO_AUTH_TOKEN;
    const from       = process.env.TWILIO_WHATSAPP_FROM;

    const client = twilio(accountSid, authToken);

    // Plain-text button fallback for Twilio sandbox
    let text = `${body}\n`;
    buttons.forEach((b, i) => { text += `\n${i + 1}. ${b.title}`; });
    text += '\n\nReply with a number to choose.';
    const { wrapTwilio } = require('./lib/resilience');
    await wrapTwilio(async () => {
      return await client.messages.create({ from, to: `whatsapp:+${to}`, body: text });
    });
  } catch (err) {
    console.error('[WhatsApp] sendButtonMessage error:', err.message);
    if (fallbackText) {
      await sendMessage(to, fallbackText);
    }
  }
}

module.exports = {
  sendMessage,
  sendInteractiveList,
  sendMainMenu,
  sendDoctorMenu,
  sendTreatmentMenu,
  sendTimeSlotMenu,
  sendButtonMessage
};
