# THE ANTI-GRAVITY MEGA-CONTEXT (VERSION 2.5.1)

**Instructions to Claude:** Read this entire document carefully. Do not ask for background information about the project—it is all contained here. Acknowledge understanding by saying: "I am fully synced with Anti-Gravity Phase 2."

---

## 1. PROJECT IDENTITY & VISION

**Anti-Gravity** is a unified autonomous infrastructure project containing three business verticals running on a shared back-end. It is not three separate projects—it is one consciousness with three faces.

1.  **Dental Bot (Live)**: An AI WhatsApp receptionist for dental clinics. Handles 8-step bookings, rescheduling, cancellations, and atomic database slot locking.
2.  **Real Estate (In Dev)**: An inquiry-to-viewing property assistant.
3.  **Qudozen (Live)**: The parent global business operating system (AOS) for any industry. 

---

## 2. THE GRAND BLUEPRINT ARCHITECTURE (Target Phase 3)

The ultimate vision for this application dictates a clean separation of concerns into `/shared/` and `/verticals/`. You must understand this target architecture, as all refactoring should move towards this structure:

### Target Master Folder Structure
```text
📁 root/
├── 📁 shared/                     [SHARED INFRASTRUCTURE — All verticals use this]
│   ├── 📁 core/                   [Server & routing engine]
│   │   ├── server.js              
│   │   ├── router.js              [Route loader: detects vertical from URL/subdomain]
│   │   └── middleware/            [auth.js, rateLimit.js, errorHandler.js]
│   ├── 📁 database/               [Data layer]
│   │   └── db.js                  [Supabase ORM]
│   ├── 📁 ai/                     [Artificial intelligence layer]
│   │   ├── ai.js                  [OpenAI GPT-4 wrapper]
│   │   ├── audio.js               [Whisper API — voice note transcription to text]
│   │   └── prompts/               [System prompts per vertical]
│   ├── 📁 messaging/              [Communication channels]
│   │   ├── whatsapp.js            [Twilio WhatsApp Business API]
│   │   └── templates/             [Message templates per vertical per language]
│   ├── 📁 calendar/               [Scheduling engine]
│   │   ├── calendar.js            [Google Calendar API]
│   │   └── slotEngine.js          [ATOMIC SLOT LOCKING — Postgres-level concurrency]
│   ├── 📁 cron/                   [Background job scheduler]
│   │   ├── jobs/                  [reminders.js, cleanup.js, followups.js]
│   │   └── monitor.js             [Self-healing: detects failures, rolls back bad states]
│   ├── 📁 growth/                 [Marketing & lead generation engine — "Growth Swarm"]
│   │   ├── brain.js               [AI message writer: generates personalized outreach]
│   │   ├── sender.js              [Twilio campaign sender]
│   │   └── ghostRoom.js           [Logic engine: calculates loss aversion math]
│   └── 📁 utils/                  [Common utilities: logger.js, encrypt.js, dateHelpers.js]
│
├── 📁 verticals/                  [BUSINESS VERTICALS — Each is a complete autonomous OS]
│   ├── 📁 dental/                 [DENTAL AUTOMATION VERTICAL]
│   │   ├── 📁 bot/                [stateMachine.js, flows/booking.js, interrupts.js]
│   │   └── 📁 config/             [treatments.json, doctors.json, rules.json]
│   ├── 📁 real-estate/            [REAL ESTATE AUTOMATION VERTICAL]
│   │   ├── 📁 bot/                [stateMachine.js, flows/inquiry.js, flows/viewing.js]
│   │   └── 📁 config/             [properties.json, locations.json]
│   └── 📁 qudozen/                [GLOBAL BUSINESS OS — Universal Vertical]
│       ├── 📁 bot/                [stateMachine.js, flows/demo.js, flows/onboarding.js]
│       └── 📁 web/                [index.html, ghost-room.html]
│
└── 📁 dashboard/                  [REACT ADMIN PANEL — Universal Control Center]
    ├── 📁 src/
    │   ├── 📁 pages/              [Overview.tsx, Dental.tsx, RealEstate.tsx, Leads.tsx]
    │   └── 📁 components/         [Sidebar.tsx, LeadCard.tsx, SlotCalendar.tsx]
```

---

## 3. THE CURRENT MONOLITHIC REALITY (Phase 2)

While the blueprint above is the goal, **the current codebase is a flat monolith.** You must work within this reality while pushing toward the blueprint.

