require('dotenv').config(); // must be first — loads env vars before any module reads them
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet  = require('helmet');
const twilio  = require('twilio');
const { DateTime } = require('luxon');
const path    = require('path');
const session = require('express-session');
const app     = express();
const dentalConfig = require('./verticals/dental.json');

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
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/api', apiRoutes);

// Expose verticals configs
app.use('/config/verticals', express.static(path.join(__dirname, 'verticals')));

const growthRouter = require('./growth/index');
const { handoffLead } = require('./growth/handoff');
const growthSupabase = require('./growth/lib/supabase');
const dashboardApi = require('./dashboard-api');

app.use('/api/dashboard', dashboardApi);

const { generatePassword } = require('./utils/encrypt.js');
const db = require('./db.js');

// ─── WEB CHAT API ───

// Start trial from embedded chat
app.post('/api/start-trial', async (req, res) => {
  const { clinic_name, session_id, lang } = req.body;
  
  if (!clinic_name || !session_id) {
    return res.status(400).json({ 
      success: false, 
      error: 'MISSING_FIELDS' 
    });
  }

  let attempts = 0;
  let trial = null;
  let finalUsername = null;
  let plainPassword = generatePassword(12);

  while (attempts < 5 && !trial) {
    try {
      // Generate credentials (ensuring uniqueness)
      const cleanName = clinic_name.toLowerCase().replace(/[^a-z0-9]/g, '');
      // Use different parts of session_id or random for retries
      const salt = attempts === 0 ? session_id.substring(session_id.length - 4) : Math.random().toString(36).substring(2, 6);
      finalUsername = `admin@${cleanName}${salt}.qd`;
      
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash(plainPassword, 10);

      // Create trial record in database (Mandatory - No silent failure)
      trial = await db.createTrial({
        clinic_name,
        username: finalUsername,
        password: hashedPassword, // Store hashed
        session_id,
        lang: lang || 'en',
        status: 'active',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      });
    } catch (e) {
      // Check for PostgreSQL unique violation (23505)
      const isUniqueError = e.response?.data?.code === '23505' || e.message?.includes('23505') || e.response?.data?.message?.includes('duplicate');
      if (isUniqueError) {
        attempts++;
        console.warn(`[Trial] Username collision for ${finalUsername}, retry ${attempts}/5`);
        continue;
      }
      throw e; // Rethrow real errors
    }
  }

  if (!trial) throw new Error('COULD_NOT_GENERATE_UNIQUE_USERNAME');

  try {
    const trialId = trial.id;
    await db.logEvent('trial_created', session_id, { clinic_name, trial_id: trialId });

    // Trigger Day 0 onboarding sequence
    const onboarding = require('./growth/onboarding-state-machine.js');
    await onboarding.startFromWebChat({
      clinic_name,
      username: finalUsername,
      password: plainPassword,
      trial_id: trialId,
      lang: lang || 'en'
    });

    // Sanitized Logging (P1)
    const logData = { success: true, username: finalUsername, trial_id: trialId, password: '[REDACTED]' };
    console.log('[Trial] Success:', JSON.stringify(logData));

    res.json({
      success: true,
      username: finalUsername,
      password: plainPassword, // Return plain to user
      dashboard_url: 'https://qudozen.com/dashboard',
      trial_id: trialId,
      expires_in: '7 days'
    });

  } catch (e) {
    console.error('Trial activation failed:', e);
    res.status(500).json({ 
      success: false, 
      error: 'ACTIVATION_FAILED',
      message: e.message 
    });
  }
});

// Analytics endpoint
app.post('/api/analytics', async (req, res) => {
  const { event, session_id, metadata } = req.body;
  await db.logEvent(event, session_id, metadata);
  res.json({ success: true });
});

