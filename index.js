require('dotenv').config();
const express = require('express');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // Twilio sends URL-encoded bodies

// Global error handlers — prevent crashes
process.on('uncaughtException',  (err) => console.error('[CRASH] uncaughtException:', err));
process.on('unhandledRejection', (err) => console.error('[CRASH] unhandledRejection:', err));

// Localtunnel bypass middleware
app.use((req, res, next) => {
  res.setHeader('bypass-tunnel-reminder', 'true');
  next();
});

// Root health check
app.get('/', (req, res) => {
  res.send('Dental Bot is running 🦷');
});

const { handleMessage } = require('./bot');
const { getClinic, getClinicById, getPatient, getAppointmentsForReminder, updateAppointment } = require('./db');
const { sendMessage } = require('./whatsapp');
const { transcribeAudio } = require('./audio');

// ─────────────────────────────────────────────
// Twilio webhook verification (simple 200 OK)
// ─────────────────────────────────────────────
app.get('/webhook', (req, res) => {
  res.sendStatus(200);
});

// ─────────────────────────────────────────────
// Incoming WhatsApp messages
// ─────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  // Send empty 200 — res.sendStatus(200) sends "OK" as body which Twilio forwards as a message
  res.status(200).end();

  try {
    const body = req.body;
    console.log('[Webhook] Raw body:', JSON.stringify(body));

    // Twilio sends: body.Body (text), body.From (whatsapp:+<phone>)
    const messageText = body?.Body;
    const fromRaw     = body?.From; // e.g. "whatsapp:+966572914855"

    console.log(`[Webhook] messageText="${messageText}" fromRaw="${fromRaw}"`);

    if (!messageText || !fromRaw) {
      console.log('[Webhook] Missing Body or From — ignoring');
      return;
    }

    // Strip "whatsapp:+" prefix to get plain digits
    const patientPhone = fromRaw.replace(/^whatsapp:\+/, '');
    console.log(`[Webhook] patientPhone="${patientPhone}"`);

    const botPhone = process.env.WHATSAPP_PHONE_ID;
    const clinic   = await getClinic(botPhone);
    console.log(`[Webhook] botPhone="${botPhone}" clinic=${clinic ? clinic.name : 'NOT FOUND'}`);

    await handleMessage(patientPhone, messageText, clinic);

  } catch (err) {
    console.error('[Webhook] Error:', err.message);
  }
});

// ─────────────────────────────────────────────
// POST /send-reminders — called by cron every 30 min
// ─────────────────────────────────────────────

// Parse a stored preferred_date string to YYYY-MM-DD for comparison.
// Stored format examples: "April 20, 2026" | "Monday April 21, 2026" | "April 18"
function parseDateToISO(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      // If no year was stored (e.g. "April 18"), new Date assumes current year — that's fine
      return d.toISOString().split('T')[0];
    }
  } catch (e) { /* fall through */ }
  return null;
}

