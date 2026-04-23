# 🖥️ STATUS — System Health Snapshot

> Last checked: 2026-04-23 19:05 (AST / UTC+3)
> Update this after every deploy or system change.

---

## 🚀 Deployment Status

| Component | Status | Notes |
|---|---|---|
| Render Web Service | ✅ Live | `deadlock06/dental-bot` repo, main branch |
| Node.js Server | ✅ Running | `node index.js`, port auto-injected by Render |
| Supabase DB | ✅ Connected | All tables created via schema.sql |
| Twilio WhatsApp | ✅ Active | Sandbox (for testing) / Production configured |
| OpenAI GPT-4o-mini | ✅ Connected | Intent detection + date extraction |
| Growth Dashboard | ✅ Live | `/growth/dashboard` — HTTP Basic Auth |
| React Dashboard | ⚠️ Unknown | `/dashboard` — may serve stale dist if not rebuilt |
| Public Landing Page | ✅ Live | `/` serves `public/index.html` |
| Ghost Room | ✅ Live | `/growth/ghost-room` |

---

## ⚠️ Known Active Issues

| Issue | Impact | Fix In |
|---|---|---|
| Dashboard not auto-built on Render | Medium — stale dashboard | CURRENT_PLAN Priority 1 |
| No-show detection uses UTC (not SAR) | Medium — may misfire at midnight | CURRENT_PLAN Priority 1 |
| `/api/analytics` returns `{}` | Low — analytics page empty | CURRENT_PLAN Priority 2 |
| Duplicate column in schema.sql | Low — documentation only | CURRENT_PLAN Priority 1 |

---

## 🔗 Live URLs (Render)

> Update these with your actual Render URL

| URL | What It Is |
|---|---|
| `https://[your-render-app].onrender.com/` | Landing page (qudozen.com) |
| `https://[your-render-app].onrender.com/health` | System health JSON |
| `https://[your-render-app].onrender.com/dashboard` | React admin dashboard |
| `https://[your-render-app].onrender.com/growth/dashboard` | Growth Swarm HTML dashboard |
| `https://[your-render-app].onrender.com/growth/ghost-room` | Ghost Room simulator |
| `https://[your-render-app].onrender.com/webhook` | Twilio webhook (POST only) |

---

## 📦 Current Tech Versions

```json
Node.js: >=20.0.0
express: ^4.18.0
@supabase/supabase-js: ^2.101.1
twilio: ^5.13.1
openai: ^6.34.0
helmet: ^8.1.0
luxon: ^3.7.2
node-cron: ^4.2.1
axios: ^1.15.0
googleapis: ^171.4.0
stripe: ^22.0.2
cheerio: ^1.2.0
```

---

## 🔐 Environment Variables Status

| Variable | Required | Set? |
|---|---|---|
| SUPABASE_URL | Yes | ✅ (set in Render) |
| SUPABASE_KEY | Yes | ✅ (set in Render) |
| OPENAI_KEY | Yes | ✅ (set in Render) |
| TWILIO_ACCOUNT_SID | Yes | ✅ (set in Render) |
| TWILIO_AUTH_TOKEN | Yes | ✅ (set in Render) |
| TWILIO_WHATSAPP_FROM | Yes | ✅ (set in Render) |
| WHATSAPP_PHONE_ID | Yes | ✅ (set in Render) |
| ADMIN_USER | Yes | ✅ (set in Render) |
| ADMIN_PASS | Yes | ✅ (set in Render) |
| ADMIN_PHONE | Yes | ✅ (0570733834) |
| GOOGLE_PLACES_API_KEY | Optional | ❓ Check Render |
| STRIPE_SECRET_KEY | Optional | ❓ Check Render |
| STRIPE_WEBHOOK_SECRET | Optional | ❓ Check Render |
| NODE_ENV | Auto | ✅ production (Render injects) |
| PORT | Auto | ✅ (Render injects) |

---

## 📊 Last Known DB Stats

| Table | Approx Rows | Notes |
|---|---|---|
| patients | Unknown | Reset at flow completion |
| clinics | Unknown | At least 1 active |
| appointments | Unknown | Growing |
| doctor_schedules | Unknown | Per clinic |
| doctor_slots | Unknown | Cleaned hourly |
| growth_leads_v2 | Unknown | Main pipeline |
| message_logs | Unknown | Twilio delivery tracking |

---

## 🔄 Cron Jobs Status

| Job | Last Run | Status |
|---|---|---|
| 30-min reminders | Running | ✅ Active |
| Hourly slot cleanup | Running | ✅ Active |
| 10-min health check | Running | ✅ Active |
| Daily follow-ups (9AM SAR) | Daily | ✅ Active |
| Job portal scout (6h) | Every 6h | ✅ Active |
| Google Places scout (weekly) | Sundays | ✅ Active |
| Auto-batch send (10AM SAR) | Daily | ✅ Active |
| Morning brief (8:30AM SAR) | Daily | ✅ Active |

---

*Update this file after every deploy*
*Last updated: 2026-04-23 by Antigravity AI*
