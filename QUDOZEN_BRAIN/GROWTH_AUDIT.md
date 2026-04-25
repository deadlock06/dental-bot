# 🔬 GROWTH SWARM 3.0 — Full Architecture Audit
**Conducted:** 2026-04-25 02:57 KSA  
**Auditor:** Antigravity AI  
**Verdict:** ⚠️ MOSTLY SOLID — 4 Critical Issues Found, 6 Minor Issues

---

## 🗺️ Architecture Map

```
INBOUND (Twilio Webhook POST /webhook)
  │
  ├─── OPT-OUT check (stopKeywords) ──────────────────────► gs_leads.status = opted_out
  │                                                          gs_sequences.is_paused = true
  │
  ├─── GS 3.0 Route: gs_leads match? ─────────────────────► state-machine.js
  │     └── handleInboundMessage()                            ├── classifyIntent() [conversation.js]
  │           ├── Log to gs_conversations                    ├── OPTED_OUT → gs_leads update + feedback log
  │           ├── Pause gs_sequences                         ├── HANDED_OFF → handoff.js → admin WA alert
  │           ├── Fetch history (last 5)                     ├── ENGAGED/OBJECTION → generateResponse() + send
  │           └── Classify intent via OpenAI                 └── (no COLD_LEAD case — GAP!)
  │
  └─── Legacy V2 Route: growth_leads_v2 match? ───────────► handoff.js (legacy handoff)
        └── handoffLead()

OUTBOUND (Scout → Verify → Message → Nurture)
  │
  ├── SCOUTS (growth/scouts/)
  │     ├── indeed.js (job postings)
  │     ├── jobPortals.js (Bayt, Naukri-SA, Tanqeeb)
  │     ├── googlePlaces.js (clinic finder via Google API)
  │     └── orchestrator.js (coordinates all scouts)
  │
  ├── ZERO-FRICTION: POST /growth/add-and-fire
  │     ├── parseRawInput() [lib/smartParser.js]
  │     ├── checkDuplicate() [lib/dedup.js]
  │     ├── autoVerify() [lib/autoVerify.js]
  │     ├── generateMessage() [brain.js]
  │     └── sendWhatsApp() [lib/whatsappProvider.js]
  │           └── startSequence() [nurture.js] ──────────────► gs_sequences INSERT
  │
  ├── NURTURE ENGINE (processSequences)
  │     ├── Reads gs_sequences WHERE is_paused=false AND is_completed=false AND next_send_at<=NOW
  │     ├── Generates follow-up via OpenAI (2-step max)
  │     └── Sends via sendWhatsApp() → logs gs_conversations → updates gs_sequences
  │
  └── CRON JOBS (node-cron in index.js)
        ├── */30 * * * *  → /send-reminders (patient appointments)
        ├── 0 * * * *     → /cleanup-slots (release past booked slots)
        ├── */10 * * * *  → health check (monitor.js)
        ├── 0 6 * * *     → /growth/send-followups (daily 9AM SAR)
        ├── 0 */6 * * *   → job portal scout (every 6h)
        ├── 0 4 * * 0     → Google Places scout (weekly Sunday)
        ├── 0 7 * * *     → auto-batch send (daily 10AM SAR)
        └── 30 5 * * *    → morning brief to admin (08:30 SAR)

DASHBOARD
  ├── GET /growth/dashboard (jwtAuth) — HTML table of growth_leads_v2
  ├── GET /growth/api/leads (jwtAuth) — gs_leads JSON
  ├── GET /growth/api/conversations (jwtAuth) — gs_conversations JSON
  ├── GET /growth/api/analytics (jwtAuth) — aggregated stats
  └── GET /growth/api/queue (jwtAuth) — pending sequences

PAYMENT
  └── POST /growth/stripe-webhook → update growth_leads_v2 + handoffLead()

SECURITY
  └── JWT auth cookie ('growth_token') on all dashboard routes
      ├── 24h expiry
      └── ADMIN_USER/ADMIN_PASS from env vars
```

---

## ✅ What's Working Perfectly