app.post('/send-reminders', async (req, res) => {
  res.sendStatus(200);

  try {
    const now          = new Date();
    const todayISO     = now.toISOString().split('T')[0];
    const tomorrowISO  = new Date(now.getTime() + 86400000).toISOString().split('T')[0];
    const yesterdayISO = new Date(now.getTime() - 86400000).toISOString().split('T')[0];

    const all = await getAppointmentsForReminder(() => true);
    console.log(`[Reminders] Processing ${all.length} appointments`);

    for (const appt of all) {
      const apptDateISO = parseDateToISO(appt.preferred_date);
      if (!apptDateISO) {
        console.log(`[Reminders] Skipping appt ${appt.id} — unparseable date: "${appt.preferred_date}"`);
        continue;
      }

      // Fetch patient language (best-effort — default English on failure)
      const patient = await getPatient(appt.phone);
      const ar = patient?.language === 'ar';

      // Fetch clinic for review link (best-effort)
      const clinic = appt.clinic_id ? await getClinicById(appt.clinic_id) : null;
      const reviewLink = clinic?.review_link || 'https://g.page/r/your-review-link';
      const clinicName = clinic?.name || 'our clinic';

      // ── 24h reminder
      if (apptDateISO === tomorrowISO && !appt.reminder_sent_24h) {
        const msg = ar
          ? `🔔 تذكير بالموعد!\nمرحباً ${appt.name}، لديك موعد غداً:\n📅 ${appt.preferred_date} الساعة ⏰ ${appt.time_slot}\n🏥 ${clinicName}\n🦷 العلاج: ${appt.treatment}\n\nنراك قريباً! إذا أردت إعادة الجدولة، أرسل 'إعادة جدولة' 😊`
          : `🔔 Appointment Reminder!\nHi ${appt.name}, you have an appointment tomorrow:\n📅 ${appt.preferred_date} at ⏰ ${appt.time_slot}\n🏥 ${clinicName}\n🦷 Treatment: ${appt.treatment}\n\nSee you then! Reply 'reschedule' if you need to change it 😊`;
        await sendMessage(appt.phone, msg);
        await updateAppointment(appt.id, { reminder_sent_24h: true });
        console.log(`[Reminders] 24h sent to ${appt.phone} (${ar ? 'AR' : 'EN'})`);
      }

      // ── 1h reminder
      if (apptDateISO === todayISO && !appt.reminder_sent_1h) {
        const slotMatch = appt.time_slot?.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (slotMatch) {
          let h = parseInt(slotMatch[1]);
          const m = parseInt(slotMatch[2]);
          const ampm = slotMatch[3].toUpperCase();
          if (ampm === 'PM' && h !== 12) h += 12;
          if (ampm === 'AM' && h === 12) h = 0;
          const slotTime = new Date(now);
          slotTime.setHours(h, m, 0, 0);
          const diffMin = (slotTime - now) / 60000;
          if (diffMin >= 30 && diffMin <= 90) {
            const msg = ar
              ? `⏰ موعدك بعد ساعة واحدة!\n📅 اليوم الساعة ${appt.time_slot}\n🏥 ${clinicName}\nنتطلع لرؤيتك! 🦷`
              : `⏰ Your appointment is in 1 hour!\n📅 Today at ${appt.time_slot}\n🏥 ${clinicName}\nWe're looking forward to seeing you! 🦷`;
            await sendMessage(appt.phone, msg);
            await updateAppointment(appt.id, { reminder_sent_1h: true });
            console.log(`[Reminders] 1h sent to ${appt.phone} (${ar ? 'AR' : 'EN'})`);
          }
        }
      }

      // ── Follow-up (day after appointment)
      if (apptDateISO === yesterdayISO && !appt.follow_up_sent) {
        const msg = ar
          ? `😊 مرحباً ${appt.name}! كيف كانت زيارتك لنا؟\nنأمل أن كل شيء سار بشكل رائع!\nيسعدنا سماع رأيك:\n⭐ ${reviewLink}\n\nلا تتردد في مراسلتنا في أي وقت 🦷`
          : `😊 Hi ${appt.name}! How was your visit with us?\nWe hope everything went well!\nWe'd love to hear your feedback:\n⭐ ${reviewLink}\n\nFeel free to message us anytime 🦷`;
        await sendMessage(appt.phone, msg);
        await updateAppointment(appt.id, { follow_up_sent: true, status: 'completed' });
        console.log(`[Reminders] Follow-up sent to ${appt.phone} (${ar ? 'AR' : 'EN'})`);
      }
    }
  } catch (err) {
    console.error('[Reminders] Error:', err.message);
  }
});

// ─────────────────────────────────────────────
// Cron — every 30 minutes
// ─────────────────────────────────────────────
try {
  const cron = require('node-cron');
  cron.schedule('*/30 * * * *', async () => {
    console.log('[Cron] Running reminders...');
    try {
      const http = require('http');
      http.request({
        hostname: 'localhost',
        port: process.env.PORT || 3000,
        path: '/send-reminders',
        method: 'POST'
      }).end();
    } catch (e) {
      console.error('[Cron] Error triggering reminders:', e.message);
    }
  });
  console.log('[Cron] Reminder scheduler started');
} catch (e) {
  console.log('[Cron] node-cron not available, reminders must be triggered manually');
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
