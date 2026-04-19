# Qudozen Universal Healthcare AOS 🌐

A fully autonomous operating system (AOS) for healthcare facilities in Saudi Arabia, built with Node.js, Express, and React. It operates as a 24/7 intelligent receptionist, handling patient inquiries, booking dynamics, and proactive outreach via WhatsApp.

## 🚀 System Components

- **Layer 1 (Reception):** Handles incoming WhatsApp chats, answers queries in <3s, and books appointments using Twilio logic in `bot.js`.
- **Layer 2 (Coordination):** Resolves scheduling conflicts via `slots.js` and strict capacity locking in Supabase.
- **Layer 3 (Evolution):** Tracks drop-offs natively and analyzes operational health.
- **Self-Healing Agent (`monitor.js`):** Continuously checks database latency, auto-recovers stuck patient flows, and alerts the admin.
- **Growth Swarm (`growth/`):** Autonomous outreach protocols and the "Ghost Room" dashboard for tracking uncaptured value (`/growth/dashboard`).

## 🛠️ Tech Stack & Hosting

- **Backend:** Node.js, Express.js
- **Database:** Supabase (PostgreSQL with RLS)
- **AI Integrations:** OpenAI (gpt-4o-mini)
- **Messaging:** Twilio WhatsApp API
- **Deployment:** Render (Live at `https://qudozen.com`)

## 🔑 Environment Variables required in `.env`:
`SUPABASE_URL`, `SUPABASE_KEY`, `OPENAI_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `ADMIN_PHONE`

## 🏁 How to Run Locally

1. `npm install`
2. Configure `.env` variables
3. `npm run dev`
4. Access the UI at `http://localhost:3000` and Dashboard at `http://localhost:3000/growth/dashboard`

## 🩺 System Reality Check

To manually test the system pulse, trigger the health-check endpoint:
`curl https://qudozen.com/health`

*© 2026 Qudozen. All Rights Reserved.*
