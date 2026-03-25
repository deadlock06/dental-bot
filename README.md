# WhatsApp Dental Receptionist 🦷

A bilingual (Arabic/English) WhatsApp AI receptionist for dental clinics in Saudi Arabia.

## Setup Instructions

### Step 1 — Fill in your credentials
1. Copy `.env.example` to `.env`
2. Fill in all the values:
   - SUPABASE_URL — your Supabase project URL
   - SUPABASE_KEY — your Supabase anon key
   - WHATSAPP_TOKEN — your Meta WhatsApp access token
   - WHATSAPP_PHONE_ID — your Meta phone number ID
   - VERIFY_TOKEN — keep as "dental123" or change it
   - OPENAI_KEY — your OpenAI API key

### Step 2 — Install dependencies
```
npm install
```

### Step 3 — Run locally
```
npm run dev
```

### Step 4 — Deploy to Railway
1. Go to railway.app
2. Create new project
3. Connect your GitHub repo
4. Add all environment variables from .env
5. Deploy

### Step 5 — Connect WhatsApp
1. Copy your Railway URL (e.g. https://your-app.railway.app)
2. Go to Meta Developer Console → WhatsApp → Configuration
3. Set Callback URL to: https://your-app.railway.app/webhook
4. Set Verify Token to: dental123
5. Click Verify and Save
6. Subscribe to "messages" webhook field

## Project Structure
- `index.js` — Express server, webhook handler
- `bot.js` — Core conversation logic
- `db.js` — Supabase database helpers
- `whatsapp.js` — WhatsApp message sender
- `ai.js` — OpenAI intent detection

## Features
- Bilingual Arabic/English
- Full 6-step booking flow
- Saves to Supabase
- AI intent detection
- Menu number routing
- Status update filtering
