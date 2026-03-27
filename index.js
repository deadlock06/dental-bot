require('dotenv').config();
const express = require('express');
const app = express();
app.use(express.json());

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
const { getClinic, getAppointmentsForReminder, updateAppointment } = require('./db');
const { sendMessage } = require('./whatsapp');
const { transcribeAudio } = require('./audio');

// ─────────────────────────────────────────────
// Meta webhook verification
// ─────────────────────────────────────────────
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && (token === process.env.VERIFY_TOKEN || token === 'dental123')) {
    console.log('Webhook verified');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ─────────────────────────────────────────────
// Incoming WhatsApp messages
// ─────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Always respond immediately to Meta

  try {
    const body = req.body;
    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    // Skip status updates
    if (value?.statuses) return;

    const message = value?.messages?.[0];
    if (!message) return;

    const patientPhone = message.from;

    // Get the bot's WhatsApp number (the number that received the message)
    const botPhone = value?.metadata?.phone_number_id || process.env.WHATSAPP_PHONE_ID;

    // Look up clinic by bot's WhatsApp phone number ID
    // clinics.whatsapp_number stores the PHONE_NUMBER_ID (not the display number)
    const clinic = await getClinic(botPhone);

    let messageText = null;

    if (message.type === 'text') {
      messageText = message.text.body;
    } else if (message.type === 'audio') {
      // Voice note — transcribe for all clinics
      const mediaId = message.audio?.id;
      if (mediaId) {
        messageText = await transcribeAudio(mediaId);
        console.log(`[Audio] Transcribed: "${messageText}"`);
      }
      if (!messageText) return; // Skip if transcription failed
    } else {
      return; // Skip other message types (images, etc.)
    }

    if (!messageText) return;

    await handleMessage(patientPhone, messageText, clinic);

  } catch (err) {
    console.error('Webhook error:', err.message);
  }
});

// ─────────────────────────────────────────────
// POST /send-reminders — called by cron every 30 min
// ─────────────────────────────────────────────
app.post('/send-reminders', async (req, res) => {
  res.sendStatus(200);

  try {
    const now = new Date();

    // Normalise a date string to YYYY-MM-DD
    function toDateStr(d) {
      return d.toISOString().split('T')[0];
    }

    const todayStr = toDateStr(now);
    const tomorrowStr = toDateStr(new Date(now.getTime() + 86400000));
    const yesterdayStr = toDateStr(new Date(now.getTime() - 86400000));

    const all = await getAppointmentsForReminder(() => true);
    console.log(`[Reminders] Processing ${all.length} appointments`);

    for (const appt of all) {
      // 24h reminder
      if (appt.preferred_date === tomorrowStr && !appt.reminder_sent_24h) {
        const msg24en = `🔔 Appointment Reminder!\nHi ${appt.name}, you have an appointment tomorrow:\n📅 ${appt.preferred_date} at ⏰ ${appt.time_slot}\n🦷 Treatment: ${appt.treatment}\n\nWe'll see you then! If you need to reschedule, reply with 'reschedule' 😊`;
        const msg24ar = `🔔 تذكير بالموعد!\nمرحباً ${appt.name}، لديك موعد غداً:\n📅 ${appt.preferred_date} الساعة ⏰ ${appt.time_slot}\n🦷 العلاج: ${appt.treatment}\n\nنراك قريباً! إذا أردت إعادة الجدولة، أرسل 'إعادة جدولة' 😊`;
        await sendMessage(appt.phone, msg24en); // Default English; extend with patient lang if needed
        await updateAppointment(appt.id, { reminder_sent_24h: true });
        console.log(`[Reminders] 24h sent to ${appt.phone}`);
      }

      // 1h reminder — check time slot is within ~1 hour
      if (appt.preferred_date === todayStr && !appt.reminder_sent_1h) {
        const slotMatch = appt.time_slot?.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (slotMatch) {
          let h = parseInt(slotMatch[1]);
          const m = parseInt(slotMatch[2]);
          const ampm = slotMatch[3].toUpperCase();
          if (ampm === 'PM' && h !== 12) h += 12;
          if (ampm === 'AM' && h === 12) h = 0;
          const slotMs = new Date(now);
          slotMs.setHours(h, m, 0, 0);
          const diffMin = (slotMs - now) / 60000;
          if (diffMin >= 30 && diffMin <= 90) {
            const msg1h = `⏰ Your appointment is in 1 hour!\n📅 Today at ${appt.time_slot}\nWe're looking forward to seeing you! 🦷`;
            await sendMessage(appt.phone, msg1h);
            await updateAppointment(appt.id, { reminder_sent_1h: true });
            console.log(`[Reminders] 1h sent to ${appt.phone}`);
          }
        }
      }

      // Follow-up (day after, status=completed or date=yesterday)
      if (appt.preferred_date === yesterdayStr && !appt.follow_up_sent) {
        // Mark completed + send follow-up
        const reviewLink = 'https://g.page/r/your-review-link'; // Overridden by clinic if available
        const msgFu = `😊 Hi ${appt.name}! How was your visit with us?\nWe hope everything went well!\nIf you have any concerns, feel free to message us.\nWe'd love to hear your feedback:\n⭐ ${reviewLink}`;
        await sendMessage(appt.phone, msgFu);
        await updateAppointment(appt.id, { follow_up_sent: true, status: 'completed' });
        console.log(`[Reminders] Follow-up sent to ${appt.phone}`);
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
      const options = {
        hostname: 'localhost',
        port: process.env.PORT || 3000,
        path: '/send-reminders',
        method: 'POST'
      };
      http.request(options).end();
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
