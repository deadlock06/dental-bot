# 🚦 AGENT RULES — Sacred Laws For Every AI Working On Qudozen

> **If you are an AI agent, LLM, or assistant, read every rule here before writing any code.**
> Violating these rules will break the production system.

---

## 🔴 ABSOLUTE RULES (Never Break, No Exceptions)

### Rule 1: Patient Flow Reset Protocol
When a booking/reschedule/cancel flow completes OR fails, ALWAYS reset:
```javascript
await savePatient(phone, {
  ...patient,
  current_flow: null,
  flow_step: 0,
  flow_data: {}
});
```
**Never** leave a patient stuck in a flow state. **Never** partially reset.

### Rule 2: Language Default = Arabic
Saudi Arabia is the target market. Unless `patient.language === 'en'`:
- All user-facing messages = Arabic
- All WhatsApp confirmations = Arabic
- Always use the ternary pattern: `const msg = ar ? '...(arabic)' : '...(english)'`
- `ar` = `patient?.language === 'ar'`

### Rule 3: Date Storage = ISO Only
- `preferred_date` = human display string only ("Monday April 21, 2026") — display only
- `preferred_date_iso` = YYYY-MM-DD — USE THIS for all logic, cron, slot lookup, calendar
- Never compare dates using the display string
- Always use `ai.parseDateToISO()` to convert before storing

### Rule 4: Slot Locking = Postgres Only
- `slots.js` uses `UPDATE doctor_slots SET status='booked' WHERE status='available' RETURNING *`
- This is the ONLY safe concurrent booking pattern
- Do NOT write alternative slot locking inside `bot.js`
- Do NOT use JS memory locks (will fail across server restarts/multiple instances)

### Rule 5: Supabase Keys Never In Frontend
- Dashboard (`dashboard/src/`) MUST use `/api/*` proxy endpoints
- Never import Supabase client with service key in React components
- `useSupabase.ts` uses anon key only — service operations go through `api.js`

---

## 🟡 IMPORTANT RULES (Follow Unless Explicitly Told Otherwise)

### Rule 6: Timezone = Asia/Riyadh
- All time-sensitive logic (no-show detection, reminders, cron scheduling) should use Luxon
- `const { DateTime } = require('luxon')`
- `DateTime.now().setZone('Asia/Riyadh')`
- Not: `new Date()` alone (UTC will misfire at midnight Saudi time)

### Rule 7: Error Handling Pattern
All critical async operations should:
1. Be wrapped in try/catch
2. Log with format: `console.error('[Module] Action error:', err.message)`
3. Call `logError(component, err, context)` from monitor.js when in production paths
4. Never crash the server — catch and continue

### Rule 8: bot.js Is Append-Only (For Now)
- `bot.js` is 103KB and handles production traffic
- Do NOT refactor or restructure without explicit user approval
- Add new features by appending to existing patterns
- Always test new intent handling without breaking existing flows

### Rule 9: Check clinic.config Before Using Features
Features can be disabled per clinic. Always check:
```javascript
const canReschedule = clinic?.config?.features?.reschedule !== false;
const canCancel = clinic?.config?.features?.cancel !== false;
```

### Rule 10: Growth Swarm = Opt-Out Respecting
- Stop keywords: `['stop', 'unsubscribe', 'توقف', 'إلغاء', 'أرجو التوقف']`
- If detected, mark lead as `opted_out` and STOP all further contact immediately
- Never send follow-ups to opted_out leads

---

## 🟢 BEST PRACTICES (Strong Recommendations)

### Rule 11: Deployment Checklist
Before any deploy to Render:
1. `git add .` → `git commit -m "..."` → `git push origin main`
2. If dashboard changed: build first → `npm run build --prefix dashboard` → commit dist/
3. Check Render deployment succeeded at render.yaml service dashboard
4. Verify `/health` endpoint returns `{status: "healthy"}`
5. Send a test WhatsApp message through bot

### Rule 12: QUDOZEN_BRAIN Updates After Every Session
After completing any task:
1. Add entry to `EXECUTION_LOG.md`
2. Update `CURRENT_PLAN.md` with next steps
3. Update `STATUS.md` if anything deployed
4. Add any new ideas to `IDEAS_BACKLOG.md`

### Rule 13: Never Assume DB Schema
The schema evolves. If you need to know what columns exist:
```bash
# Run in scratch/check_tables.js or check schema.sql
```
Always cross-reference `schema.sql` before writing DB queries.

### Rule 14: Growth Dashboard Auth
`/growth/dashboard` uses HTTP Basic Auth.
Credentials from env: `ADMIN_USER` / `ADMIN_PASS`
Default fallback: `admin` / `password123` (CHANGE THIS IN PRODUCTION)

### Rule 15: Cron Self-Calls Use Localhost
Cron jobs call `http://localhost:${PORT}/send-reminders` etc.
If PORT changes or server runs differently, these will fail silently.
For debugging, you can POST to these endpoints directly via curl or Postman.

---

## 📋 QUICK REFERENCE: Where Things Live

| What you need | Where to find it |
|---|---|
| Bot conversation logic | `bot.js` |
| AI intent detection | `ai.js` → `detectIntent()` |
| Database queries | `db.js` |
| Slot booking/locking | `slots.js` |
| Sending WhatsApp | `whatsapp.js` → `sendMessage()` |
| Growth lead management | `growth/index.js` |
| Outreach message AI | `growth/brain.js` → `generateMessage()` |
| Lead verification | `growth/lib/autoVerify.js` |
| Scraping job boards | `growth/scouts/` |
| System health | `monitor.js` |
| Dashboard API | `api.js` |
| All cron jobs | `index.js` lines 367-495 |
| Database tables | `schema.sql` |
| Type definitions | `dashboard/src/types/index.ts` |

---

*These rules reflect hard-won production lessons. Respect them.*
*Last updated: 2026-04-23*
