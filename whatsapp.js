const twilio = require('twilio');

async function sendMessage(to, text) {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken  = process.env.TWILIO_AUTH_TOKEN;
    const from       = process.env.TWILIO_WHATSAPP_FROM;

    const client = twilio(accountSid, authToken);
    await client.messages.create({
      from: from,
      to:   `whatsapp:+${to}`,
      body: text
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

    await client.messages.create({ from, to: `whatsapp:+${to}`, body: text });
  } catch (err) {
    console.error('[WhatsApp] sendInteractiveList error:', err.message);
    // Fallback to plain text
    if (fallbackText) {
      await sendMessage(to, fallbackText);
    }
  }
}

// ─────────────────────────────────────────────
// Main menu interactive sections (EN)
// ─────────────────────────────────────────────
const MENU_SECTIONS_EN = [
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
      { id: '5',  title: 'Our Services 🦷',    description: 'View treatments' },
      { id: '6',  title: 'Our Doctors 👨‍⚕️',    description: 'Meet our team' },
      { id: '7',  title: 'Prices 💰',           description: 'View price list' },
      { id: '8',  title: 'Location 📍',         description: 'Find us on maps' },
      { id: '9',  title: 'Leave Review ⭐',     description: 'Share your experience' },
      { id: '10', title: 'Talk to Staff 👩‍⚕️',   description: 'Speak to a person' }
    ]
  }
];

// ─────────────────────────────────────────────
// Main menu interactive sections (AR)
// ─────────────────────────────────────────────
const MENU_SECTIONS_AR = [
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
      { id: '5',  title: 'خدماتنا 🦷',           description: 'عرض العلاجات' },
      { id: '6',  title: 'أطباؤنا 👨‍⚕️',           description: 'تعرف على فريقنا' },
      { id: '7',  title: 'الأسعار 💰',            description: 'قائمة الأسعار' },
      { id: '8',  title: 'الموقع 📍',             description: 'جدنا على الخريطة' },
      { id: '9',  title: 'تقييم العيادة ⭐',      description: 'شارك تجربتك' },
      { id: '10', title: 'التحدث مع الفريق 👩‍⚕️', description: 'تحدث مع موظف' }
    ]
  }
];

// ─────────────────────────────────────────────
// Send the main menu as an interactive list
// Falls back to plain text on failure.
// ─────────────────────────────────────────────
async function sendMainMenu(to, clinicName, ar, plainTextFallback) {
  if (ar) {
    await sendInteractiveList(
      to,
      `أهلاً في ${clinicName}! 🦷`,
      'كيف يمكنني مساعدتك اليوم؟',
      'اختر خدمة',
      MENU_SECTIONS_AR,
      plainTextFallback
    );
  } else {
    await sendInteractiveList(
      to,
      `Welcome to ${clinicName}! 🦷`,
      "I'm your AI dental assistant. How can I help you today?",
      'Choose an option',
      MENU_SECTIONS_EN,
      plainTextFallback
    );
  }
}

// ─────────────────────────────────────────────
// Doctor selection interactive list
// doctors: [{ id, name, name_ar, degree, degree_ar, specialization, specialization_ar, available, available_ar }]
// ─────────────────────────────────────────────
async function sendDoctorMenu(to, ar, doctors, plainTextFallback) {
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

  await sendInteractiveList(
    to,
    ar ? '👨‍⚕️ اختر طبيبك' : '👨‍⚕️ Choose Your Doctor',
    ar ? 'اضغط لاختيار طبيب أو تابع بدون تفضيل' : 'Tap to select a doctor or continue without preference',
    ar ? 'اختر' : 'Select',
    [{ title: ar ? 'فريقنا الطبي' : 'Our Dental Team', rows }],
    plainTextFallback
  );
}

// ─────────────────────────────────────────────
// Treatment selection interactive list
// ─────────────────────────────────────────────
async function sendTreatmentMenu(to, ar, plainTextFallback) {
  const rows = ar
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
      ];

  await sendInteractiveList(
    to,
    ar ? '🦷 نوع العلاج' : '🦷 Treatment Type',
    ar ? 'ما نوع العلاج الذي تحتاجه؟' : 'What type of treatment do you need?',
    ar ? 'اختر العلاج' : 'Select treatment',
    [{ title: ar ? 'العلاجات' : 'Treatments', rows }],
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
    await client.messages.create({ from, to: `whatsapp:+${to}`, body: text });
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