// Admin: Expire trials
app.post('/api/admin/expire-trials', async (req, res) => {
  // Simple key check
  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) return res.status(401).send();
  
  try {
    const now = new Date().toISOString();
    // 1. Find trials that have expired but are still 'active'
    // This logic is simplified for Supabase REST - ideally done via RPC or server-side loop
    const { data: expired } = await axios.get(
      `${process.env.SUPABASE_URL}/rest/v1/trials?status=eq.active&expires_at=lt.${now}&select=id,clinic_name`,
      { headers: { apikey: process.env.SUPABASE_KEY, Authorization: `Bearer ${process.env.SUPABASE_KEY}` } }
    );

    if (expired && expired.length > 0) {
      for (const t of expired) {
        await axios.patch(
          `${process.env.SUPABASE_URL}/rest/v1/trials?id=eq.${t.id}`,
          { status: 'expired' },
          { headers: { apikey: process.env.SUPABASE_KEY, Authorization: `Bearer ${process.env.SUPABASE_KEY}` } }
        );
        await db.logEvent('trial_expired', t.id, { clinic_name: t.clinic_name });
        console.log(`[Admin] Expired trial for ${t.clinic_name}`);
      }
    }
    res.json({ success: true, count: expired?.length || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// General chat handler (Unified Logic)
app.post('/api/chat', async (req, res) => {
  const { message, session_id, clinic, lang } = req.body;
  
  if (!message || !session_id) {
    return res.status(400).json({ error: 'MISSING_DATA' });
  }

  const phone = `web_${session_id}`;
  const bot = require('./bot.js');
  const whatsapp = require('./whatsapp.js');

  try {
    // Analytics: pricing requested
    if (message.toLowerCase().includes('price') || message.toLowerCase().includes('pricing')) {
      await db.logEvent('pricing_requested', session_id, { message });
    }

    // 1. Process message through production bot logic (as Qudozen SaaS vertical)

    await bot.handleMessage(phone, message, { name: 'Qudozen', vertical: 'saas' });


    // 2. Fetch the responses that were intercepted by the web-aware whatsapp module
    const responses = whatsapp.getWebResponses(phone);

    // 3. Return ALL intercepted messages
    if (responses.length > 0) {
      const formatted = responses.map(m => {
        if (m.type === 'interactive' && m.buttons) {
          return { ...m, buttons: m.buttons.map(b => ({ text: b.text, action: b.id })) };
        }
        return m;
      });
      res.json({ messages: formatted });
    } else {
      res.json({ messages: [{ type: 'text', content: lang === 'ar' ? 'سأرد عليك قريباً!' : 'I will respond soon!' }] });
    }

  } catch (e) {
    console.error('Unified Chat Error:', e);
    res.status(500).json({ error: 'BOT_ERROR', message: e.message });
  }
});


// ─────────────────────────────────────────────
// Stripe — checkout creation (public) + webhook
// ─────────────────────────────────────────────
const { createCheckoutSession } = require('./api/stripe-checkout.js');

let _stripe;
function getStripe() {
  if (!_stripe) _stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}
// POST /api/create-checkout — generates a personalised Stripe Checkout URL
app.post('/api/create-checkout', express.json(), async (req, res) => {
  const { clinic_name, email, plan, lang } = req.body;
  try {
    const session = await createCheckoutSession(
      clinic_name || 'Your Clinic',
      email || `guest@onboarding.qudozen.com`,
      plan || 'system',
      lang || 'en'
    );
    res.json({ url: session.url, session_id: session.session_id });
  } catch (e) {
    console.error('[Stripe] Checkout creation failed:', e);
    res.status(500).json({ error: 'CHECKOUT_FAILED', message: e.message });
  }
});

// POST /api/support-request — creates a bot-handled support ticket
app.post('/api/support-request', express.json(), async (req, res) => {
  const { phone, issue } = req.body;
  try {
    const growthDb = require('./growth/lib/supabase');
    await growthDb.from('support_requests').insert({
      phone: phone || 'unknown',
      issue: issue || 'general',
      created_at: new Date().toISOString(),
      resolved: false
    });
    console.log(`[Support] Ticket created for ${phone}: ${issue}`);
  } catch (e) {
    console.error('[Support] Ticket creation failed:', e.message);
  }
  res.json({ received: true });
});

// POST /webhook/stripe — Stripe fires this on successful payment
// Must be raw body BEFORE express.json() middleware
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = getStripe().webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    console.error('[Stripe Webhook] Signature verification failed:', e.message);
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { clinic_name, plan, lang } = session.metadata || {};
    const customerEmail = session.customer_email || session.customer_details?.email;

    console.log(`[Stripe Webhook] ✅ Payment confirmed — ${clinic_name} (${plan})`);

    try {
      const onboarding = require('./growth/onboarding-state-machine.js');
      await onboarding.startFromPayment({
        clinic_name: clinic_name || 'Unknown Clinic',
        email: customerEmail,
        owner_phone: session.customer_details?.phone?.replace('+', ''),
        plan: plan || 'system',
        lang: lang || 'en',
        stripe_customer_id: session.customer,
        stripe_subscription_id: session.subscription
      });
    } catch (e) {
      console.error('[Stripe Webhook] Onboarding trigger failed:', e.message);
    }
  }

  res.json({ received: true });
});

// Legacy growth webhook placeholder (kept for backward-compat)
app.post('/growth/stripe-webhook', express.raw({ type: 'application/json' }));



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
        const template = ar ? dentalConfig.messages.reminders['24h'].ar : dentalConfig.messages.reminders['24h'].en;
        const msg = template
          .replace('{name}', appt.name)
          .replace('{date}', appt.preferred_date)
          .replace('{slot}', appt.time_slot)
          .replace('{clinic}', clinicName)
          .replace('{treatment}', appt.treatment);
          
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
            const template = ar ? dentalConfig.messages.reminders['1h'].ar : dentalConfig.messages.reminders['1h'].en;
            const msg = template
              .replace('{slot}', appt.time_slot)
              .replace('{clinic}', clinicName);
              
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
    const todayISO = DateTime.now().setZone('Asia/Riyadh').toISODate();
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
async function requireDashboardAuth(req, res, next) {
  // Allow login and upgrade page access
  if (req.path.includes('login') || req.path.includes('upgrade')) return next();

  if (!req.session.clinicId) {
    return res.redirect('/dashboard/login');
  }

  // P2 Hardening: Check trial status
  if (req.session.trialId) {
    const trial = await db.getTrialById(req.session.trialId);
    if (trial && trial.status === 'expired') {
      return res.redirect('/dashboard/upgrade');
    }
  }
  next();
}

app.get('/dashboard/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard', 'login.html'));
});


app.get('/dashboard', requireDashboardAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard', 'index.html'));
});

// Serve dashboard static assets
app.use('/dashboard', requireDashboardAuth, express.static(path.join(__dirname, 'public', 'dashboard')));


app.get('/dashboard/upgrade', (req, res) => {
  res.send(`
    <html>
      <body style="background:#0F172A; color:white; font-family:sans-serif; text-align:center; padding-top:100px;">
        <h1>Your Trial has Expired ⏳</h1>
        <p>Your AI Receptionist has handled dozens of appointments. Keep it running!</p>
        <button onclick="window.location.href='https://buy.stripe.com/test_qudozen_sub'" style="background:#0D9488; color:white; padding:15px 30px; border:none; border-radius:10px; font-weight:bold; cursor:pointer;">Upgrade to Pro ($99/mo)</button>
      </body>
    </html>
  `);
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Boot] Server listening on 0.0.0.0:${PORT}`);
  console.log('[Monitor] Self-healing monitor active 🛡️');
  console.log('[AI] Custom GPT with function calling enabled 🧠');
  console.log('[WhatsApp] Interactive buttons/lists ready 📱');
});
