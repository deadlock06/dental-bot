# 🏗️ QUDOZEN — COMPLETE SYSTEM ARCHITECTURE
> **Version:** 3.3-HARDENED | **Last Updated:** 2026-04-29 | **Author:** Antigravity
> For any LLM, agent, or developer. Read this before touching any file.

---

## 🧠 WHAT THIS SYSTEM IS

**Qudozen** is a global AI automation company selling **Autonomous WhatsApp Receptionists** to service-based businesses worldwide. It is also a self-selling SaaS platform — it finds its own customers, demos itself, collects payment, and onboards them with zero human involvement.

**The system serves TWO distinct user types, separated by the `clinic.vertical` field:**
- `vertical: 'dental'` → **Patients** talking to their clinic's WhatsApp bot (booking appointments)
- `vertical: 'saas'` → **Clinic Owners** being sold the system (Jake persona, trial activation)

**Infrastructure:**
```
Domain:    qudozen.com
Runtime:   Node.js >= 20 on Render (auto-deploy from GitHub)
Database:  Supabase (Postgres via Axios REST — NOT the Supabase SDK in core modules)
Messaging: Twilio WhatsApp Business API
AI:        OpenAI GPT-4o-mini (intent detection, date parsing, message generation)
Payments:  Stripe (subscriptions + mandatory phone collection at checkout)
```

---

## 🗺️ THE FIVE LAYERS

```
LAYER 1: BRAND / MARKETING (public/index.html)
  qudozen.com — Marketing site, Live Simulator, Pricing, FOMO Ticker
  Chat Widget (chat-widget.js) — Jake persona, trial activation CTA

LAYER 2: GROWTH SWARM (growth/ folder)
  Scouts find clinic owners → score them → Jake sends Two-Step msg
  → Owner clicks → Sees simulator → Starts trial → Pays via Stripe

LAYER 3: ONBOARDING STATE MACHINE (growth/onboarding-state-machine.js)
  Stripe fires webhook → Machine takes over → Sends credentials via
  WhatsApp → Collects Calendar ID → Marks clinic as LIVE

LAYER 4: DENTAL BOT CORE (bot.js)
  THE PRODUCT. AI receptionist that books, reschedules, cancels,
  reminds, and follows up with real patients. Multi-tenant.

LAYER 5: OPERATOR DASHBOARD (public/dashboard/)
  Clinic owner sees bookings, revenue, growth leads in real-time.

All layers share: index.js (server) + Supabase (database)
```

---

## 📁 COMPLETE FILE MAP

### Root Files

| File | Role | Key Exports |
|------|------|-------------|
| `index.js` | Express server, ALL route mounting, ALL cron jobs, Stripe webhook | App entry point |
| `bot.js` | Core WhatsApp state machine — THE PRODUCT | `handleMessage(phone, text, clinic)` |
| `db.js` | Supabase data access layer (Axios REST, NOT Supabase SDK) | See DATABASE section |
| `ai.js` | OpenAI GPT-4o-mini integration | `detectIntent()`, `extractDate()`, `extractTimeSlot()` |
| `whatsapp.js` | Twilio WhatsApp message abstraction | `sendMessage()`, `sendInteractiveList()`, `sendButtons()` |
| `slots.js` | Atomic slot locking via Postgres UPDATE...RETURNING | `bookSlot()`, `releaseSlot()`, `getSlots()` |
| `calendar.js` | Google Calendar API integration | `createCalendarEvent()`, `updateCalendarEvent()` |
| `audio.js` | OpenAI Whisper transcription for voice notes | `transcribeAudio(mediaUrl)` |
| `monitor.js` | System health, error logging, self-healing | `healthCheck()`, `withMonitor()`, `logError()` |
| `api.js` | REST API routes for dashboard (mounted at /api) | 10+ dashboard endpoints |
| `schema.sql` | Master Postgres schema — run in Supabase SQL Editor | Defines all tables |
| `dashboard-api.js` | Mounted at /api/dashboard | Dashboard metrics |

---

### `growth/` — The Autonomous Sales Engine

