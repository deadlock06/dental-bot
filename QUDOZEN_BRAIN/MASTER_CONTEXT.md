# 📋 MASTER CONTEXT — Qudozen Complete System Map
> For any LLM or agent. Read this to understand every file, every function, every connection.
> Version: 3.3-HARDENED | Last Updated: 2026-04-29

---

## 🏢 What Qudozen Is

**Qudozen** is an AI automation company selling autonomous WhatsApp receptionists to dental clinics in Saudi Arabia. The entire system — brand, sales engine, product, and admin dashboard — lives in one Node.js repo deployed on Render.

**Domain:** qudozen.com
**Repo:** deadlock06/dental-bot (GitHub)
**Deployed at:** Render free tier, auto-deploy on push to `main`
**Runtime:** Node.js >= 20
**Database:** Supabase (Postgres)
**Messaging:** Twilio WhatsApp API
**AI:** OpenAI GPT-4o-mini
**Payments:** Stripe

---

## 🗺️ THE FIVE LAYERS

```
LAYER 1: BRAND (public/index.html)
  Marketing site, Live Simulator (#reception-simulator), Pricing, FOMO ticker.
  Chat Widget (chat-widget.js) — Jake persona, trial activation.

LAYER 2: GROWTH SWARM (growth/)
  Scouts → Score leads → Two-Step outreach → Simulator demo → Payment.

LAYER 3: ONBOARDING (growth/onboarding-state-machine.js)
  Stripe webhook → Credentials → Calendar → LIVE.

LAYER 4: DENTAL BOT (bot.js)
  THE PRODUCT. Books, reschedules, cancels, reminds, follows up.
  Multi-tenant, multi-lingual (AR/EN), multi-vertical (dental/saas).

LAYER 5: DASHBOARD (public/dashboard/)
  Clinic owner command center. Bookings, revenue, leads.

All layers: index.js (server) + Supabase (database) + db.js (ORM)
```

---

## 📁 COMPLETE FILE MAP

### Root Files

| File | Size | Role | Key Exports |
|------|------|------|-------------|
| `index.js` | 31KB | Express server + all routes + all crons + Stripe webhook | Entry point |
| `bot.js` | 110KB | Core WhatsApp state machine — THE PRODUCT | `handleMessage(phone, text, clinic)` |
| `ai.js` | 20KB | OpenAI GPT-4o-mini | `detectIntent()`, `extractDate()`, `extractTimeSlot()` |
| `db.js` | 20KB | Supabase data layer (Axios REST) | See DATABASE FUNCTIONS section |
| `api.js` | 7.7KB | REST API for dashboard | Mounted at /api |
| `whatsapp.js` | 15KB | Twilio messaging | `sendMessage()`, `sendInteractiveList()`, `sendButtons()` |
| `slots.js` | 11KB | Atomic slot locking | `bookSlot()`, `releaseSlot()`, `getSlots()` |
| `calendar.js` | 6.1KB | Google Calendar | `createCalendarEvent()`, `updateCalendarEvent()` |
| `audio.js` | 5.3KB | Whisper transcription | `transcribeAudio(mediaUrl)` |
| `monitor.js` | 12KB | Health monitoring | `healthCheck()`, `withMonitor()`, `logError()` |
| `dashboard-api.js` | - | Dashboard metrics API | Mounted at /api/dashboard |
| `schema.sql` | 14KB | Master Postgres schema | Run in Supabase SQL Editor |

### `growth/` Files

