require('dotenv').config(); // must be first — loads env vars before any module reads them
const express = require('express');
const path = require('path');
const app = express();
const apiRoutes = require('./api');
app.use('/api', apiRoutes);

const growthRouter = require('./growth/index');
const { handoffLead } = require('./growth/handoff');
const { createClient } = require('@supabase/supabase-js');
const growthSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Stripe Webhook must be handled BEFORE express.json() for raw body access
app.post('/growth/stripe-webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(express.urlencoded({ extended: false })); // Twilio sends URL-encoded bodies

app.use('/growth', growthRouter);

// Global error handlers — prevent crashes
process.on('uncaughtException',  (err) => console.error('[CRASH] uncaughtException:', err));
process.on('unhandledRejection', (err) => console.error('[CRASH] unhandledRejection:', err));
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`[Boot] 🦷 Dental Bot starting — ${new Date().toISOString()}`);
console.log('[Boot] Fixes: slot-409, NL-atomic-lock, save-rollback, no-show, cleanup-cron');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');


// Localtunnel bypass middleware
app.use((req, res, next) => {
  res.setHeader('bypass-tunnel-reminder', 'true');
  next();
});

// Root health check
app.use('/public', express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Full system health check — JSON status of all components
app.get('/health', async (req, res) => {
  try {
    const { healthCheck } = require('./monitor');
    const status = await healthCheck();
    const httpCode = status.status === 'healthy' ? 200 : status.status === 'critical' ? 503 : 200;
    res.status(httpCode).json(status);
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

const { handleMessage } = require('./bot');
const { getClinic, getClinicById, getPatient, getAppointmentsForReminder, updateAppointment } = require('./db');
const { sendMessage } = require('./whatsapp');
const axios = require('axios');
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
  res.status(200).end();

  const fromPhone = req.body.From?.replace('whatsapp:', '') || '';
  const messageTextRaw = req.body.Body || '';
  
  // --- GROWTH SWARM: OPT-OUT DETECTION ---
  const stopKeywords = ['stop', 'unsubscribe', 'توقف', 'إلغاء', 'أرجو التوقف'];
  if (stopKeywords.some(k => messageTextRaw.toLowerCase().includes(k))) {
    console.log(`[Opt-Out] Received STOP from ${fromPhone}. Marking lead as opted_out.`);
    await growthSupabase
      .from('growth_leads_v2')
      .update({ status: 'opted_out' })
      .eq('phone', fromPhone);
    return; // Stop processing totally
  }

  // --- GROWTH SWARM: HANDOFF CHECK ---
  try {
    // Check v2 table by phone
    const { data: growthLead } = await growthSupabase
      .from('growth_leads_v2')
      .select('*')
      .or(`phone.eq.${fromPhone},phone.eq.+${fromPhone.replace(/^\+/, '')}`)
      .eq('status', 'messaged')
      .maybeSingle();

    if (growthLead) {
      console.log(`[Handoff] Match found for ${fromPhone}. Triggering handoff.`);
      const { handoffLead } = require('./growth/handoff');
      await handoffLead(growthLead, messageTextRaw);
      // Wait a moment for patient creation before continuing
      await new Promise(r => setTimeout(r, 500));
    }
  } catch (e) {
    // Not a growth lead or error — continue normally
  }
  // --- END GROWTH SWARM CHECK ---

  try {
    const body = req.body;
    // ... continue with normal billing/message logic
    console.log('[Webhook] Raw body:', JSON.stringify(body));

    const fromRaw          = body?.From; // e.g. "whatsapp:+966572914855"
    const numMedia         = parseInt(body?.NumMedia || '0');
    const mediaUrl         = body?.MediaUrl0;
    const mediaContentType = body?.MediaContentType0 || '';
    let   messageText      = body?.Body;

    console.log(`[Webhook] fromRaw="${fromRaw}" NumMedia=${numMedia} MediaContentType0="${mediaContentType}" MediaUrl0="${mediaUrl}"`);

    if (!fromRaw) {
      console.log('[Webhook] Missing From — ignoring');
      return;
    }

    // Voice note: has media and content type is audio
    if (numMedia > 0 && mediaContentType.startsWith('audio/') && mediaUrl) {
      console.log('[Voice] Detected voice note — transcribing...');
      const transcribed = await transcribeAudio(mediaUrl);
      if (transcribed) {
        console.log('[Voice] Transcription result:', transcribed);
        messageText = transcribed;
      } else {
        console.log('[Voice] Transcription failed — ignoring message');
        return;
      }
    }

    if (!messageText) {
      console.log('[Webhook] No text and no audio — ignoring');
      return;
    }

    // Strip "whatsapp:+" prefix to get plain digits
    const patientPhone = fromRaw.replace(/^whatsapp:\+/, '');
    console.log(`[Webhook] patientPhone="${patientPhone}" messageText="${messageText}"`);

    const botPhoneRaw = process.env.WHATSAPP_PHONE_ID || '';
    const botPhone = botPhoneRaw.replace(/^whatsapp:/i, '').replace(/^\+/, '');
    const clinic   = await getClinic(botPhone);
    console.log(`[Webhook] botPhone="${botPhone}" (raw="${botPhoneRaw}") clinic=${clinic ? clinic.name : 'NOT FOUND'}`);
    if (!clinic) console.error(`[Webhook] ⚠️ Clinic not found for botPhone="${botPhone}" — check WHATSAPP_PHONE_ID env var and clinics.whatsapp_number in DB`);

    await handleMessage(patientPhone, messageText, clinic);

  } catch (err) {
    console.error('[Webhook] Error:', err.message);
    // Log to monitor
    try {
      const { logError } = require('./monitor');
      logError('webhook', err, { phone: req.body?.From });
    } catch (_) {}
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
  console.warn(`[Reminders] ⚠️ parseDateToISO failed for: "${dateStr}" — reminder skipped for this appointment`);
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
      // Phase 2: prefer stored ISO column; fall back to parsing the display string
      const apptDateISO = appt.preferred_date_iso || parseDateToISO(appt.preferred_date);
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

      // ── No-show detection: appointment was today, time has passed 2+ hours, still 'confirmed'
      if (apptDateISO === todayISO && appt.status === 'confirmed') {
        const slotMatchNS = appt.time_slot?.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (slotMatchNS) {
          let hNS = parseInt(slotMatchNS[1]);
          const mNS = parseInt(slotMatchNS[2]);
          const ampmNS = slotMatchNS[3].toUpperCase();
          if (ampmNS === 'PM' && hNS !== 12) hNS += 12;
          if (ampmNS === 'AM' && hNS === 12) hNS = 0;
          const slotTimeNS = new Date(now);
          slotTimeNS.setHours(hNS, mNS, 0, 0);
          const minsOverdue = (now - slotTimeNS) / 60000;
          if (minsOverdue >= 120) { // 2h past slot time
            await updateAppointment(appt.id, { status: 'no-show' });
            console.log(`[Reminders] ⚠️ No-show marked for ${appt.phone} (appt ${appt.id}), ${Math.round(minsOverdue)}min overdue`);
            // Non-blocking: release the slot if doctor-managed
            if (appt.doctor_id && apptDateISO && appt.clinic_id) {
              try {
                const { releaseSlotByPatient } = require('./slots');
                await releaseSlotByPatient(appt.clinic_id, appt.doctor_id, apptDateISO, appt.phone);
                console.log(`[Reminders] Slot released for no-show ${appt.phone}`);
              } catch (slotErr) {
                console.error('[Reminders] Slot release error (no-show):', slotErr.message);
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[Reminders] Error:', err.message);
  }
});


// ─────────────────────────────────────────────
// POST /cleanup-slots — releases past booked slots that have no appointment
// (no-shows, orphaned locks). Called by hourly cron.
// ─────────────────────────────────────────────
app.post('/cleanup-slots', async (req, res) => {
  res.sendStatus(200);
  try {
    const todayISO = new Date().toISOString().split('T')[0];
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;
    // Release all booked slots from dates BEFORE today — they will never be needed again
    const cleanupRes = await axios.patch(
      `${SUPABASE_URL}/rest/v1/doctor_slots?slot_date=lt.${todayISO}&status=eq.booked`,
      { status: 'available', patient_phone: null, appointment_id: null },
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        }
      }
    );
    const released = Array.isArray(cleanupRes.data) ? cleanupRes.data.length : 0;
    if (released > 0) {
      console.log(`[Cleanup] ✅ Released ${released} past booked slot(s) back to available`);
    } else {
      console.log('[Cleanup] No past booked slots to release');
    }
  } catch (e) {
    console.error('[Cleanup] /cleanup-slots error:', e.message);
  }
});

// ─────────────────────────────────────────────
// Cron — every 30 minutes for production reminders
// (Post-booking 1-min reminder is handled by setTimeout in bot.js)
// ─────────────────────────────────────────────
try {
  const cron = require('node-cron');

  // ── Production reminders — every 30 minutes ──
  cron.schedule('*/30 * * * *', async () => {
    console.log('[Cron] Running 30-min reminder check...');
    try {
      await axios.post(`http://localhost:${process.env.PORT || 3000}/send-reminders`);
    } catch (e) {
      console.error('[Cron] Reminder trigger error:', e.message);
    }
  });

  // ── Past slot cleanup — every hour at :00 ──
  cron.schedule('0 * * * *', async () => {
    console.log('[Cron] Running hourly slot cleanup...');
    try {
      await axios.post(`http://localhost:${process.env.PORT || 3000}/cleanup-slots`);
    } catch (e) {
      console.error('[Cron] Cleanup trigger error:', e.message);
    }
  });

  // ── System health check — every 10 minutes ──
  cron.schedule('*/10 * * * *', async () => {
    try {
      const { runPeriodicCheck } = require('./monitor');
      const { getClinic } = require('./db');
      const botPhoneRaw = process.env.WHATSAPP_PHONE_ID || '';
      const botPhone = botPhoneRaw.replace(/^whatsapp:/i, '').replace(/^\+/, '');
      const clinic = await getClinic(botPhone);
      await runPeriodicCheck(clinic?.staff_phone || null);
    } catch (e) {
      console.error('[Cron] Health check error:', e.message);
    }
  });

  // ── Growth follow-ups — daily 9 AM Saudi (6 AM UTC) ──
  cron.schedule('0 6 * * *', async () => {
    console.log('[Cron] Running daily growth follow-ups...');
    try {
      await axios.post(`http://localhost:${process.env.PORT || 3000}/growth/send-followups`);
    } catch (e) {
      console.error('[Cron] Follow-up trigger error:', e.message);
    }
  });

  // ── Job portal scout — every 6 hours ──
  cron.schedule('0 */6 * * *', async () => {
    console.log('[Cron] Running job portal scout (6h)...');
    try {
      const { runAllScouts } = require('./growth/scouts/orchestrator');
      const { createClient } = require('@supabase/supabase-js');
      const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
      const report = await runAllScouts(sb, { scouts: ['indeed', 'job_portals'], autoSend: false });
      console.log(`[Cron] Job scout done: ${report.inserted} new leads`);
    } catch (e) {
      console.error('[Cron] Job scout error:', e.message);
    }
  });

  // ── Google Places scout — weekly Sunday 7 AM Saudi (4 AM UTC) ──
  cron.schedule('0 4 * * 0', async () => {
    console.log('[Cron] Running weekly Google Places scout...');
    try {
      const { runAllScouts } = require('./growth/scouts/orchestrator');
      const { createClient } = require('@supabase/supabase-js');
      const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
      const report = await runAllScouts(sb, { scouts: ['google_places'], autoSend: false });
      console.log(`[Cron] Places scout done: ${report.inserted} new leads`);
    } catch (e) {
      console.error('[Cron] Places scout error:', e.message);
    }
  });

  // ── Auto-batch — daily 10 AM Saudi (7 AM UTC), after scout ──
  cron.schedule('0 7 * * *', async () => {
    console.log('[Cron] Running daily auto-batch send...');
    try {
      const { processBatch } = require('./growth/sender');
      const { createClient } = require('@supabase/supabase-js');
      const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
      const results = await processBatch(10);
      const sent = results.filter(r => r.sent || r.status === 'messaged').length;
      console.log(`[Cron] Auto-batch done: ${sent} messages sent`);
    } catch (e) {
      console.error('[Cron] Auto-batch error:', e.message);
    }
  });

  console.log('[Cron] ✅ All schedulers started: reminders (30m) + cleanup (1h) + health (10m) + follow-ups (daily 9AM) + job scout (6h) + places scout (weekly) + auto-batch (daily 10AM)');
} catch (e) {
  console.log('[Cron] node-cron not available, reminders must be triggered manually');
}

// ─────────────────────────────────────────────
// Admin Dashboard
// ─────────────────────────────────────────────
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard', 'dist')));
app.get('/dashboard/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard', 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('[Monitor] Self-healing monitor active 🛡️');
  console.log('[AI] Custom GPT with function calling enabled 🧠');
  console.log('[WhatsApp] Interactive buttons/lists ready 📱');
});
