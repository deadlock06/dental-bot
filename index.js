require('dotenv').config(); // must be first — loads env vars before any module reads them
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet  = require('helmet');
const twilio  = require('twilio');
const { DateTime } = require('luxon');
const path    = require('path');
const session = require('express-session');
const app     = express();

app.use(session({
  secret: process.env.SESSION_SECRET || 'qudozen_secret_123',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production', 
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true
  }
}));

app.use(cookieParser());
app.use(require('morgan')('dev'));

app.use(helmet({
  contentSecurityPolicy: false, // allow external assets/scripts for now
}));
const apiRoutes = require('./api');
app.use('/api', apiRoutes);

const growthRouter = require('./growth/index');
const { handoffLead } = require('./growth/handoff');
const growthSupabase = require('./growth/lib/supabase');
const dashboardApi = require('./dashboard-api');

app.use('/api/dashboard', dashboardApi);

// Stripe Webhook must be handled BEFORE express.json() for raw body access
app.post('/growth/stripe-webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(express.urlencoded({ extended: false })); // Twilio sends URL-encoded bodies

app.use('/growth', express.static(path.join(__dirname, 'growth')));
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
app.use(express.static(path.join(__dirname, 'public')));
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
// Twilio delivery status callbacks
// POST /webhook/status — Twilio fires this for every message status update
// ─────────────────────────────────────────────
app.post('/webhook/status', async (req, res) => {
  res.sendStatus(200);
  try {
    const { MessageSid, MessageStatus, To, ErrorCode, ErrorMessage } = req.body;
    if (!MessageSid) return;
    await growthSupabase.from('message_logs').upsert({
      message_sid:   MessageSid,
      to_phone:      (To || '').replace('whatsapp:', ''),
      status:        MessageStatus || 'unknown',
      error_code:    ErrorCode    || null,
      error_message: ErrorMessage || null,
      updated_at:    new Date().toISOString(),
    }, { onConflict: 'message_sid' });
    if (ErrorCode) {
      console.warn(`[Delivery] ❌ ${MessageSid} failed to ${To}: ${ErrorCode} — ${ErrorMessage}`);
    }
  } catch (e) {
    console.error('[Delivery] /webhook/status error:', e.message);
  }
});

// ─────────────────────────────────────────────
// Incoming WhatsApp messages
// ─────────────────────────────────────────────
// Incoming WhatsApp messages — Secured with Twilio Signature Verification
// ── MessageSid deduplication (prevents Twilio retry double-processing) ──
const _processedSids = new Map(); // sid → timestamp
const SID_TTL_MS = 5 * 60 * 1000; // 5 minutes

app.post('/webhook', twilio.webhook(), async (req, res) => {
  res.status(200).end();

  const fromPhone = req.body.From?.replace('whatsapp:', '') || '';
  const messageTextRaw = req.body.Body || '';
  const messageSid = req.body.MessageSid || '';

  // ── Deduplication: ignore Twilio retries for same MessageSid ──
  if (messageSid) {
    if (_processedSids.has(messageSid)) {
      console.log(`[Webhook] Duplicate SID ${messageSid} — ignoring Twilio retry`);
      return;
    }
    _processedSids.set(messageSid, Date.now());
    // Prune old entries to prevent memory leak
    const cutoff = Date.now() - SID_TTL_MS;
    for (const [sid, ts] of _processedSids) {
      if (ts < cutoff) _processedSids.delete(sid);
    }
  }

  // --- GROWTH SWARM: AUTONOMOUS REPLY CLASSIFIER (PHASE 7) ---
  try {
    const lead = await db.getLeadByPhone(fromPhone);
    if (lead) {
      console.log(`[Growth Swarm] Detected reply from lead ${fromPhone} (status: ${lead.status}). Routing to Classifier.`);
      const classifier = require('./growth/swarm/reply-classifier');
      
      // Safety: Only process if it's actually an outreach reply (e.g. status was 'messaged' or 'sent')
      // and not already opted out.
      if (lead.status !== 'opted_out') {
        await classifier.processInbound(lead.id, lead.business_id, messageTextRaw, fromPhone);
        return; // Stop processing. Do not treat as patient.
      }
    }
  } catch (e) {
    console.error('[Growth Swarm] Classifier Error:', e.message);
  }
  // --- END GROWTH SWARM ROUTING ---

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
    } else if (numMedia > 0) {
      if (!messageText) {
        messageText = '[Media/Unsupported]';
      }
    }

    if (!messageText) {
      console.log('[Webhook] No text and no audio — ignoring');
      return;
    }

    // Strip "whatsapp:+" prefix to get plain digits
    const patientPhone = fromRaw.replace(/^whatsapp:\+/, '');
    console.log(`[Webhook] patientPhone="${patientPhone}" messageText="${messageText}"`);

    // ─── MULTI-TENANT CLINIC ROUTING ───────────────────────────────
    // Resolve clinic from the Twilio "To" field on this message.
    // This supports unlimited clinics on separate Twilio numbers without
    // any env var change. Each number maps to a row in clinics.whatsapp_number.
    const toRaw = body?.To || process.env.WHATSAPP_PHONE_ID || '';
    const botPhone = toRaw.replace(/^whatsapp:/i, '').replace(/^\+/, '');
    const clinic = await getClinic(botPhone);
    console.log(`[Webhook] botPhone="${botPhone}" (from To="${toRaw}") clinic=${clinic ? clinic.name : 'NOT FOUND'}`);
    if (!clinic) {
      console.error(`[Webhook] ⚠️ No clinic found for number "${botPhone}" — add this number to clinics.whatsapp_number in Supabase`);
    }

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
    const now = DateTime.now().setZone('Asia/Riyadh');
    const todayISO = now.toISODate();
    const tomorrowISO = now.plus({ days: 1 }).toISODate();
    const yesterdayISO = now.minus({ days: 1 }).toISODate();

    const { getAppointmentsDueTomorrow, getAppointmentsDueInOneHour, getAppointmentsDueFollowUp } = require('./db');
    
    // Fetch specifically what we need for this run
    const tomorrowLeads  = await getAppointmentsDueTomorrow();
    const oneHourLeads   = await getAppointmentsDueInOneHour();
    const followUpLeads  = await getAppointmentsDueFollowUp();
    
    console.log(`[Reminders] Processing ${tomorrowLeads.length} tomorrows, ${oneHourLeads.length} 1-hour, ${followUpLeads.length} follow-ups (SAR: ${now.toFormat('HH:mm')})`);
    
    const allReminders = [...tomorrowLeads, ...oneHourLeads, ...followUpLeads];

    for (const appt of allReminders) {
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
          ? `🔔 تذكير بالموعد!\nمرحباً ${appt.name}، أنا *جيك*، أذكرك بموعدك غداً:\n📅 ${appt.preferred_date} الساعة ⏰ ${appt.time_slot}\n🏥 ${clinicName}\n🦷 العلاج: ${appt.treatment}\n\nنراك قريباً! إذا أردت إعادة الجدولة، أرسل 'إعادة جدولة' 😊`
          : `🔔 Appointment Reminder!\nHi ${appt.name}, I'm *Jake*. Reminding you of your appointment tomorrow:\n📅 ${appt.preferred_date} at ⏰ ${appt.time_slot}\n🏥 ${clinicName}\n🦷 Treatment: ${appt.treatment}\n\nSee you then! Reply 'reschedule' if you need to change it 😊`;
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
          ? `😊 مرحباً ${appt.name}! أنا *جيك*، كيف كانت زيارتك لنا؟\nنأمل أن كل شيء سار بشكل رائع!\nيسعدنا سماع رأيك:\n⭐ ${reviewLink}\n\nلا تتردد في مراسلتنا في أي وقت 🦷`
          : `😊 Hi ${appt.name}! I'm *Jake*. How was your visit with us?\nWe hope everything went well!\nWe'd love to hear your feedback:\n⭐ ${reviewLink}\n\nFeel free to message us anytime 🦷`;
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
// CRON TASKS MOVED TO worker.js FOR SCALABILITY
// Schedulers are now managed by a dedicated background process.


// ─────────────────────────────────────────────
// Admin Dashboard (Vanilla HTML/JS)
// ─────────────────────────────────────────────
// Middleware for static files
function requireDashboardAuth(req, res, next) {
  if (!req.session.clinicId && !req.path.includes('login')) {
    return res.redirect('/dashboard/login');
  }
  next();
}

app.get('/dashboard/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard', 'login.html'));
});

app.get('/dashboard', (req, res) => {
  if (!req.session.clinicId) return res.redirect('/dashboard/login');
  res.sendFile(path.join(__dirname, 'public', 'dashboard', 'index.html'));
});

// Serve dashboard static assets
app.use('/dashboard', requireDashboardAuth, express.static(path.join(__dirname, 'public', 'dashboard')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Boot] Server listening on 0.0.0.0:${PORT}`);
  console.log('[Monitor] Self-healing monitor active 🛡️');
  console.log('[AI] Custom GPT with function calling enabled 🧠');
  console.log('[WhatsApp] Interactive buttons/lists ready 📱');
});
