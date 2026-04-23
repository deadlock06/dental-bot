# 💡 IDEAS BACKLOG — Future Plans & New Ideas

> Capture every idea here as it arrives. Don't lose any idea.
> When an idea is approved and work starts, move it to CURRENT_PLAN.md
> When done, log it in EXECUTION_LOG.md

---

## How To Add An Idea
Just add a new entry at the TOP under the right priority. Include:
- What it is
- Why it matters
- Rough effort (Small/Medium/Large)
- Any dependencies

---

## 🔥 High Impact Ideas

### Idea: Multi-Vertical Expansion
**What:** Package the bot for real estate, restaurants, medical clinics, law firms — not just dental  
**Why:** 10x TAM. The bot.js is already vertically agnostic (services/doctors/clinics are all config)  
**Effort:** Medium — mainly update AI prompts, services list, and landing page messaging  
**Status:** Identified (not started)  
**Added:** 2026-04-23

### Idea: Stripe Subscription Portal
**What:** Let clinic owners manage their subscription (pause, upgrade, cancel) from the dashboard without calling anyone  
**Why:** Reduces churn friction, self-serve SaaS  
**Effort:** Medium — Stripe Customer Portal integration  
**Status:** Identified (not started)  
**Added:** 2026-04-23

### Idea: Real-Time Dashboard (WebSocket)
**What:** Live feed of appointments, bot conversations, and alerts without page refresh  
**Why:** Clinic staff need instant notifications — current dashboard requires manual refresh  
**Effort:** Large — needs WebSocket server + React state management  
**Status:** Identified (not started)  
**Added:** 2026-04-23

### Idea: Bot Simulator as Sales Tool
**What:** Make the `public/index.html` simulator actually call the real bot API (not mocked)  
**Why:** Live demo = highest conversion. Prospects can book a real test appointment  
**Effort:** Medium — connect simulator to /webhook-demo or sandbox Twilio  
**Status:** Was discussed in April sessions, partially built  
**Added:** 2026-04-23

---

## 🟡 Medium Impact Ideas

### Idea: Analytics Implementation
**What:** Implement the `/api/analytics` endpoint with real data  
**Charts needed:** Appointments trend (7d/30d/90d), Revenue by week, Treatment breakdown, Peak hours, No-show rate trend  
**Effort:** Small — data is already in Supabase, just need the aggregation queries  
**Status:** Identified (not started)  
**Added:** 2026-04-23

### Idea: Multi-Language Growth Messages
**What:** Growth Swarm cold messages are Arabic-only. Add English for UAE/Kuwait/Bahrain clinics  
**Effort:** Small — update brain.js prompt  
**Status:** Identified (not started)  
**Added:** 2026-04-23

### Idea: Voice Note Replies
**What:** Let the bot also reply with voice notes (text-to-speech via OpenAI TTS)  
**Why:** More human feel for Saudi patients who prefer voice  
**Effort:** Medium — OpenAI TTS + Twilio media message  
**Status:** Identified (not started)  
**Added:** 2026-04-23

### Idea: Morning Brief to Clinic Owner (Not Just Admin)
**What:** Each clinic owner gets their own daily brief via WhatsApp — not just the admin  
**Effort:** Small — already have the cron, just personalize per clinic  
**Status:** Identified (not started)  
**Added:** 2026-04-23

### Idea: Appointment Waitlist
**What:** If a time slot is full, patient goes to waitlist. When slot opens, bot auto-notifies  
**Effort:** Medium — new DB table + waitlist notification cron  
**Status:** Identified (not started)  
**Added:** 2026-04-23

### Idea: Patient Review Automation
**What:** After completed appointment, automatically send Google Review link in follow-up  
**Why:** Reviews = social proof = more clinic clients  
**Effort:** Small — already have follow-up flow, just enhance the message  
**Status:** Partially done (follow_up_sent already triggers review link)  
**Added:** 2026-04-23

---

## 🔵 Low Impact / Future Ideas

### Idea: bot.js Refactoring
**What:** Split `bot.js` (103KB) into: `bot-booking.js`, `bot-reschedule.js`, `bot-cancel.js`, `bot-intent.js`, `bot-main.js`  
**Why:** Maintainability  
**Effort:** Large — high risk of regression  
**Constraint:** Full test suite needed first  
**Status:** Backlog  
**Added:** 2026-04-23

### Idea: JWT Auth for Growth Dashboard
**What:** Replace HTTP Basic Auth with proper JWT tokens (30-day expiry, refresh)  
**Effort:** Small  
**Status:** Backlog  
**Added:** 2026-04-23

### Idea: Supabase SDK Unification
**What:** Replace `db.js` Axios REST calls with the Supabase SDK (matching what `growth/` uses)  
**Why:** Consistency, better error handling, PostgREST upgrade resilience  
**Effort:** Medium  
**Status:** Backlog  
**Added:** 2026-04-23

### Idea: Bot Personality Customization Per Clinic
**What:** Each clinic can set their bot's name, personality, and tone via dashboard  
**Current:** Bot name "Jake" is hardcoded in some reminders  
**Effort:** Medium  
**Status:** Backlog  
**Added:** 2026-04-23

### Idea: Qudozen Mobile App (React Native)
**What:** Admin app for clinic owners — manage appointments on mobile  
**Effort:** Large  
**Status:** Very future  
**Added:** 2026-04-23

---

## ✅ Ideas That Were Completed (Archive)

### ~~Ghost Room Loss Simulator~~  ✅ Done
Was a backlog idea, now live at `/growth/ghost-room`

### ~~Growth Swarm Automated Scouting~~ ✅ Done  
Indeed + Google Places scouts are live with cron scheduling

### ~~Stripe Payment Integration~~ ✅ Done  
Webhook live at `/growth/stripe-webhook`

### ~~Multi-doctor Support~~ ✅ Done  
`doctor_schedules` + `doctor_slots` tables live

### ~~Voice Note Support~~ ✅ Done  
Audio transcription via Whisper in `audio.js`

---

*Last updated: 2026-04-23*
*Add ideas at the top of the relevant priority section*
