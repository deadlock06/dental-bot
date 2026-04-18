# Antigravity System: Master Infrastructure Report

This document is the final architectural and operational report for the **Antigravity (Growth Swarm)** module. Every component described here is now live and integrated within your repository.

---

## 📁 1. The Antigravity Folder Structure

The entire system resides in the `growth/` directory, designed for zero-interference with your existing dental bot.

```text
growth/
├── index.js           # The Main Hub: Express routes for Dashboard and APIs
├── brain.js           # The AI Writer: GPT-4o-mini message generator
├── sender.js          # The Courier: Batch message sender (Twilio/360dialog)
├── handoff.js         # The Bridge: Converts growth lead replies into Bot patients
├── ghost-room.html    # The Closer: High-conversion, high-aesthetics landing page
├── lib/               # 🧠 The Intelligence Layer
│   ├── smartParser.js     # Extracts data (name, phone, city) from raw text
│   ├── findWebsite.js     # Hunts for clinic websites and owner names
│   ├── classifyPhone.js   # Detects Saudi Mobile vs. Clinic Landline
│   ├── confidenceScore.js # LeadSync Algorithm (0-100 scoring)
│   ├── autoVerify.js      # Orchestrates the whole verification flow
│   ├── dedup.js           # Prevents double-messaging same clinic
│   └── whatsappProvider.js# Multi-provider routing (Twilio/360dialog)
└── scouts/            # 🔍 The Sourcing Layer
    └── indeed.js          # Automated RSS scraper for Indeed.sa dental jobs
```

---

## 🧠 2. Core Operational Modules

### The Verification Engine (`autoVerify.js`)
This is the "Brain" of the system. When a new lead is added, it triggers a chain reaction:
1.  **Parsing**: Extracts clinical data.
2.  **Scraping**: Attempts to find the site and the owner.
3.  **Scoring**: Decides if the lead is a "Go" (Score ≥ 70) or "Review" (Score 50-70).
4.  **Action**: If qualified, it automatically generates a personalized message and adds the **Ghost Room** URL.

### The Message Writer (`brain.js`)
Uses **GPT-4o-mini** to write short, human-sounding Arabic or English messages. It mentions the clinic name, city, and a specific "pain signal" (e.g., "I saw you are looking for a receptionist").

### The Closer (`ghost-room.html`)
A premium landing page that "shocks" the clinic owner by showing them an animated loss counter. 
*   **Stripe Integration**: Now includes a high-conversion button for the **299 SAR/month** recurring plan.

---

## 🚀 3. Live Workflows

### Scenario A: Zero-Friction Manual Add
You find a clinic address on Google Maps → Copy/Paste into `/growth/add-and-fire` → The system verifies them → If they have a mobile number and name, it messages them **instantly**.

### Scenario B: Automated Scouting
The **Indeed Scout** runs → Finds clinics with high reception pain → Adds them to the "Needs Review" list → You approve them in the dashboard with one click.

### Scenario C: The Sale
Lead replies to WhatsApp → `handoff.js` detects the reply → Creates a `patient` in the main bot → Starts the **Live Demo** → Lead clicks the Stripe link in the Ghost Room → **Account activates automatically via Webhook.**

---

## 🛡️ 4. Meta-Ban-Proof Infrastructure

- **Domain Isolation:** Growth activities happen on the Render URL, completely separate from your main dashboard.
- **Sandbox Shielding:** All initial outreach is via Twilio Sandbox. WhatsApp only sees "Template Messages" once the user engages.
- **Saudi Compliance:** The system follows Saudi phone patterns and avoids generic "spammy" links.
- **Stripe Automation:** Payments are verified via **Webhooks**, preventing manual bookkeeping errors.

---

## 🗺️ 5. Final "Go-Live" Setup

The system is now deployed. To maintain it:
1.  **Monitor Dashboard:** Regularly check `/growth/dashboard` to approve leads.
2.  **Stripe Webhook:** Ensure your Stripe Dashboard points to `https://your-app-url.com/growth/stripe-webhook`.
3.  **Add Leads:** Use the updated SQL `INSERT` for `growth_leads_v2` to keep the pipeline full.

**System Status (Updated 2026-04-18): 🚀 LIVE & DEPLOYED**