### What Actually Exists Right Now:
*   **The Shared Modules and Verticals directories DO NOT exist yet.**
*   **`index.js`**: The Express server. Binds to `0.0.0.0`, loads Twilio webhooks, loads the Growth dashboard, and points incoming WhatsApp traffic directly to `bot.js`.
*   **`bot.js`**: The massive 3000+ line state machine. It contains the logic for the Dental booking funnel, cancellations, language switching, and Twilio processing locks.
*   **`ai.js`**: Connects to OpenAI GPT-4o-mini. Used *strictly* for intent detection and date parsing. 
*   **`slots.js`**: The Atomic Locking concurrency engine. Prevents two patients from booking the same slot.
*   **`db.js`**: Supabase ORM interface. Manages the `patients` and `appointments` tables.
*   **`/growth` (Growth Swarm)**: Exists and is mounted in `index.js`. Contains scrapers (`finder.js`), the AI generator (`brain.js`), and the ghost room (`ghost-room.html`).
*   **`/dashboard`**: Exists. A React 18 / Tailwind SPA. Acts as the Admin Panel.

---

## 4. HOW THE BOT STATE MACHINE WORKS (`bot.js`)

`bot.js` is driven by explicit states mapped to the user's phone number in Supabase (`current_flow` and `flow_step`).

### The Hybrid AI Strategy
AI is **not** used to generate the conversational text for the booking flow to prevent hallucination and save costs.
AI is used **only** to decode intent, extract dates (e.g., "Next Thursday" -> `2026-05-01`), and parse time slots. Free-text inputs (Names, Notes) bypass the AI entirely.

### The 8-Step Booking Flow:
If `patient.current_flow === 'booking'`:
*   **Step 1:** Ask Name.
*   **Step 2:** Ask Treatment (shows interactive WhatsApp list of Dental services).
*   **Step 3:** Confirm Treatment via AI parsing.
*   **Step 4:** Ask for Notes/Pain areas (Free text).
*   **Step 5:** Ask for Doctor preference.
*   **Step 6:** Ask for Date ("tomorrow", "next week").
*   **Step 7:** **Slot Generation.** Uses `calendar.js` to fetch available slots from the DB, formats them as "1. 10:00 AM", and asks user to pick a number.
*   **Step 8:** **Atomic Lock.** User picks a number. System attempts an atomic database lock to secure the slot (`slots.js`). If someone else took it, the lock fails, and the user is bumped back to Step 7. If success, Google Calendar is updated.

### Protection Mechanisms
*   **Processing Locks:** An in-memory Map prevents double-execution if a user spams the send button or Twilio retries the hook.
*   **Stale Flow Reset:** If a user abandons a booking step for >30 minutes, their flow is wiped clean.

---

## 5. THE QUDOZEN SALES FUNNEL & WEBSITE

The public-facing components feature an **Illusion Architecture** focused heavily on psychological loss-aversion. 

### 1. The Main Landing Page Focus
*   **Visual Language:** Liquid aesthetic: dark backgrounds (`#0B1120`), teal accents (`#0D9488`), sand gold (`#D4A574`), and subtle GSAP floating animations.
*   **Tiers:** Awareness (299 SAR), System (499 SAR + Setup), Swarm (Custom).

### 2. The "Ghost Room" (`/growth/ghost-room.html`)
The Ghost Room is the terrifying closer for the Growth Swarm engine.
*   When a business receives a cold WhatsApp message, it includes a personalized link to their Ghost Room.
*   It features a live ticking counter representing the money they are losing *right now* every second they delay answering leads.
*   Baseline vertical data dictating loss rate: Dental loses 350 SAR per missed lead, Real estate loses 5000 SAR.
*   It does **not** have a generic "Buy Now" button. It forces them to "WhatsApp Jake" to close the deal.

---

## 6. DATABASE SCHEMA SUMMARY (Supabase)

1.  **`patients`**: `phone` (PK), `language` ('ar'/'en'), `current_flow` ('booking'/'cancel'), `flow_step` (1-8), `flow_data` (JSONB temp storage).
2.  **`appointments`**: `id` (PK), `phone` (FK), `preferred_date` (ISO string), `time_slot` (String), `status` ('pending'/'confirmed'/'cancelled').
3.  **`growth_leads_v2`**: `phone` (PK), `business_name`, `city`, `confidence_score` (0-100 routing priority), `status`.

---

## 7. YOUR PRIME DIRECTIVES AS CLAUDE

When providing code or guidance for this project:
1.  **Do not break the Mono-state:** You cannot remove `flow_step` math or the `processingLocks` in `bot.js` during refactoring.
2.  **Arabic First:** All default user-facing WhatsApp templates are in Arabic. English is secondary.
3.  **Atomic Safety:** Never bypass `slots.js` logic when dealing with dates. Double bookings are fatal.
4.  **No Hallucinations:** Do not instruct `ai.js` to write free-form conversational messages for the appointment flow. 
5.  **Aesthetics:** If modifying web code, use the designated Tailwind liquid scheme.