| File | Role |
|------|------|
| `growth/index.js` | Express router for /growth/*. JWT auth. 25+ endpoints. HTML dashboard. |
| `growth/onboarding-state-machine.js` | Activation lifecycle. Exported as singleton `machine`. States: activation_requested → live. |
| `growth/brain.js` | `generateMessage(lead)` via GPT-4o-mini PAS. `applyGuardrails(msg)` — strips links/emojis, 320 char max, adds -Jake signature. `detectLanguage(lead)` — defaults Arabic. |
| `growth/sender.js` | `processBatch(leads)` — Two-Step outreach. Rate limited. |
| `growth/compliance.js` | `isWithinBusinessHours()` — 10am-5pm Riyadh, no Fridays. `detectStopCommand()`. |
| `growth/nurture.js` | Hot/Warm drip cadence. |
| `growth/handoff.js` | `handoffLead(lead, msg)` — converts lead to bot patient. |
| `growth/activation.js` | `provisionClinic()` — creates clinic record. |
| `growth/scouts/orchestrator.js` | `runAllScouts(supabase, {scouts, autoSend})` — runs all scouts, deduplicates, inserts. |
| `growth/scouts/indeed.js` | Indeed.sa RSS for dental receptionist postings. |
| `growth/scouts/jobPortals.js` | Bayt + Naukrigulf + Indeed Arabic RSS. |
| `growth/scouts/googlePlaces.js` | Google Places API for Saudi dental clinics. |
| `growth/scouts/owner-finder.js` | Finds owner WhatsApp from social profiles. |
| `growth/lib/whatsappProvider.js` | `sendWhatsApp(phone, msg)` — Twilio routing. |
| `growth/lib/supabase.js` | Supabase SDK client (ONLY inside growth/ — db.js uses Axios). |
| `growth/lib/phone.js` | `normalizePhone(phone)` — central phone normalization. |
| `growth/lib/autoVerify.js` | Full verification: parse → website → phone → score → decision. |

### `public/` Files

| File | Role |
|------|------|
| `public/index.html` | Complete marketing site. `#reception-simulator` = interactive bot demo card. Simulator focus script: auto-scrolls + glows on `#simulator` hash. Post-simulation CTA: button opens pricing + chat widget. |
| `public/chat-widget.js` | Jake chat widget. Class `QudozenChat`. `open(action)` → `handleAction(action)`. `activateTrial()` → POST /api/start-trial. `runDemo()` → demo conversation. `addMessage(type, content)`. Mobile CSS: edge-to-edge on < 480px. |

### `api/` Files

| File | Role |
|------|------|
| `api/stripe-checkout.js` | Creates Stripe sessions. `phone_number_collection: {enabled: true}` (MANDATORY). Plans: Awareness (80 USD), System (133 USD). |
| `api/index.js` | API router. Mounts stripe-checkout and other API routes. |

---

## 🗄️ DATABASE FUNCTIONS (db.js exports)

```javascript
// Patients
getPatient(phone)
insertPatient(phone)
savePatient(phone, data)
deletePatient(phone)

// Clinics
getClinic(whatsappNumber)
getClinicById(id)

// Appointments
saveAppointment(data)
getAppointment(phone)
updateAppointment(id, fields)
checkDuplicateBooking(phone, date)
getAppointmentCountsForDate(clinicId, doctorId, date)
getAppointmentsDueTomorrow()
getAppointmentsDueInOneHour()
getAppointmentsDueFollowUp()

// Doctors
getDoctorsByClinic(clinicId)

// Onboarding
getOnboardingByPhone(phone)
getOnboardingById(id)
createOnboarding(data)
updateOnboarding(id, fields)     ← Patches onboarding_states by UUID
logOnboardingMessage(id, day, type, content)

// Scheduling
createCronJob(data)
getPendingCronJobs()
markCronJobExecuted(id)

// Growth Leads
getLeadByPhone(phone)            ← Queries growth_leads_v2 by phone
updateLeadStatus(leadId, status) ← Patches by id (UUID), NOT phone
getLeadById(leadId)
getRandomHotLeads(count)

// Dashboard
verifyDashboardCredentials(username, password)
getDashboardMetrics(clinicId)
getDashboardFeed(clinicId)
getDashboardCalendar(clinicId)

// Misc
createGrowthConversation(data)
countRecentAutoReplies(leadId, hours)
countUnclearIntents(leadId, hours)
createTrial(data)                ← Inserts to 'trials' table
getTrialById(id)
logEvent(eventName, sessionId, metadata)
```

---

## 🤖 BOT.JS EXACT MESSAGE ROUTING ORDER

```
1. LOCK: processingLocks.get(phone) → skip duplicate Twilio retry
2. MEDIA: if '[Media/Unsupported]' → reject → RETURN
3. ONBOARDING INTERCEPT:
     db.getOnboardingByPhone(phone)
     if found AND state !== 'live':
       onboarding.handleResponse(phone, msg, existing)
       if resp.handled → RETURN
4. ACTIVATION DETECT:
     onboarding.handleActivation(phone, msg, clinic||{})
     if handled → RETURN
5. GROWTH LEAD TWO-STEP:
     db.getLeadByPhone(phone)
     if lead AND status in ['messaged','scouted']:
       if positive regex match (yes/نعم/send/رابط/etc.):
         db.updateLeadStatus(lead.id, 'interested')  ← lead.id NOT phone
         sendMessage(simulator URL)
         RETURN
6. NEW PATIENT: getPatient → if null → insertPatient → LANG_SELECT → RETURN
7. STALE FLOW: if updated_at > 30 min → reset flow
8. LANGUAGE GATE: if language not set → prompt 1/2
9. LANGUAGE SWITCH: "english"/"عربي" → switch + menu
10. FREE TEXT CHECK: skip AI for name/notes/date steps
11. AI INTENT: detectIntent() → GPT-4o-mini
12. FLOW ROUTING:
    Active flow → handleBookingFlow() | handleRescheduleFlow() | handleCancelFlow()
    No flow → routeIntent()
```

### routeIntent() Vertical Logic

```
case 'booking':
  SaaS:  r = await onboarding.handleTrialRequest(...)  ← MUST await + check r.handled
  Dental: start booking flow step 1

case 'my_appointment':
  SaaS:  db.getOnboardingByPhone() → show current_state
  Dental: getAppointment() → show booking

case 'prices':
  SaaS:  299/499 SAR tiers
  Dental: dental procedure prices

case 'doctors':
  SaaS:  AI + Cloud team description
  Dental: doctors list

case 'reschedule':
  SaaS:  "Contact sales"
  Dental: reschedule flow
```

---

## 🔄 ONBOARDING STATE MACHINE

```
States: activation_requested → calendar_pending → credentials_sent → live
      → followup_day1 → checkin_day3 → review_day7 → completed

4 Entry Points:
  1. startFromPayment({clinic_name, email, plan, owner_phone, stripe_customer_id})
     ← Called by Stripe webhook
  2. handleActivation(phone, msg, context)
     ← Called by bot.js step 4
  3. handleTrialRequest(phone, msg, context)
     ← Called by routeIntent case 'booking' (SaaS)
     ← Returns {handled: bool} — MUST be awaited and checked
  4. handleResponse(phone, msg, existing)
     ← Called by bot.js step 3 for users in active onboarding
     ← Handles Calendar ID submission + help requests

handleResponse Logic:
  /help/ → send calendarHelp
  state === 'calendar_pending' AND (msg has '@' OR length > 20)
    → updateOnboarding({calendar_id, calendar_connected:true, current_state:'live'})
    → sendWhatsApp(setupComplete)

Day 0 Sequence (runDay0):
  1. sendWhatsApp(welcome)
  2. sendWhatsApp(calendarRequest)
  3. sendWhatsApp(credentials)  ← dashboard_username + dashboard_password
  4. giftLeads() → 5 hot leads
  5. scheduleCron(id, 1, 'followup')
```

---

## 📡 TWO-STEP OUTREACH PIPELINE

```
DISCOVERY (cron every 6h):
  scouts → growth_leads_v2 (deduped, scored)

STEP 1 HOOK (cron daily 10am, sender.processBatch):
  "Hi Dr. X, I built a digital twin for [Clinic]. Want the link?" (no URL)
  Rule: applyGuardrails() adds -Jake signature, strips links, enforces 320 chars
  Rate: 50/day system, 3/day per lead, 10am-5pm Riyadh only

STEP 2 DELIVER (bot.js step 5, when lead replies):
  positive regex → db.updateLeadStatus(lead.id, 'interested')
  Send: https://qudozen.com/#simulator?clinic={name}&lead={id}

WEBSITE LANDING:
  index.html scroll/glow handler on #simulator hash

POST-SIMULATION:
  "Activate [Clinic] OS Now" button
  → #pricing + window.qdChat.open('activate')
  → handleAction('activate') → activateTrial()
  → POST /api/start-trial → credentials → LIVE
```

---

## 🌐 ALL ROUTES

### Core (index.js)
| Method | Path | Purpose |
|--------|------|---------|
| GET | / | public/index.html |
| GET | /health | System health JSON |
| POST | /webhook | Twilio → bot.handleMessage() |
| POST | /webhook/status | Delivery status → message_logs |
| POST | /webhook/stripe | Stripe → onboarding.startFromPayment() |
| POST | /api/chat | Web widget → {messages:[]} array |
| POST | /api/start-trial | Create trial + send credentials |
| POST | /send-reminders | Cron: 24h + 1h reminders |
| POST | /cleanup-slots | Cron: release past slots |

### Dashboard API (/api)
| POST | /api/auth/login | JWT |
| GET | /api/dashboard/stats | Revenue/bookings |
| GET | /api/appointments | Appointment list |
| GET | /api/patients | Patient list |
| GET | /api/leads | Growth leads |
| GET | /api/doctors | Doctor schedules |

### Growth Swarm (/growth)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /growth/dashboard | JWT | HTML command center |
| GET | /growth/ghost-room | None | Revenue loss simulator |
| POST | /growth/add-and-fire | None | Paste raw → parse/send |
| POST | /growth/send-batch | JWT | Send to top N leads |
| POST | /growth/scout/run | JWT | Run all scouts |
| POST | /growth/approve/:id | JWT | Manually approve lead |
| GET | /growth/login | None | Login page + JWT |

---

## ⏰ CRON SCHEDULE

| Schedule | Job |
|----------|-----|
| Every 30 min | Appointment reminders |
| Every hour | Release past slots |
| Every 10 min | Health check |
| Daily 9 AM Riyadh | Growth follow-up drip |
| Every 6 hours | Indeed + job portal scout |
| Weekly Sunday 7 AM Riyadh | Google Places scout |
| Daily 10 AM Riyadh | Auto-batch outreach |
| Daily 8:30 AM Riyadh | Morning brief to admin |

---

## ⚠️ CRITICAL RULES

1. `const db = require('./db')` — at TOP of bot.js, NOT inside handleMessage()
2. `const onboarding = require('./growth/onboarding-state-machine.js')` — same
3. `db.updateLeadStatus(lead.id, status)` — NOT `(phone, status)`. Filters by id.
4. `handleTrialRequest()` MUST be awaited + `if(r.handled) return`
5. NEVER reset patient flow without `{current_flow: null, flow_step: 0, flow_data: {}}`
6. ALL strings need `ar ? arabicText : englishText` — Arabic is default
7. Use `preferred_date_iso` (YYYY-MM-DD) for ALL logic — NOT `preferred_date`
8. NEVER rewrite atomic slot locking in slots.js
9. `clinics.vertical` controls persona — check before every template
10. `/api/chat` returns `{messages:[]}` array — rendered with 600ms delay

---

## 🐛 KNOWN ISSUES

| Issue | Severity | Status |
|-------|----------|--------|
| Dashboard build not automated on Render | High | Open |
| No-show detection uses UTC not Riyadh TZ | Medium | Open |
| db.js uses Axios, growth/ uses Supabase SDK | Low | Inconsistency |
| bot.js is 110KB monolith | Medium | Backlog |
| Cron self-calls localhost | Low | Open |

---

## 📝 SESSION CHANGELOG (2026-04-29)

### Bugs Fixed (Critical)
1. `bot.js` — Added missing `const db = require('./db')` import
2. `bot.js` — Fixed `updateLeadStatus(phone)` → `updateLeadStatus(lead.id)`
3. `bot.js` — Added `await` + result check for `handleTrialRequest()`
4. `bot.js` — Moved `require(onboarding)` to module top (performance)

### Features Added
5. Two-Step Outreach — Hook message (no link) → positive reply → simulator URL
6. Simulator Focus — Auto-scroll + glow on #simulator hash landing
7. Post-Simulation CTA — "Activate Now" button → pricing scroll + chat widget open
8. Mobile CSS — Edge-to-edge chat widget on < 480px screens
9. Vertical Routing — Dental vs SaaS persona isolation across all intents
10. Phone Collection — Stripe checkout.session phone capture for onboarding

### Architecture Decoupling (Multi-Vertical Pivot)
11. Configuration Extraction — Extracted all dental-specific hardcoded strings, treatment menus, and emojis from core logic to `verticals/dental.json`.
12. Synchronous Simulator Sync — Integrated frontend `index.html` Simulator with `dental.json` dynamically via sync XHR.
13. Universal Handlers — Refactored `whatsapp.js` and `bot.js` routing logic to dynamically read from the `dentalConfig` object.

*Auto-generated by Antigravity AI — 2026-04-29*
