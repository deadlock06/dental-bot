# 📋 MASTER CONTEXT — Qudozen Complete System Map
> For any LLM or agent. Read this to understand every file, every function, every connection.
> Version: 2.0 | Last Updated: 2026-04-23

---

## 🏢 What Qudozen Is

**Qudozen** is an AI automation company selling autonomous WhatsApp receptionists to dental clinics in Saudi Arabia. The entire system — brand, sales engine, product, and admin dashboard — lives in one Node.js repo deployed on Render.

**Domain:** qudozen.com  
**Repo:** deadlock06/dental-bot (GitHub)  
**Deployed at:** Render free tier, auto-deploy on push to `main`  
**Runtime:** Node.js ≥ 20  
**Database:** Supabase (Postgres)  
**Messaging:** Twilio WhatsApp API  
**AI:** OpenAI GPT-4o-mini  

---

## 🗺️ THE FOUR LAYERS

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1: QUDOZEN BRAND (public/index.html + ghost-room.html)   │
│  The marketing face. Patients and clinic owners land here first. │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 2: ANTIGRAVITY / GROWTH SWARM (growth/ folder)           │
│  The autonomous sales engine. Finds clinics, qualifies, cold     │
│  messages them, collects Stripe payments, auto-activates.        │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 3: DENTAL BOT CORE (bot.js + supporting modules)         │
│  The actual product. AI WhatsApp receptionist that books,        │
│  reschedules, cancels, reminds, and follows up with patients.    │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 4: ADMIN DASHBOARD (dashboard/ → React SPA)              │
│  Clinic staff management panel. Appointments, patients, leads.   │
└─────────────────────────────────────────────────────────────────┘
All four layers share: index.js (server) + Supabase (database)
```

---

## 📁 COMPLETE FILE MAP

### Root Files

| File | Size | Role | Exports / Key Functions |
|---|---|---|---|
| `index.js` | 24KB | **Express server + all route mounting + all cron jobs** | Mounts: /api, /growth, /dashboard, /, /webhook, /send-reminders, /cleanup-slots, /health |
| `bot.js` | 103KB | **Core WhatsApp state machine — THE PRODUCT** | `handleMessage(phone, text, clinic)` |
| `ai.js` | 20KB | **OpenAI GPT-4o-mini integration** | `detectIntent()`, `extractDate()`, `extractTimeSlot()`, `parseDateToISO()` |
| `db.js` | 10KB | **Supabase data access layer (raw Axios REST)** | `getPatient`, `insertPatient`, `savePatient`, `deletePatient`, `getClinic`, `getClinicById`, `saveAppointment`, `getAppointment`, `updateAppointment`, `checkDuplicateBooking`, `getAppointmentCountsForDate`, `getAppointmentsDueTomorrow`, `getAppointmentsDueInOneHour`, `getAppointmentsDueFollowUp`, `getDoctorsByClinic` |
| `api.js` | 7.7KB | **REST API routes for React dashboard** | Routes: POST /auth/login, GET /dashboard/stats, GET /appointments, GET /patients, GET /leads, GET /doctors, POST /sync-simulation, POST /ghost-dwell, GET /analytics |
| `whatsapp.js` | 15KB | **Twilio WhatsApp message sender** | `sendMessage()`, `sendInteractiveList()`, `sendButtons()`, `sendTemplate()` |
| `slots.js` | 11KB | **Atomic slot locking (Postgres-level concurrency)** | `getSlots()`, `lockSlot()`, `releaseSlot()`, `releaseSlotByPatient()`, `bookSlot()` |
| `calendar.js` | 6.1KB | **Google Calendar API integration + date utils** | `createCalendarEvent()`, `updateCalendarEvent()`, `deleteCalendarEvent()` |
| `audio.js` | 5.3KB | **OpenAI Whisper voice transcription** | `transcribeAudio(mediaUrl)` — downloads from Twilio, sends to Whisper |
| `monitor.js` | 12KB | **Self-healing health monitoring system** | `healthCheck()`, `runPeriodicCheck()`, `withMonitor()`, `logError()`, `validateFlowState()`, `alertStaffIfCritical()` |
| `schema.sql` | 6.6KB | **Supabase Postgres schema** | Tables: patients, clinics, appointments, doctor_schedules, doctor_slots, growth_leads_v2, message_logs |
| `render.yaml` | 197B | **Render deployment config** | buildCommand: npm install, startCommand: node index.js ⚠️ Does NOT build dashboard |
| `package.json` | 785B | **Root dependencies** | express, helmet, twilio, openai, @supabase/supabase-js, axios, cheerio, luxon, node-cron, googleapis, stripe |

---

### `growth/` — The Antigravity / Growth Swarm Engine

| File | Size | Role | Key Functions |
|---|---|---|---|
| `growth/index.js` | 29KB | **Express router: all /growth/* endpoints + Growth HTML dashboard** | 20+ routes (see below) |
| `growth/brain.js` | 3.9KB | **GPT-4o-mini outreach message generator** | `generateMessage(lead)` — writes personalized Arabic/English WhatsApp cold messages |
| `growth/sender.js` | 2.9KB | **Follow-up drip sequence engine** | `sendFollowUps()`, `processBatch(limit)` |
| `growth/handoff.js` | 2.4KB | **Converts growth lead reply → bot patient** | `handoffLead(lead, message)` — detects reply intent, creates patient record, starts bot flow |
| `growth/finder.js` | 2KB | **Legacy lead finder utility** | Deprecated, kept for compat |
| `growth/ghost-room.html` | 6.9KB | **Revenue loss simulator landing page** | Animated counter + Stripe CTA. URL: /growth/ghost-room?clinic=X&city=Y |

#### `growth/lib/` — Intelligence Layer

| File | Role | Key Function |
|---|---|---|
| `smartParser.js` | Extract name/phone/city/pain from raw pasted text | `parseRawInput(rawText)` |
| `autoVerify.js` | Full verification pipeline: parse→website→phone→score→decide | `autoVerify(parsed, supabase)` → returns `{decision: 'MESSAGE'|'REVIEW'|'DROP', confidenceScore, ...}` |
| `dedup.js` | Check if lead already exists | `checkDuplicate(supabase, phone, name, city)` |
| `classifyPhone.js` | Saudi personal vs. business phone detection | `classifyPhone(phone)` |
| `confidenceScore.js` | Score 0–100 based on owner evidence | `calculateScore(signals)` |
| `findWebsite.js` | Google/Bing search for clinic website + owner name | `findWebsite(businessName, city)` |
| `whatsappProvider.js` | Multi-provider WhatsApp send (Twilio / 360dialog routing) | `sendWhatsApp(phone, message, options)` |

#### `growth/scouts/` — Lead Sourcing Layer

| File | Role | Key Function |
|---|---|---|
| `orchestrator.js` | Runs all scouts, deduplicates, inserts to DB | `runAllScouts(supabase, {scouts, autoSend, cities})` |
| `indeed.js` | Scrapes Indeed.sa for dental receptionist job postings | `runIndeedScout(supabase)` |
| `jobPortals.js` | Scrapes Bayt, Naukri Gulf, other Arab job portals | `runJobPortalsScout(supabase)` |
| `googlePlaces.js` | Google Places API: finds dental clinics in Saudi cities | `runGooglePlacesScout(supabase, cities)` |
| `smartParser.js` | Scout-level text parser | `parseScoutListing(raw)` |
| `classifyPhone.js` | Scout-level phone classifier | wrapper |
| `confidenceScore.js` | Scout-level scorer | wrapper |

---

### `dashboard/` — React Admin SPA

**Stack:** React 18 + TypeScript + Vite + Supabase SDK  
**Built to:** `dashboard/dist/` (must be pre-built or added to Render build command)  
**Served at:** `/dashboard/*` by Express static middleware  

| File/Folder | Role |
|---|---|
| `src/main.tsx` | React entry point |
| `src/App.tsx` | Router: Login → Layout → Pages |
| `src/index.css` | Global styles |
| `src/pages/Dashboard.tsx` | KPI cards, activity feed, stats from /api/dashboard/stats |
| `src/pages/Appointments.tsx` | Full appointment table, status updates, filters |
| `src/pages/Patients.tsx` | Patient records, flow state, history |
| `src/pages/Doctors.tsx` | Doctor profiles, schedules, working days |
| `src/pages/Clinics.tsx` | Multi-clinic management, config editor |
| `src/pages/Leads.tsx` | Growth Swarm lead table |
| `src/pages/Analytics.tsx` | Revenue/conversion charts (Period: 7d/30d/90d) |
| `src/pages/Settings.tsx` | Clinic config, API keys, bot settings |
| `src/pages/Login.tsx` | Auth against /api/auth/login (env credentials) |
| `src/components/layout/Layout.tsx` | Shell: Sidebar + TopBar + content area |
| `src/components/layout/Sidebar.tsx` | Nav menu with icons for all pages |
| `src/components/layout/TopBar.tsx` | Header: clinic name, notifications, user menu |
| `src/hooks/useAuth.tsx` | Auth state, login/logout, token storage |
| `src/hooks/useSupabase.ts` | Direct Supabase SDK queries for dashboard data |
| `src/lib/mockData.ts` | Fallback mock data (used when API fails) |
| `src/lib/utils.ts` | Date formatting, number formatting helpers |
| `src/types/index.ts` | TypeScript interfaces: Clinic, Doctor, Patient, Appointment, Lead, DashboardStats, User |

---

### `public/` — Qudozen Landing Page

| File | Size | Role |
|---|---|---|
| `public/index.html` | 84KB | **Complete marketing site:** hero section, live simulator (embedded WhatsApp conversation demo), pricing tiers, Ghost Room link, contact chat widget, Arabic/English toggle. Served at `/` |

---

### `scratch/` — Maintenance Scripts (Not Deployed)

| File | Purpose |
|---|---|
| `CLAUDE_MEGA_CONTEXT.md` | Previous AI session context dump |
| `full_health_check.js` | Comprehensive DB + Twilio + bot health check |
| `check_tables.js` | Lists all Supabase tables |
| `check_twilio.js` | Tests Twilio credentials |
| `rescue_bot.js` | Emergency patient state reset |
| `check_load.js` | Module load test |
| `dump_bot.js` | Dumps bot state to console |

---

## 🗄️ DATABASE SCHEMA (Supabase Postgres)

### `patients` — Bot conversation state per user
```sql
phone         TEXT PRIMARY KEY    -- WhatsApp number (no +)
language      TEXT                -- 'ar' | 'en' | null
current_flow  TEXT                -- 'booking' | 'reschedule' | 'cancel' | null
flow_step     INT DEFAULT 0       -- Which step in the flow (0-8 for booking)
flow_data     JSONB DEFAULT '{}'  -- Draft booking data (name, treatment, date, slot, doctor)
updated_at    TIMESTAMPTZ
```

### `clinics` — Multi-tenant clinic config
```sql
id               UUID PRIMARY KEY
whatsapp_number  TEXT UNIQUE        -- Maps Twilio number → clinic
name             TEXT
name_ar          TEXT
location         TEXT
maps_link        TEXT
review_link      TEXT
staff_phone      TEXT               -- Gets WhatsApp alerts from monitor
plan             TEXT               -- 'basic' | 'pro'
vertical         TEXT DEFAULT 'dental'
services         JSONB DEFAULT '[]'
config           JSONB DEFAULT '{}'  -- Features: reschedule, cancel, staff_notifications, google_calendar
                                    -- booking_rules: min_advance_hours, max_advance_days
doctors          JSONB DEFAULT '[]'  -- Inline doctor data (fallback if doctor_schedules empty)
created_at       TIMESTAMPTZ
```

### `appointments` — All bookings
```sql
id                  UUID PRIMARY KEY
phone               TEXT               -- Patient phone
clinic_id           UUID → clinics(id)
name                TEXT
treatment           TEXT
description         TEXT
preferred_date      TEXT               -- Human-readable display ("Monday April 21, 2026")
preferred_date_iso  DATE               -- YYYY-MM-DD ← USE THIS for all logic
time_slot           TEXT               -- "10:00 AM"
doctor_id           TEXT
doctor_name         TEXT
status              TEXT               -- 'confirmed'|'pending'|'cancelled'|'completed'|'no-show'
reminder_sent_24h   BOOLEAN
reminder_sent_1h    BOOLEAN
follow_up_sent      BOOLEAN
created_at          TIMESTAMPTZ
```

### `doctor_schedules` — Doctor working configuration
```sql
id               UUID PRIMARY KEY
clinic_id        UUID → clinics(id)
doctor_id        TEXT UNIQUE (per clinic)
doctor_name      TEXT
specialization   TEXT
specialization_ar TEXT
is_active        BOOLEAN
working_days     JSONB  -- ["Sunday","Monday","Tuesday"]
time_slots       JSONB  -- ["9:00 AM","10:00 AM","11:00 AM"]
```

### `doctor_slots` — Atomic slot availability (real-time booking lock)
```sql
id             UUID PRIMARY KEY
clinic_id      UUID → clinics(id)
doctor_id      TEXT
slot_date      DATE
slot_time      TEXT
capacity       INT DEFAULT 1
available      INT DEFAULT 1
booked         INT DEFAULT 0
status         TEXT  -- 'available' | 'booked'
patient_phone  TEXT
appointment_id UUID
```

### `growth_leads_v2` — Outreach pipeline
```sql
phone                TEXT UNIQUE     -- Saudi mobile
name                 TEXT
business_name        TEXT
city                 TEXT
vertical             TEXT DEFAULT 'dental'
status               TEXT  -- pending → verifying → verified_owner/needs_review/dropped → messaged → bumped_1 → bumped_2 → handed_off → customer/opted_out
confidence_score     INT   -- 0-100
is_owner_verified    BOOLEAN
pain_signal          TEXT  -- 'hiring_receptionist' etc.
website_found        BOOLEAN
website_url          TEXT
website_owner_name   TEXT
phone_type           TEXT  -- 'personal' | 'business'
last_message_sent    TEXT
last_contacted_at    TIMESTAMPTZ
first_contacted_at   TIMESTAMPTZ
message_count        INT
manually_approved    BOOLEAN
stripe_session_id    TEXT
stripe_customer_email TEXT
paid_at              TIMESTAMPTZ
```

### `message_logs` — Twilio delivery tracking
```sql
message_sid    TEXT UNIQUE
to_phone       TEXT
status         TEXT  -- 'sent'|'delivered'|'failed'|'read'
error_code     TEXT
error_message  TEXT
```

---

## 🌐 ALL ROUTES (Complete)

### Core Routes (index.js)
| Method | Path | Handler | Auth |
|---|---|---|---|
| GET | `/` | Sends `public/index.html` | None |
| GET | `/health` | `monitor.healthCheck()` JSON | None |
| GET | `/webhook` | Returns 200 (Twilio verify) | None |
| POST | `/webhook` | `bot.handleMessage()` | Twilio sig |
| POST | `/webhook/status` | Logs delivery status to `message_logs` | None |
| POST | `/send-reminders` | Reminder engine (24h, 1h, follow-up, no-show) | None |
| POST | `/cleanup-slots` | Releases past booked slots | None |
| GET/POST | `/public/*` | Static files from `public/` | None |

### Dashboard API Routes (api.js → mounted at /api)
| Method | Path | Returns |
|---|---|---|
| POST | `/api/auth/login` | `{token, user}` |
| GET | `/api/dashboard/stats` | `{appointments_today, pending, revenue, no_show_rate, new_patients}` |
| GET | `/api/appointments` | Array of appointments (filterable by clinic_id, status, date) |
| GET | `/api/patients` | Array of patients |
| GET | `/api/leads` | `{leads[], total}` (filterable by status, min_score) |
| GET | `/api/doctors` | Array of doctor_schedules |
| POST | `/api/sync-simulation` | Stores ghost room simulation data to growth_leads_v2 |
| POST | `/api/ghost-dwell` | Tracks ghost room dwell time, fires admin WhatsApp if >60s |
| GET | `/api/analytics` | Empty (stub) |

### Growth Swarm Routes (growth/index.js → mounted at /growth)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/growth/dashboard` | Basic Auth | HTML lead management dashboard |
| GET | `/growth/ghost-room` | None | Revenue loss simulator |
| GET | `/growth/room` | None | Alias for ghost-room |
| POST | `/growth/leads` | None | Insert lead |
| GET | `/growth/leads` | None | Get all leads |
| POST | `/growth/send` | None | Send message to one lead by id |
| POST | `/growth/bump` | None | Run follow-ups |
| POST | `/growth/handoff` | None | Trigger handoff for a lead |
| GET | `/growth/stats` | None | Lead stats summary |
| POST | `/growth/add-and-fire` | None | **Zero-friction: paste raw data → auto parse/verify/send** |
| POST | `/growth/send-batch` | Basic Auth | Send to top N qualified leads |
| POST | `/growth/send-followups` | None | Daily follow-up drip (called by cron) |
| POST | `/growth/scout/run` | Basic Auth | Run all scouts |
| POST | `/growth/scout/indeed` | Basic Auth | Indeed + job portals only |
| POST | `/growth/scout/places` | Basic Auth | Google Places only |
| GET | `/growth/scout/status` | Basic Auth | Last scout report |
| POST | `/growth/approve/:id` | Basic Auth | Manually approve + send to lead |
| POST | `/growth/stripe-webhook` | Stripe sig | Payment success → auto-activate |

### Dashboard SPA (served by express.static)
| Path | Serves |
|---|---|
| `/dashboard/*` | `dashboard/dist/index.html` (React SPA catch-all) |

---

## ⏰ CRON JOB SCHEDULE

| Schedule | Job | Code Location |
|---|---|---|
| Every 30 min | Send appointment reminders (24h + 1h) | index.js:371 → POST /send-reminders |
| Every hour | Release past booked slots | index.js:381 → POST /cleanup-slots |
| Every 10 min | System health check + auto-heal | index.js:391 → monitor.runPeriodicCheck() |
| Daily 9 AM SAR (6 AM UTC) | Growth follow-up drip | index.js:406 → POST /growth/send-followups |
| Every 6 hours | Indeed + job portal scout | index.js:416 → runAllScouts(['indeed','job_portals']) |
| Weekly Sunday 7 AM SAR | Google Places scout | index.js:430 → runAllScouts(['google_places']) |
| Daily 10 AM SAR (7 AM UTC) | Auto-batch send to leads | index.js:444 → processBatch(10) |
| Daily 8:30 AM SAR (5:30 AM UTC) | Morning brief WhatsApp to admin | index.js:459 → sendMessage(adminPhone, brief) |

---

## 🤖 BOT.JS FLOW STATE MACHINE

### Booking Flow (8 Steps)
```
Step 0: Detect language (Arabic/English) — patient sends first message
Step 1: Ask for patient NAME
Step 2: Ask for TREATMENT TYPE (Cleaning, Fillings, Braces, Implant, etc.)
Step 3: Ask for DESCRIPTION / additional notes (voice note accepted)
Step 4: Show DOCTOR LIST → patient picks by number
Step 5: Confirm selected doctor (transition step)
Step 6: Ask for PREFERRED DATE (AI date parser via extractDate())
Step 7: Show AVAILABLE TIME SLOTS → patient picks number
        Logic: getSlots() from doctor_slots table
               Fallback: fixed schedule from doctor_schedules
               Validation: no booking within 1hr, no booking >30 days out
               Duplicate check: checkDuplicateBooking()
Step 8: CONFIRMATION
        Patient types 1/Yes/نعم
        → lockSlot() atomic lock in Postgres
        → saveAppointment() to appointments table
        → createCalendarEvent() via calendar.js (if enabled)
        → sendMessage() confirmation to patient
        → setTimeout 1min → sendMessage() to clinic staff
        → Reset patient flow to null
```

### Reschedule Flow (3 Steps)
```
Step 0: Find existing confirmed appointment
Step 1: Get new preferred date → show available slots
Step 2: Confirm new slot → releaseSlot(old) → lockSlot(new) → update appointment
```

### Cancel Flow (2 Steps)
```
Step 0: Find appointment → show details → ask to confirm
Step 1: Confirm cancel → releaseSlot() → updateAppointment(cancelled)
```

### Intent Routing (pre-flow)
```
detectIntent() → GPT-4o-mini function calling
Fast-paths: pure numbers during flow = continue_flow (no AI call)
            yes/no/arabic confirm = continue_flow (no AI call)
Intents: booking, prices, location, doctors, services, my_appointment,
         reschedule, cancel, human, reviews, greeting, help, change_language,
         continue_flow, unknown
Fallback: keywordFallback() (regex — no API cost)
```

---

## 💰 BUSINESS MODEL & PRICING

| Tier | Price | What's Included |
|---|---|---|
| Basic | SAR 299/month | AI receptionist, booking, reminders |
| Pro | SAR 499/month + SAR 699 setup | Everything + Google Calendar, Google Reviews, custom config |
| Growth Swarm | Custom | Full outreach engine for clinic owners |

**Payment:** Stripe (checkout.session.completed webhook → /growth/stripe-webhook → handoff.js → auto-activate)

---

## 🔑 ENVIRONMENT VARIABLES

```bash
# Core
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=eyJ...
OPENAI_KEY=sk-...              # Note: OPENAI_KEY not OPENAI_API_KEY

# Twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
WHATSAPP_PHONE_ID=whatsapp:+14155238886  # Same as above

# Admin
ADMIN_USER=admin
ADMIN_PASS=your_secure_password
ADMIN_PHONE=966570733834       # No + prefix, gets morning briefs

# Optional
GOOGLE_PLACES_API_KEY=...      # For Places scout
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NODE_ENV=production
PORT=3000                      # Render auto-injects
```

---

## ⚠️ CRITICAL RULES (Never Break These)

1. **NEVER reset patient flow arbitrarily** — always explicitly set: `current_flow: null, flow_step: 0, flow_data: {}`
2. **NEVER send English text unprompted** — always check `patient.language` ('ar' is default for Saudi)
3. **ALWAYS use `preferred_date_iso` (YYYY-MM-DD)** for cron, slot, calendar logic — not `preferred_date` (display string)
4. **NEVER rewrite atomic slot locking** — `slots.js` uses Postgres UPDATE...WHERE status='available' RETURNING *. This is the only safe pattern.
5. **NEVER expose Supabase keys in frontend** — dashboard uses /api/* proxy, never direct Supabase from React
6. **`dashboard/dist/` must be pre-built** — Render only runs `npm install`, not the Vite build

---

## 🐛 KNOWN ISSUES

| Issue | Severity | Location | Status |
|---|---|---|---|
| Dashboard build NOT automated on Render | High | render.yaml | Open |
| No-show detection uses UTC not Saudi TZ | Medium | index.js:295 | Open |
| `growth_leads_v2` has duplicate `last_contacted_at` column | Low | schema.sql:123,131 | Open |
| `db.js` uses Axios REST, `growth/` uses Supabase SDK — inconsistency | Low | db.js vs growth/ | Open |
| Cron jobs self-call localhost which may fail if PORT changes | Low | index.js cron section | Open |
| Basic auth on /growth/dashboard is HTTP Basic (no JWT) | Medium | growth/index.js | Open |
| `bot.js` is 103KB monolith — needs refactoring into modules | Medium | bot.js | Backlog |
| `/api/analytics` returns empty `{}` — not implemented | Low | api.js:161 | Backlog |

---

## 🔗 CONNECTION MAP (Who Calls Who)

```
HTTP Request
    │
index.js (Express)
    ├── /api/* → api.js → Supabase REST (Axios)
    ├── /growth/* → growth/index.js
    │       ├── brain.js → OpenAI GPT-4o-mini
    │       ├── sender.js → sendFollowUps()
    │       ├── handoff.js → db.js (insertPatient)
    │       ├── lib/autoVerify.js
    │       │       ├── lib/findWebsite.js → Google/Bing scrape
    │       │       ├── lib/classifyPhone.js
    │       │       └── lib/confidenceScore.js
    │       ├── lib/whatsappProvider.js → Twilio REST
    │       └── scouts/orchestrator.js
    │               ├── scouts/indeed.js → indeed.sa scrape
    │               ├── scouts/jobPortals.js → Bayt/Naukri scrape
    │               └── scouts/googlePlaces.js → Google Places API
    ├── /dashboard/* → dashboard/dist/ (static files)
    ├── / → public/index.html (static)
    ├── /webhook (POST) → bot.js:handleMessage()
    │       ├── ai.js:detectIntent() → OpenAI GPT-4o-mini
    │       ├── ai.js:extractDate() → OpenAI GPT-4o-mini
    │       ├── ai.js:extractTimeSlot() → OpenAI GPT-4o-mini
    │       ├── db.js → Supabase REST (Axios)
    │       ├── slots.js → Supabase REST (Axios) [atomic]
    │       ├── calendar.js → Google Calendar API
    │       ├── whatsapp.js → Twilio REST
    │       ├── audio.js → OpenAI Whisper API
    │       └── monitor.js → logError(), validateFlowState()
    └── Cron Jobs (node-cron)
            ├── → POST /send-reminders (self-call)
            ├── → POST /cleanup-slots (self-call)
            ├── → monitor.runPeriodicCheck() → whatsapp.js (if alert)
            ├── → POST /growth/send-followups (self-call)
            ├── → scouts/orchestrator.runAllScouts()
            └── → growth/sender.processBatch()
```

---

*Auto-generated by Antigravity AI — 2026-04-23*
*Next update: after next session*