| Component | Status | Notes |
|---|---|---|
| Twilio webhook routing | ✅ Solid | OPT-OUT → GS3.0 → Legacy V2 → Bot in correct priority order |
| JWT authentication | ✅ Solid | Cookie + header, httpOnly, secure in prod, 24h expiry |
| State machine intent routing | ✅ Solid | OPT_OUT / HANDED_OFF / OBJECTION / ENGAGED all handled |
| Nurture sequence engine | ✅ Solid | 2-step, AI-generated, contextual, skips if paused |
| Feedback loop | ✅ Solid | opt_out/handoff/objection all write to gs_feedback |
| Handoff escalation | ✅ Solid | Admin WA alert + patient record upsert + bot handoff |
| Scout orchestration | ✅ Solid | Indeed, JobPortals, GooglePlaces all coordinated |
| Dashboard auth + UI | ✅ Solid | Login/logout, JWT cookie, leads table, filter by status |
| Cron job suite | ✅ Solid | All 8 jobs scheduled, proper SAR timezone offsets |
| Opt-out compliance | ✅ Solid | Both gs_leads AND growth_leads_v2 updated, sequences paused |
| Stripe webhook | ✅ Solid | Payment → DB update → handoff trigger |
| Morning brief | ✅ Solid | Reads appointments + growth_leads_v2 + sends WA summary |

---

## 🚨 CRITICAL ISSUES FOUND

### CRITICAL-1: `send-batch` endpoint bypasses JWT auth
**File:** `growth/index.js` line 414  
**Issue:** `router.post('/send-batch', jwtAuth, ...)` — has auth ✅  
**BUT:** `router.post('/add-and-fire', ...)` at line 254 has **NO auth at all**.  
Any unauthenticated attacker can flood Twilio credits by POSTing to `/growth/add-and-fire`.  
**Fix:** Add `jwtAuth` middleware to `/add-and-fire`, or add rate limiting.

### CRITICAL-2: State machine has no `COLD_LEAD` / `NO_RESPONSE` intent handler
**File:** `growth/state-machine.js` line 130 (default case)  
**Issue:** If `classifyIntent()` returns anything other than `OPT_OUT`, `HANDED_OFF`, `OBJECTION`, or `ENGAGED`, the message is **silently dropped**. No response sent.  
If OpenAI returns `COLD_LEAD`, `CURIOUS`, `IRRELEVANT`, or any other label, the lead gets no reply.  
**Fix:** Add a `default` response handler: re-engage with a soft follow-up, or at minimum log to admin.

### ~~CRITICAL-3~~ (FIXED): Duplicate Supabase client instantiation everywhere
**Files:** `growth/index.js:36`, `growth/state-machine.js:11`, `growth/nurture.js:12`, `growth/handoff.js:4`, `growth/dashboard-api.js:4`  
**Issue:** Each module creates its own `createClient()` call, each establishing a separate connection pool. Under high load, this wastes connections and can exhaust Supabase's connection limits.  
**Fix:** Create a shared `growth/lib/supabase.js` singleton and import it across all modules.

### CRITICAL-4: `startSequence()` always inserts, never checks for existing sequence
**File:** `growth/nurture.js` line 170  
**Issue:** `startSequence()` does a raw INSERT without checking if a sequence already exists for this `leadId`. If `/add-and-fire`, `/send-batch`, and `/approve/:id` are all called for the same lead, **three duplicate sequences** get created. Leads will get 6 follow-up messages instead of 2.  
**Fix:** Use `upsert` or check `gs_sequences WHERE lead_id = leadId AND is_completed = false` before inserting.

---

## ⚠️ MINOR ISSUES

### ~~MINOR-1~~ (FIXED): Dashboard reads `growth_leads_v2`, API reads `gs_leads` — split brain
The `/growth/dashboard` HTML shows `growth_leads_v2` data. The `/growth/api/leads` endpoint shows `gs_leads` data.  
These are two separate tables with different schemas. A new GS3.0 lead in `gs_leads` does NOT appear in the dashboard.  
**Impact:** Operator thinks lead pipeline is empty when it's not.

### ~~MINOR-2~~ (FIXED): `handoff.js` hardcodes phone format inconsistently
`const adminPhone = process.env.ADMIN_PHONE || '+966570733834'` at line 27 — works  
But `index.js` line 512: `const adminPhone = process.env.ADMIN_PHONE ? \`+${process.env.ADMIN_PHONE}\` : null` — adds `+` to whatever env var contains. If `ADMIN_PHONE=966570733834` (no plus), index.js adds `+`. If `ADMIN_PHONE=+966570733834` (with plus), index.js creates `++966570733834`.  
**Fix:** Normalize phone with a shared utility in one place.

