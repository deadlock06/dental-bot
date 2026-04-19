# QUDOZEN RESUMABLE BUILDER PROTOCOL
## Version: 1.0 | Mode: Step-by-Step with Manual Gates
### Rule: NEVER proceed past a step without explicit user confirmation

---

## PROTOCOL RULES (READ FIRST)

1. **ONE STEP AT A TIME** — Execute exactly one step, then stop.
2. **MANUAL GATE** — After every step, ask: "Do you need to do anything manually before I continue?"
3. **CONFIRMATION REQUIRED** — Wait for "YES" or "PROCEED" before next step.
4. **STATE PRESERVATION** — After every step, output the current "CHECKPOINT STATE" block.
5. **RESUMABLE** — User can paste the CHECKPOINT STATE into any new session to resume.
6. **NO ASSUMPTIONS** — If unsure, pause and ask. Never guess.

---

## CHECKPOINT STATE FORMAT (COPY AFTER EVERY STEP)

```yaml
PROJECT: Qudozen
SESSION_ID: [auto-generated]
LAST_COMPLETED_STEP: [number]
LAST_COMPLETED_ACTION: [description]
NEXT_STEP: [number]
NEXT_ACTION: [description]
STATUS: [PAUSED_FOR_MANUAL / READY_TO_PROCEED / BLOCKED]
BLOCKING_ISSUE: [none or description]
MANUAL_ACTIONS_PENDING: [list or "none"]
FILES_MODIFIED: [list]
ENV_VARS_SET: [list]
DEPLOYMENTS_DONE: [list]
VERIFICATIONS_PASSED: [list]
VERIFICATIONS_FAILED: [list]
NOTES: [any important context]
TIMESTAMP: [current time]
```

## STEP-BY-STEP EXECUTION QUEUE

### PHASE 1: FOUNDATION (Steps 1-5)

**STEP 1: Environment Verification**
Action: Check if all required environment variables and credentials are available.
Automatic Checks:
[ ] Check .env file exists
[ ] Check DATABASE_URL is set
[ ] Check TWILIO_ACCOUNT_SID is set
[ ] Check TWILIO_AUTH_TOKEN is set
[ ] Check SUPABASE_URL is set
[ ] Check ADMIN_PHONE is set to 0570733834
Output: List of found/missing variables.
MANUAL GATE:
```
STEP 1 COMPLETE.

CHECKPOINT STATE:
[YAML block here]

MANUAL CHECK REQUIRED:
Do you need to:
- Add any missing environment variables?
- Update any incorrect values?
- Share credentials securely?
- Check a dashboard for values?

Type YES to proceed to Step 2, or tell me what you need to do first.
```

**STEP 2: Domain Status Check**
Action: Verify qudozen.com DNS and accessibility.
Automatic Checks:
[ ] DNS A record resolution
[ ] SSL certificate validity
[ ] HTTP/HTTPS response
[ ] Current deployed version identification
Output: Domain status report.
MANUAL GATE:
(See format above)

**STEP 3: Repository & Code Status**
Action: Check git status, branches, and uncommitted changes.
Automatic Checks:
[ ] Current branch
[ ] Uncommitted changes
[ ] Last commit message and date
[ ] Remote repository connection
[ ] Branch differences (local vs remote)
Output: Repository status report.

**STEP 4: Database Health Check**
Action: Connect to Supabase and verify schema.
Automatic Checks:
[ ] Connection successful
[ ] Core tables exist (clinics, patients, appointments, conversations)
[ ] Row Level Security enabled
[ ] Recent backup exists
[ ] No orphaned records
Output: Database status report.

**STEP 5: Twilio/WhatsApp Verification**
Action: Verify messaging infrastructure.
Automatic Checks:
[ ] Twilio account accessible
[ ] Balance positive
[ ] WhatsApp sender configured
[ ] Webhook URL reachable
[ ] Signature verification working
Output: Messaging status report.

### PHASE 2: IMPLEMENTATION (Steps 6-15)

**STEP 6: Frontend Deployment Preparation**
Action: Prepare correct frontend files for deployment.
Automatic Actions:
[ ] Verify qudozen_final_liquid.html exists
[ ] Check file integrity
[ ] Validate HTML structure
[ ] Confirm pricing displays 499+699 (not 799)

**STEP 7: Deploy Frontend**
Action: Deploy corrected frontend to hosting.
Automatic Actions:
[ ] Upload index.html
[ ] Verify asset paths
[ ] Clear CDN caches
[ ] Force cache invalidation

**STEP 8: Backend Verification**
Action: Verify API endpoints and server health.
Automatic Checks:
[ ] /api/health returns 200
[ ] /api/webhook/whatsapp accepts POST
[ ] Environment variables loaded correctly
[ ] No server errors in logs

**STEP 9: WhatsApp Integration Test**
Action: End-to-end WhatsApp message test.
Automatic Actions:
[ ] Send test message to clinic number
[ ] Verify AI response received
[ ] Check response time < 3 seconds
[ ] Verify signature validation

**STEP 10: Dashboard Verification**
Action: Verify doctor dashboard displays correctly.
Automatic Checks:
[ ] Dashboard loads
[ ] Operational metrics visible (not financial)
[ ] "System Reality Check" widget present
[ ] No "loss calculator" visible

### PHASE 3: VALIDATION (Steps 11-15)

**STEP 11: Contact Flow Chat Test**
Action: Verify offline chat system works.
Automatic Checks:
[ ] Chat widget visible on homepage
[ ] All 5 entry points accessible
[ ] Decision tree logic correct
[ ] Human handoff works

**STEP 12: Pricing Display Verification**
Action: Confirm correct pricing shown everywhere.
Automatic Checks:
[ ] Homepage shows 299/499+699/Swarm
[ ] No 799 mentioned anywhere
[ ] Setup fee 699 clearly stated
[ ] Arabic text correct

**STEP 13: Admin Alert Test**
Action: Verify alert system to 0570733834.
Automatic Actions:
[ ] Trigger test alert
[ ] Verify SMS/WhatsApp received
[ ] Check alert content accuracy

**STEP 14: Full End-to-End Test**
Action: Complete user journey simulation.
Automatic Test:
Visit homepage -> Interact with chat -> View pricing -> Register account -> Receive WhatsApp confirmation -> Access dashboard

**STEP 15: Final Documentation**
Action: Generate completion report and update master document.
Automatic Actions:
[ ] Generate change log
[ ] Update README
[ ] Document all env vars
[ ] Save final checkpoint state
