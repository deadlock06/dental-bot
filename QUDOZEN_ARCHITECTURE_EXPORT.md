# The Ultimate Dental Bot & Qudozen Master Architecture Export

This document contains the complete context, system architectures, and critical logic maps for the **Entire Dental Bot System** alongside its associated marketing engine (**Qudozen Growth Swarm**).

**Instruction for Kimi:** You are receiving the exact, finalized state of the complete application. This is a complex, transactional Node.js application containing an autonomous WhatsApp receptionist integrated with Google Calendar, Supabase, and dynamic Twilio communications. Use this document deeply before writing any new code.

---

## 📂 1. Master File Tree

```text
📁 Root Directory
├── index.js                  (Main Express Entry, Twilio Webhook, Cron Jobs)
├── bot.js                    (Core Controller: WhatsApp State Machine, AI Rules, Routing)
├── db.js                     (Supabase ORM: Models for Patients, Appointments, Clinics)
├── slots.js                  (Atomic Slot Lock Mechanism for concurrency control)
├── monitor.js                (System telemetry, health checking, state-rollback tools)
├── calendar.js               (Google Calendar API Integration)
├── audio.js / ai.js          (Whisper audio transcription / OpenAI intent parsing)
├── whatsapp.js               (Twilio messaging abstractions)
├── schema.sql                (Master Database Schema)
│
├── 📁 public/                (Qudozen Master Sales Funnel UI)
│   └── index.html            
│
├── 📁 growth/                (The Qudozen "Growth Swarm" Engine)
│   ├── index.js              (Express Router for /growth)
│   ├── brain.js              (AI Lead Processing, Ghost Room mapping)
│   ├── handoff.js            (Intent detection & human routing)
│   ├── sender.js             (Follow-up Drip Campaigns)
│   └── ghost-room.html       (Interactive Landing Page for clinics)
│
└── 📁 dashboard/             (React Admin Panel for Clinic Management)
    └── src/
        ├── App.tsx
        ├── pages/            (Dashboard, Clinics, Doctors, Leads, Appointments)
        └── components/
```

---

## 🤖 2. The Dental Bot Architecture (`bot.js`)

The `bot.js` file is the brain of the receptionist. It operates as a state machine tied to the patient's phone number.

### State Machine Flow (`flow_data`)
When a user initiates the booking intention (`intent === 'booking'`), they are routed into an 8-step flow. The state is saved in the `patients` table under `flow_step` and `flow_data`.

1. **Step 1:** Ask for Patient Name.
2. **Step 2:** Ask for Treatment Type (Cleaning, Fillings, Braces, etc.).
3. **Step 3:** Ask for Appointment Description/Notes (or voice note).
4. **Step 4:** Ask to Select a Doctor (shows available doctors from the DB).
5. **Step 5:** Display the selected doctor (Transition step).
6. **Step 6:** Ask for Preferred Date (`extractDate` AI parser).
7. **Step 7:** Display Available Time Slots. 
   - *Logic:* Fetches `doctor_slots` from `slots.js`. If none exist, falls back to fixed schedule.
   - *Logic:* Validates limits (e.g., cannot book within 1 hr or beyond 30 days).
   - *Logic:* Validates duplicates (`checkDuplicateBooking`).
8. **Step 8:** Confirmation Phase.
   - Requires patient to explicitly confirm (1/Yes).
   - **Critical Path:** Calls `bookSlot` atomic lock → saves appointment to DB → pushes event to Google Calendar (`calendar.js`) → fires WhatsApp confirmation.

### Universal Commands (Interrupts)
*   **Reschedule/Cancel:** The bot checks `cl.config.features` limits, extracts the existing appointment, and drops the user into a dedicated 3-step Reschedule or Cancel flow.
*   **Language Switching:** Typing "English" or "عربي" resets the flow and flips `patient.language`. **Saudi Arabic (RTL)** is the default design language for all outputs.

---

## 🔗 3. Sub-Systems & Database Mechanisms

### A. Atomic Locking (`slots.js`)
*   **Problem:** Two users clicking "4:00 PM" at the exact same millisecond.
*   **Solution:** `slots.js` bypasses `bot.js` memory and makes raw Supabase RPC calls. It uses a `UPDATE ... WHERE status = 'available' RETURNING *` loop to guarantee sequence exclusivity. If the slot is taken, the bot throws the user back to Step 7.

### B. The Cron Hub (`index.js`)
The `index.js` server uses `node-cron` for asynchronous task execution:
1.  **30-Min Reminders:** Scans `appointments` for `preferred_date_iso` matching tomorrow (`reminder_sent_24h`) and today within 1 hour (`reminder_sent_1h`).
2.  **Follow-ups:** Daily checks for yesterday's completed appointments to ask for Google Reviews.
3.  **No-Show Watcher:** Checks if a confirmed appointment has passed by 2 hours. If yes, marks as NO-SHOW and automatically releases the locked slot logic.

### C. The Webhook Processor (`index.js` route)
*   Receives `POST /webhook` from Twilio.
*   Parses images/audio payloads (`NumMedia > 0`). If Audio, routes to Whisper API before passing text to `bot.js`.
*   Passes data to `monitor.js` processing locks to prevent double-firings from Twilio retry loops.

---

## 🗄️ 4. Core Database Schema (Supabase)

*   **`clinics`**: 
    - `id`, `name`, `whatsapp_number`, `staff_phone`, `plan` (basic/pro), `config` (JSON map of disabled features like cancel/reschedule bounds), `google_calendar_id`.
*   **`doctors`**: 
    - `id`, `clinic_id`, `name`, `name_ar`, `specialty`, `specialty_ar`, `is_active`.
*   **`patients`**: 
    - `phone` (Primary Key), `language` (ar/en), `current_flow` (booking/reschedule/cancel), `flow_step` (int), `flow_data` (JSON of booking draft).
*   **`doctor_slots`**: 
    - `id`, `clinic_id`, `doctor_id`, `slot_date` (ISO), `slot_time`, `status` (available/booked), `patient_phone`.
*   **`appointments`**: 
    - `id`, `clinic_id`, `phone`, `name`, `doctor_name`, `treatment`, `preferred_date_iso`, `time_slot`, `status` (confirmed/cancelled/no-show/completed), `calendar_event_id`, flags for reminders.

---

## 🚀 5. Development Constraints for Kimi

If you modify anything on this architecture, follow these rules or the system will break:

1. **Never alter `patient` flow resets arbitrarily:** When an appointment finishes (Step 8) or fails, the patient must be completely wiped from the memory flow (`await savePatient(phone, { ...patient, current_flow: null, flow_step: 0, flow_data: {} });`) so they can trigger the main menu again.
2. **Never send English text unprompted:** The target market is Saudi Arabia. If a string is hardcoded, it must have an explicit Arabic (`? ar : en`) fallback logic based on `patient.language`.
3. **Handle ISO Dates Religiously:** In the database, `preferred_date` is a human-readable display string. You **must** rely on `preferred_date_iso` formatting (`YYYY-MM-DD`) for Cron logic, slot lookups, and Calendar bindings.
4. **Don't touch the atomic lock logic:** `slots.js` is perfectly scoped using Postgres-level guarantees. Do not write alternative locking mechanisms inside `bot.js`.