### ~~MINOR-3~~ (FIXED): `conversation_engine.js` imported by nothing
**File:** `growth/conversation-engine.js` exists (4.8KB) but is not imported by any file.  
Either it's dead code or something broke its wiring.  
**Impact:** Feature regression — whatever was in that engine is not running.

### MINOR-4: Ghost Room `clinic` and `city` query params not validated server-side
**File:** `growth/index.js` line 197: `res.sendFile(path.join(__dirname, 'ghost-room.html'))`  
The ghost room URL uses `?clinic=X&city=Y` but these are read entirely in client-side JS from `URLSearchParams`. No server-side validation, sanitization, or logging of ghost room visits.  
**Impact:** No visibility into who's visiting the ghost room or what clinic names are being passed.

### MINOR-5: `nurture.js` hardcodes 4-day delay for step 2
Line 139: `nextSend.setDate(nextSend.getDate() + 4)` regardless of sequence type.  
Should read from a configuration or from `gs_sequences.delay_days` if that column exists.

### MINOR-6: GS3.0 API has no lead count pagination
`dashboard-api.js` line 8: `.limit(100)` — if there are 200+ leads, the dashboard only shows the latest 100 with no pagination UI.

---

## 📊 Full Simulation Flow (Traced End-to-End)

### Flow 1: Scout discovers clinic → First message sent
```
[6-hour cron] → orchestrator.js → indeed.js / googlePlaces.js
  → Extracts: name, phone, city, pain_signal
  → Inserts into growth_leads_v2 (status: 'new')
  → [Next day at 10AM] auto-batch cron → processBatch(10)
    → generateMessage(lead) [brain.js]
    → sendWhatsApp(phone, msg) [lib/whatsappProvider.js → Twilio]
    → growth_leads_v2.status = 'messaged'
    → startSequence(lead.id) → gs_sequences INSERT (next_send_at = +3 days)
```

### Flow 2: Lead replies → State machine processes
```
Twilio fires POST /webhook
  → OPT-OUT check → PASS
  → gs_leads lookup → ⚠️ NOT FOUND (scout inserted to growth_leads_v2, NOT gs_leads)
  → growth_leads_v2 lookup → FOUND (status='messaged')
  → handoffLead() called immediately
    → Admin gets WA alert
    → Patient record upserted → bot takes over
```
**🚨 PROBLEM:** The GS3.0 state machine ONLY routes messages from leads in `gs_leads`. Scouts populate `growth_leads_v2`. So ALL scout-generated leads who reply bypass the state machine and go directly to handoff, **skipping the AI conversation entirely**. The state machine is only used for leads manually added via `add-and-fire` if they also get inserted to `gs_leads`.

### Flow 3: Nurture follow-up fires
```
[Daily 9AM cron] → /growth/send-followups
  → processSequences()
  → Fetches gs_sequences WHERE is_paused=false AND is_completed=false AND next_send_at<=NOW
  → generateFollowUpMessage(lead, stepNumber, history)
  → sendWhatsApp() + log to gs_conversations + update sequence
```

---

## 🔧 Recommended Fix Priority

| Priority | Issue | Effort |
|---|---|---|
| 🔴 P0 | `/add-and-fire` has no auth — add `jwtAuth` or rate limiter | 5 min |
| 🔴 P0 | Scout leads not inserted to `gs_leads` — break state machine routing | Medium |
| 🔴 P0 | `startSequence()` no dedup check — double/triple sequences | 10 min |
| 🟠 P1 | State machine default case drops messages silently | 15 min |
| 🟠 P1 | `conversation_engine.js` not wired — check if it's dead code | 15 min |
| 🟡 P2 | Supabase singleton pattern — shared client module | 20 min |
| 🟡 P2 | Admin phone normalization — shared utility | 10 min |
| 🟡 P2 | Dashboard reads v2 table, API reads GS3.0 — unify | Medium |
| 🟢 P3 | Ghost room visit logging | 20 min |
| 🟢 P3 | Nurture delay config | 10 min |

---

*Updated: 2026-04-25 02:57 KSA — Brain sync complete*

### CRITICAL-5: (FIXED) Auto-Batch Crash
**File:** index.js line 480
**Issue:** Passed an integer 10 to processBatch(leads) which expected an array. Fixed by fetching leads first.

### CRITICAL-6: (FIXED) Auto-Batch FK Violation
**File:** growth/sender.js line 80
**Issue:** gs_conversations.lead_id has a strict FK to gs_leads, but scout leads were not inserted into gs_leads before logging. Fixed by adding the bridge logic upsert into sender.js.
