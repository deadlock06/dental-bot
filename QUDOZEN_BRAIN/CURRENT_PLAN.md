# 📅 CURRENT PLAN — What We're Working On Right Now

> **This is the active work plan. Update this after every session.**
> Any AI agent starting work should read this FIRST to know the priority.

---

## 🎯 Current Sprint Goal
**Stabilize production deployment + fix known critical issues + set up living knowledge system**

---

## ✅ Completed This Session (2026-04-23)

- [x] Created `QUDOZEN_BRAIN/` knowledge system folder
- [x] Wrote `MASTER_CONTEXT.md` — complete file map, DB schema, routes, bot flow
- [x] Wrote `AGENT_RULES.md` — sacred production rules
- [x] Wrote `CURRENT_PLAN.md` (this file)
- [x] Wrote `EXECUTION_LOG.md` — session history
- [x] Wrote `IDEAS_BACKLOG.md` — future ideas
- [x] Wrote `STATUS.md` — system health snapshot
- [x] Diagnosed Render deployment issue (wrong file served → cause: Render had not redeployed latest commit)

---

## 🔥 Priority 1: Critical Fixes (Do These Next)

### Fix 1: Render Dashboard Build
**Problem:** `render.yaml` only runs `npm install` — the React dashboard (`dashboard/dist/`) is never rebuilt on Render  
**Fix:** Update `render.yaml` build command:
```yaml
buildCommand: npm install && npm install --prefix dashboard && npm run build --prefix dashboard
```
**Files:** `render.yaml`  
**Risk:** Low — adds 2-3 min to build time  
**Status:** Open

### Fix 2: No-Show Detection Timezone
**Problem:** No-show detection (index.js:295) compares times using `new Date()` (UTC) not Saudi time (UTC+3)  
**Fix:** Use Luxon:
```javascript
const { DateTime } = require('luxon');
const now = DateTime.now().setZone('Asia/Riyadh');
```
**Files:** `index.js` (no-show section ~line 295)  
**Risk:** Medium — touches production reminder logic  
**Status:** Open

### Fix 3: Duplicate Column in Schema
**Problem:** `growth_leads_v2` has `last_contacted_at` declared twice (lines 123 and 131)  
**Fix:** Run in Supabase SQL editor (column already exists, just fix schema.sql doc):
```sql
-- Remove the duplicate line 131 in schema.sql
```
**Files:** `schema.sql`  
**Risk:** Low — schema.sql is documentation, actual DB may already be correct  
**Status:** Open

---

## 🟡 Priority 2: Improvements (Next Sprint)

### Improve 1: Analytics Page
**Problem:** `/api/analytics` returns empty `{}` — the Analytics page in the dashboard has no data  
**Fix:** Implement real analytics queries (appointments trend, revenue, treatment breakdown)  
**Files:** `api.js`, `dashboard/src/pages/Analytics.tsx`

### Improve 2: Dashboard JWT Auth
**Problem:** Growth dashboard uses HTTP Basic Auth (weak)  
**Fix:** Implement proper JWT tokens with expiry for `/growth/dashboard`  
**Files:** `growth/index.js`

### Improve 3: bot.js Modularization
**Problem:** `bot.js` is 103KB single file — hard to maintain  
**Fix:** Split into `bot-booking.js`, `bot-reschedule.js`, `bot-cancel.js`, `bot-intent.js`  
**Risk:** High — needs full regression test after refactor

---

## 🔵 Priority 3: New Features (Backlog)

See `IDEAS_BACKLOG.md` for all ideas ranked by impact.

Top 3 from backlog:
1. **Multi-vertical expansion** — Real estate, medical clinics, restaurants
2. **Stripe subscription management** — Pause, upgrade, cancel from dashboard
3. **Live dashboard metrics** — Real-time WebSocket updates for appointment feed

---

## 📌 Standing Constraints
- Always keep bot in Arabic-first mode
- All date logic uses `preferred_date_iso` (YYYY-MM-DD)
- Never touch `slots.js` atomic locking mechanism
- `dashboard/dist/` must be committed if Render build not updated

---

*Last updated: 2026-04-23 by Antigravity AI*
*Next update: After Priority 1 fixes are complete*