| File | Role |
|------|------|
| `growth/index.js` | Express Router for all /growth/* routes. JWT auth middleware. 25+ endpoints. |
| `growth/onboarding-state-machine.js` | THE SALES CLOSER + ACTIVATOR. Manages lifecycle from payment → credentials → calendar → LIVE. |
| `growth/brain.js` | AI message generation. `generateMessage(lead)` via GPT-4o-mini PAS formula. `applyGuardrails(msg)` strips links/emojis, enforces 320 char limit, adds -Jake signature. `detectLanguage(lead)` defaults to Arabic. |
| `growth/sender.js` | Batch outreach engine. Two-Step safety: hook message (no link), detects positive reply in bot.js, fires simulator link. Rate: 50/day system, 3/day per lead. |
| `growth/nurture.js` | Drip campaign engine. Hot/Warm cadence. |
| `growth/handoff.js` | Converts a GS lead who expressed interest into a bot patient record. |
| `growth/compliance.js` | Global outreach safety guard. Enforces safe UTC window for messaging. `detectStopCommand()` for opt-out. |
| `growth/activation.js` | `provisionClinic()` — creates clinic record, assigns WhatsApp number |
| `growth/ghost-room.html` | Revenue loss simulator landing page at /growth/ghost-room |

#### `growth/scouts/` — Lead Discovery Layer

| File | Role |
|------|------|
| `orchestrator.js` | Runs all scouts → deduplicates → scores → inserts → optional auto-send |
| `indeed.js` | Scrapes Indeed.sa RSS for "dental receptionist" job postings |
| `jobPortals.js` | Scrapes Bayt.com + Naukrigulf + Indeed Arabic RSS |
| `googlePlaces.js` | Google Places API → finds businesses in global cities |
| `owner-finder.js` | Extracts owner's WhatsApp from clinic social profiles |
| `classifyPhone.js` | Saudi personal vs. business phone detection |
| `confidenceScore.js` | Score 0-100 based on ownership evidence |

#### `growth/lib/` — Intelligence Layer

| File | Role |
|------|------|
| `smartParser.js` | Extracts name/phone/city/pain from raw pasted text |
| `autoVerify.js` | Full verification pipeline → returns {decision: 'MESSAGE'|'REVIEW'|'DROP'} |
| `dedup.js` | Checks lead against DB to prevent re-contacting |
| `whatsappProvider.js` | Multi-provider WhatsApp send (Twilio routing) |
| `supabase.js` | Supabase SDK client (ONLY used inside growth/ — db.js uses Axios) |
| `phone.js` | Phone normalization (strips +, country code handling) |

---

### `public/` — Frontend Assets

| File | Role |
|------|------|
| `public/index.html` | Complete Bilingual (AR/EN) marketing site. Hero, Three-Layer Architecture, Services Bento Grid, Live Simulator (embedded WhatsApp demo), Pricing, FOMO ticker, Jake letter, Chat Widget. Simulator is at #reception-simulator. Auto-scrolls and glows on #simulator anchor. |
| `public/chat-widget.js` | Self-contained embedded chat. Jake persona. `handleAction('activate'|'demo'|'pricing'|'support'|'dashboard')`. Mobile-responsive (edge-to-edge < 480px). Multi-message array rendering with 600ms delay between messages. |
| `public/dashboard/` | Vanilla HTML/CSS/JS operator dashboard. Auth via express-session. |

---

### `api/` — Stripe Integration

| File | Role |
|------|------|
| `api/stripe-checkout.js` | Creates Stripe checkout sessions. `phone_number_collection: {enabled: true}` (MANDATORY). Plans: Awareness (80 USD), System (133 USD). |

---

## 🤖 BOT.JS — COMPLETE MESSAGE ROUTING LOGIC (EXACT ORDER)

Every inbound WhatsApp message goes through `handleMessage(phone, text, clinic)`:

```
IMPORTS (module top-level — NOT inside handleMessage):
  const db = require('./db');                           ← CRITICAL: must be here
  const onboarding = require('./growth/onboarding-state-machine.js');  ← CRITICAL

STEP 1 [LOCK]
  processingLocks.get(phone) → skip if duplicate Twilio retry

STEP 2 [MEDIA]
  If message === '[Media/Unsupported]' → reject with explanation → RETURN

STEP 3 [ONBOARDING INTERCEPT]
  const existing = await db.getOnboardingByPhone(phone)
  If found AND existing.current_state !== 'live':
    const resp = await onboarding.handleResponse(phone, msg, existing)
    If resp.handled → RETURN (do not process further)

STEP 4 [ACTIVATION DETECT]
  const activation = await onboarding.handleActivation(phone, msg, clinic || {})
  If activation.handled → RETURN

STEP 5 [GROWTH LEAD TWO-STEP]
  const lead = await db.getLeadByPhone(phone)
  If lead AND (status === 'messaged' OR 'scouted'):
    If positive reply regex matches:
      await db.updateLeadStatus(lead.id, 'interested')  ← lead.id NOT phone
      sendMessage(phone, simulator URL)
      RETURN

STEP 6 [NEW PATIENT]
  const patient = await getPatient(phone)
  If no patient → insertPatient() → sendMessage(LANG_SELECT) → RETURN

STEP 7 [STALE FLOW]
  If patient.updated_at > 30 min → reset flow to null

STEP 8 [LANGUAGE GATE]
  If patient.language not in ['ar', 'en'] → prompt 1/2

STEP 9 [LANGUAGE SWITCH]
  "english" / "عربي" → switch language + show menu

STEP 10 [AI INTENT]
  Skips AI for free-text steps (name=1, notes=6, date=4, custom_phone=21)
  detectIntent(msg, flow, step) → GPT-4o-mini

STEP 11 [FLOW ROUTING]
  Active flow → handleBookingFlow() | handleRescheduleFlow() | handleCancelFlow()
  No active flow → routeIntent(phone, intent, lang, ar, rawMsg, patient, cl)
```

### routeIntent() — Vertical-Aware Switch

```
case 'booking':
  SaaS  → const r = await onboarding.handleTrialRequest(...)
           if (r.handled) return;
           else → send "type activate" prompt
  Dental → start booking flow (step 1)

case 'my_appointment':
  SaaS  → db.getOnboardingByPhone() → show setup status
  Dental → getAppointment() → show booking details

case 'prices':
  SaaS  → 299/499 SAR tiers
  Dental → dental procedure prices

case 'doctors':
  SaaS  → "AI + Cloud team" description
  Dental → show doctors list

case 'reschedule':
  SaaS  → "Contact sales team"
  Dental → reschedule flow

All other cases (location, services, reviews, human, etc.) → dental logic only
```

---

## 🔄 ONBOARDING STATE MACHINE LIFECYCLE

```
States:
  activation_requested → calendar_pending → credentials_sent → live
  → followup_day1 → checkin_day3 → review_day7 → completed

Entry Point 1: startFromPayment()
  Called by: Stripe webhook (checkout.session.completed)
  Input: {clinic_name, email, plan, owner_phone, stripe_customer_id}
  Note: owner_phone comes from session.customer_details.phone (Stripe mandatory collection)

Entry Point 2: handleActivation(phone, msg, context)
  Called by: bot.js STEP 4
  Triggers on: 'activate', 'تفعيل', 'start trial', 'subscribe', etc.

Entry Point 3: handleTrialRequest(phone, msg, context)
  Called by: routeIntent() case 'booking' when vertical === 'saas'
  CRITICAL: Must be awaited. Returns {handled: true/false}. Check result.
  On success: generates trial@{clinic}.qd credentials → sends WhatsApp → creates trials record

Entry Point 4: handleResponse(phone, msg, existing)
  Called by: bot.js STEP 3 (for users IN an onboarding sequence)
  Handles:
    - /help/مساعدة/ → send calendar instructions
    - state === 'calendar_pending' AND (msg includes '@' OR length > 20)
      → updateOnboarding({calendar_id, calendar_connected:true, current_state:'live'})
      → send setupComplete confirmation

Day 0 Sequence:
  1. sendWhatsApp(welcome message)
  2. sendWhatsApp(calendar connection request)
  3. sendWhatsApp(dashboard credentials — bcrypt hashed in DB)
  4. giftLeads() — 5 hot leads from gs_leads
  5. scheduleCron(id, 1, 'followup') — Day 1 follow-up
```

---

## 📡 TWO-STEP OUTREACH PIPELINE

```
DISCOVERY (orchestrator.js — cron every 6h):
  indeed.js + jobPortals.js + googlePlaces.js → dedup → insert growth_leads_v2

STEP 1 — HOOK (sender.processBatch — cron daily 10am):
  Message: "Hi Dr. X, I built a digital twin for [Clinic]'s front desk.
            Would you like me to send you the link to try the simulation?"
  Rules: No links. Max 320 chars. 10am-5pm Riyadh only. 50/day cap. -Jake signature.

STEP 2 — DELIVER (bot.js STEP 5):
  Trigger: lead.status in ['messaged','scouted'] + positive reply regex
  Action: db.updateLeadStatus(lead.id, 'interested')  ← MUST be lead.id
  Send: https://qudozen.com/#simulator?clinic={name}&lead={id}

WEBSITE LANDING (index.html):
  hash === '#simulator' or '#reception-simulator'
  → scrollIntoView(#reception-simulator)
  → boxShadow glow animation

POST-SIMULATION CTA:
  Simulation complete → button "Activate [Clinic] OS Now ←"
  → href="#pricing" + setTimeout(window.qdChat.open('activate'), 1000)
  → handleAction('activate') → activateTrial() → POST /api/start-trial
  → Creates trial → sends WhatsApp credentials → clinic is LIVE
```

---

## 🗄️ DATABASE — KEY TABLES

### `patients` (bot conversation state)
```sql
phone         TEXT PRIMARY KEY   -- WhatsApp number
language      TEXT               -- 'ar' | 'en' | null (null = not chosen yet)
current_flow  TEXT               -- 'booking' | 'reschedule' | 'cancel' | null
flow_step     INT DEFAULT 0
flow_data     JSONB DEFAULT '{}'  -- Draft: {name, treatment, date, slot, doctor, etc.}
updated_at    TIMESTAMPTZ
```

### `clinics` (multi-tenant config)
```sql
id               UUID PRIMARY KEY
whatsapp_number  TEXT UNIQUE     -- Maps Twilio number → clinic
name / name_ar   TEXT
vertical         TEXT DEFAULT 'dental'   -- 'dental' | 'saas' — CONTROLS ALL PERSONA LOGIC
plan             TEXT                    -- 'basic' | 'pro'
config           JSONB                   -- {features: {reschedule, cancel, google_calendar}}
doctors          JSONB                   -- Inline fallback doctor data
```

### `appointments`
```sql
preferred_date      TEXT    -- Human display string (DO NOT USE for logic)
preferred_date_iso  DATE    -- YYYY-MM-DD (USE THIS for all cron/slot/calendar logic)
status              TEXT    -- 'confirmed'|'cancelled'|'no-show'|'completed'
reminder_sent_24h   BOOLEAN
reminder_sent_1h    BOOLEAN
follow_up_sent      BOOLEAN
```

### `doctor_slots` (atomic availability)
```sql
status      TEXT    -- 'available' | 'booked'
available   INT     -- Decremented by bookSlot() atomically
booked      INT     -- Incremented by bookSlot() atomically
```

### `growth_leads_v2` (outreach pipeline)
```sql
status  TEXT  -- 'new'|'scouted'|'messaged'|'interested'|'converted'|'opted_out'
```
Note: `getLeadByPhone()` queries this table. `updateLeadStatus(id, status)` patches by `id` NOT phone.

### `onboarding_states` (activation lifecycle)
```sql
owner_phone     TEXT            -- The clinic owner's WhatsApp
current_state   TEXT            -- activation_requested → live → completed
calendar_id     TEXT            -- Submitted by owner during onboarding
calendar_connected BOOLEAN
dashboard_username TEXT
dashboard_password TEXT         -- bcrypt hashed
```

### `trials` (free trial records)
```sql
username    TEXT    -- trial@{clinic}.qd
password    TEXT    -- Plain text (hashed version stored in onboarding_states)
expires_at  TIMESTAMPTZ  -- 7 days from creation
```

---

## 🌐 ALL ROUTES (Complete)

### Core (index.js)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Serve public/index.html |
| GET | `/health` | System health JSON |
| POST | `/webhook` | Twilio → bot.handleMessage() |
| POST | `/webhook/status` | Twilio delivery → message_logs |
| POST | `/webhook/stripe` | Stripe checkout.session.completed → onboarding.startFromPayment() |
| POST | `/api/chat` | Web widget → returns `{messages: []}` array |
| POST | `/api/start-trial` | Web widget trial creation |
| POST | `/send-reminders` | Appointment reminders (cron target) |
| POST | `/cleanup-slots` | Release past slots (cron target) |

### Dashboard API (/api)
| Method | Path | Returns |
|--------|------|---------|
| POST | `/api/auth/login` | JWT token |
| GET | `/api/dashboard/stats` | Revenue, bookings, no-shows |
| GET | `/api/appointments` | Filtered appointment list |
| GET | `/api/patients` | Patient list |
| GET | `/api/leads` | Growth leads |
| GET | `/api/doctors` | Doctor schedules |

### Growth Swarm (/growth)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/growth/dashboard` | JWT | HTML lead management dashboard |
| GET | `/growth/ghost-room` | None | Revenue loss simulator |
| POST | `/growth/add-and-fire` | None | Paste raw data → auto parse/send |
| POST | `/growth/send-batch` | JWT | Send to top N leads |
| POST | `/growth/scout/run` | JWT | Run all scouts |
| POST | `/growth/approve/:id` | JWT | Manually approve + send |
| GET | `/growth/login` | None | Login HTML + JWT issue |

---

## ⏰ CRON SCHEDULE

| Schedule | Job |
|----------|-----|
| Every 30 min | Appointment reminders (24h + 1h) |
| Every hour | Release past booked slots |
| Every 10 min | System health check + auto-heal |
| Daily 9 AM Riyadh | Growth follow-up drip |
| Every 6 hours | Indeed + job portal scout |
| Weekly Sunday 7 AM Riyadh | Google Places scout |
| Daily 10 AM Riyadh | Auto-batch send (top leads) |
| Daily 8:30 AM Riyadh | Morning brief WhatsApp to admin |

---

## ⚠️ CRITICAL RULES

1. **`db` imported at module top in bot.js** (`const db = require('./db')`) — NOT inside handleMessage
2. **`onboarding` imported at module top in bot.js** — same reason
3. **`updateLeadStatus(lead.id, status)`** — NOT `(phone, status)` — filters by id column
4. **`handleTrialRequest()` must be awaited + result checked** — returns {handled: bool}
5. **NEVER reset patient flow without** `{current_flow: null, flow_step: 0, flow_data: {}}`
6. **Arabic is default** — ALL strings need `ar ? arabicText : englishText` branching
7. **Use `preferred_date_iso`** (YYYY-MM-DD) for ALL logic — NOT `preferred_date`
8. **NEVER rewrite atomic slot locking** — `slots.js` Postgres UPDATE...WHERE...RETURNING is the only safe pattern
9. **`clinics.vertical` controls ALL persona** — check before every message template
10. **`/api/chat` returns `{messages: []}` array** — frontend renders with 600ms delay per message

---

## 🐛 KNOWN ISSUES

| Issue | Severity | Status |
|-------|----------|--------|
| Dashboard build not automated on Render | High | Open |
| No-show detection uses UTC not Riyadh TZ | Medium | Open |
| `db.js` uses Axios REST, `growth/` uses Supabase SDK | Low | Inconsistency |
| `bot.js` is 110KB monolith — needs module refactoring | Medium | Backlog |
| Cron jobs self-call localhost (may fail if PORT changes) | Low | Open |

---

*Generated by Antigravity — 2026-04-29*
*Reflects session hardening: db import fix, lead.id fix, handleTrialRequest await, mobile CSS, simulator CTA, Two-Step outreach, vertical routing, onboarding machine.*
