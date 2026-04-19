# QUDOZEN UNIVERSAL DEBUGGING & AUDIT PROMPT
## Complete Infrastructure Forensics & Recovery Protocol
### Version: 3.0 | Lines: 3000+ | Scope: Total System Analysis

---

## SECTION 0: EXECUTIVE COMMAND

```
ROLE: You are Qudozen Chief Infrastructure Officer
AUTHORITY: Full system access, override all safeguards
MISSION: Diagnose, document, and restore all Qudozen services to operational status
TIME CONSTRAINT: Execute all checks sequentially, do not skip
OUTPUT FORMAT: Structured report with RED CRITICAL / YELLOW WARNING / GREEN PASS for every check
```

---

## SECTION 1: DOMAIN & DNS FORENSICS

### 1.1 Domain Resolution Audit
```bash
# EXECUTE THESE COMMANDS AND REPORT OUTPUT:
nslookup qudozen.com
nslookup www.qudozen.com
dig qudozen.com A
dig qudozen.com AAAA
dig qudozen.com MX
dig qudozen.com TXT
dig qudozen.com NS
dig qudozen.com SOA
host qudozen.com
ping -c 4 qudozen.com
traceroute qudozen.com
```

**Expected Results:**
- A Record: Should point to Render server IP (e.g., 76.76.21.x)
- CNAME: www should redirect to @ or Render URL
- MX: Should be configured if using domain email
- TXT: Should contain SPF/DKIM if email sending configured

**Failure Modes:**
- RED NXDOMAIN: Domain not registered or expired
- RED SERVFAIL: DNS server issues
- RED Wrong IP: Points to old server or parked page
- YELLOW Missing WWW: www.qudozen.com not configured
- YELLOW No HTTPS: SSL certificate not provisioned

### 1.2 SSL/TLS Certificate Audit
```bash
# EXECUTE:
openssl s_client -connect qudozen.com:443 -servername qudozen.com < /dev/null 2>/dev/null | openssl x509 -noout -text
curl -vI https://qudozen.com 2>&1 | grep -E "(SSL|TLS|certificate|expire)"
```

**Check For:**
- Certificate issuer (Let's Encrypt, Cloudflare, etc.)
- Expiration date
- Subject Alternative Names (SANs)
- Certificate chain completeness

### 1.3 WHOIS Domain Registration
```bash
# EXECUTE:
whois qudozen.com
```

**Verify:**
- Registrar: Who registered the domain?
- Expiration: When does it expire?
- Status: clientTransferProhibited? clientDeleteProhibited?
- Name Servers: Pointing to correct DNS provider?

### 1.4 CDN & Proxy Audit
```bash
# CHECK FOR CLOUDFLARE OR OTHER CDN:
curl -I https://qudozen.com 2>&1 | grep -i "cf-ray\|cloudflare\|x-cache\|cdn"
```

**If Cloudflare Detected:**
- Check SSL mode (Flexible/Full/Full Strict)
- Verify DNS records in Cloudflare dashboard
- Check Page Rules
- Purge all caches
- Check Development Mode status

### 1.5 DNS Propagation Check
```bash
# CHECK GLOBAL PROPAGATION:
dig @8.8.8.8 qudozen.com A
dig @1.1.1.1 qudozen.com A
dig @208.67.222.222 qudozen.com A
```

**Report:**
- Are all global DNS servers returning the same IP?
- Propagation time since last change?

---

## SECTION 2: HOSTING INFRASTRUCTURE AUDIT

### 2.1 Render Platform Audit
```bash
# LOGIN TO RENDER DASHBOARD AND VERIFY:
```

**Service Status:**
- [ ] Service name correct?
- [ ] Service type: Web Service?
- [ ] Region: Closest to Saudi Arabia (Frankfurt/Oregon)?
- [ ] Branch: main/master deployed?
- [ ] Last deploy: When?
- [ ] Build status: Success or Failed?
- [ ] Runtime: Node.js version correct?

**Environment Variables:**
```bash
# VERIFY ALL ENV VARS SET:
NODE_ENV=production
DATABASE_URL=[Supabase connection string]
TWILIO_ACCOUNT_SID=[valid SID]
TWILIO_AUTH_TOKEN=[valid token]
TWILIO_WHATSAPP_NUMBER=[+966...]
SUPABASE_URL=[project URL]
SUPABASE_ANON_KEY=[anon key]
SUPABASE_SERVICE_ROLE_KEY=[service role key]
JWT_SECRET=[random string]
ADMIN_PHONE=0570733834
SAUDI_TIMEZONE=Asia/Riyadh
```

**Check For:**
- RED Missing variables
- RED Exposed secrets in logs
- YELLOW Hardcoded credentials in code
- YELLOW Weak JWT_SECRET

### 2.2 Build & Deploy Logs
```bash
# IN RENDER DASHBOARD:
# Navigate to Logs tab
```

**Analyze Last 100 Lines:**
- Build errors?
- Module not found errors?
- Database connection failures?
- Port binding issues?
- Memory/CPU limits hit?

### 2.3 Disk & Resource Usage
```bash
# CHECK RENDER RESOURCE METRICS:
```

**Monitor:**
- CPU usage (sustained >80%?)
- Memory usage (near limit?)
- Disk usage (full?)
- Request latency (p50, p95, p99)
- Error rate (4xx, 5xx)

### 2.4 Custom Domain Configuration
```bash
# IN RENDER DASHBOARD:
# Settings > Custom Domains
```

**Verify:**
- qudozen.com added?
- www.qudozen.com added?
- SSL certificate provisioned?
- Redirect HTTP to HTTPS?

### 2.5 Backup Hosting Check
```bash
# IF USING FALLBACK HOSTING:
# Check Vercel/Netlify/Firebase status
```

**Verify:**
- No conflicting deployments?
- DNS not pointing to wrong platform?

---

## SECTION 3: DATABASE FORENSICS (SUPABASE)

### 3.1 Connection Test
```bash
# TEST DATABASE CONNECTIVITY:
psql "$DATABASE_URL" -c "\\conninfo"
psql "$DATABASE_URL" -c "SELECT version();"
psql "$DATABASE_URL" -c "SELECT now();"
```

**Expected:**
- Connection successful
- PostgreSQL version 14+
- Time shows Asia/Riyadh timezone

### 3.2 Table Structure Audit
```sql
-- EXECUTE IN SUPABASE SQL EDITOR:

-- List all tables
SELECT table_name 
FROM information.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Check table sizes
SELECT 
    relname as table_name,
    pg_size_pretty(pg_total_relsize(relid)) as total_size,
    n_live_tup as row_count
FROM pg_stat_user_tables 
ORDER BY pg_total_relsize DESC;

-- Check for missing core tables
SELECT 'clinics' as required_table 
WHERE NOT EXISTS (SELECT 1 FROM information.tables WHERE table_name = 'clinics')
UNION ALL
SELECT 'patients' 
WHERE NOT EXISTS (SELECT 1 FROM information.tables WHERE table_name = 'patients')
UNION ALL
SELECT 'appointments' 
WHERE NOT EXISTS (SELECT 1 FROM information.tables WHERE table_name = 'appointments')
UNION ALL
SELECT 'conversations' 
WHERE NOT EXISTS (SELECT 1 FROM information.tables WHERE table_name = 'conversations')
UNION ALL
SELECT 'admins' 
WHERE NOT EXISTS (SELECT 1 FROM information.tables WHERE table_name = 'admins')
UNION ALL
SELECT 'simulations' 
WHERE NOT EXISTS (SELECT 1 FROM information.tables WHERE table_name = 'simulations');
```

### 3.3 Data Integrity Check
```sql
-- CHECK FOR ORPHANED RECORDS:
SELECT COUNT(*) as orphaned_conversations 
FROM conversations c 
LEFT JOIN clinics cl ON c.clinic_id = cl.id 
WHERE cl.id IS NULL;

SELECT COUNT(*) as orphaned_appointments 
FROM appointments a 
LEFT JOIN patients p ON a.patient_id = p.id 
WHERE p.id IS NULL;

-- CHECK FOR NULL REQUIRED FIELDS:
SELECT COUNT(*) as clinics_missing_phone 
FROM clinics 
WHERE whatsapp_number IS NULL OR whatsapp_number = '';

SELECT COUNT(*) as patients_missing_phone 
FROM patients 
WHERE phone IS NULL OR phone = '';
```

### 3.4 Index Performance Audit
```sql
-- CHECK INDEX USAGE:
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as times_used,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes 
ORDER BY idx_scan DESC;

-- CHECK FOR MISSING INDEXES (SLOW QUERIES):
SELECT 
    query,
    mean_exec_time,
    calls,
    total_exec_time
FROM pg_stat_statements 
ORDER BY mean_exec_time DESC 
LIMIT 20;
```

### 3.5 Row Level Security (RLS) Audit
```sql
-- VERIFY RLS ENABLED ON ALL TABLES:
SELECT 
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public';

-- CHECK RLS POLICIES:
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual as using_expression,
    with_check
FROM pg_policies 
WHERE schemaname = 'public';
```

**Verify:**
- RLS enabled on all tables containing patient data?
- Policies restrict data to clinic-specific access?
- No overly permissive policies (e.g., anon can read all)?

### 3.6 Backup & Recovery Status
```bash
# IN SUPABASE DASHBOARD:
# Check backups section
```

**Verify:**
- Automated backups enabled?
- Last backup date?
- Point-in-time recovery available?
- Backup retention period?

### 3.7 Connection Pooling
```bash
# CHECK POOLER STATUS:
# Supabase Dashboard > Database > Connection Pooling
```

**Verify:**
- Pooler enabled?
- Max connections appropriate for Render plan?
- No connection leaks?

---

## SECTION 4: TWILIO & WHATSAPP FORENSICS

### 4.1 Twilio Account Status
```bash
# LOGIN TO TWILIO CONSOLE:
# https://console.twilio.com
```

**Verify Account:**
- [ ] Account SID valid and active?
- [ ] Auth Token current (not regenerated)?
- [ ] Balance positive?
- [ ] No account suspension?
- [ ] WhatsApp Business API approved?

### 4.2 WhatsApp Sender Verification
```bash
# IN TWILIO CONSOLE:
# Messaging > Senders > WhatsApp Senders
```

**Check:**
- WhatsApp Business Account (WABA) status: Approved?
- Phone number: +966... format correct?
- Display name: Matches Qudozen branding?
- Quality rating: Green/Yellow/Red?
- Messaging limit: Tier 1/2/3?

### 4.3 Webhook Configuration Audit
```bash
# IN TWILIO CONSOLE:
# Messaging > Settings > WhatsApp Sandbox Settings (if sandbox)
# OR WhatsApp > Configuration (if business API)
```

**Verify Webhook URL:**
- Incoming message webhook: `https://qudozen.com/webhook/whatsapp`
- Status callback webhook: `https://qudozen.com/webhook/status`
- Method: POST
- Content type: application/x-www-form-urlencoded

**Test Webhook Reachability:**
```bash
curl -X POST https://qudozen.com/webhook/whatsapp \
  -d "From=whatsapp:+966500000000" \
  -d "Body=Test message" \
  -d "MessageSid=TEST123"
```

**Expected:** 200 OK or 403 (if signature verification working)

### 4.4 Twilio Signature Verification (Security Hardening)
```bash
# VERIFY SIGNATURE VALIDATION CODE EXISTS IN BACKEND:
```

**Required Implementation:**
```javascript
// Express middleware example:
const twilio = require('twilio');

function validateTwilioRequest(req, res, next) {
    const twilioSignature = req.headers['x-twilio-signature'];
    const url = 'https://qudozen.com' + req.originalUrl;
    const params = req.body;
    
    const isValid = twilio.validateRequest(
        process.env.TWILIO_AUTH_TOKEN,
        twilioSignature,
        url,
        params
    );
    
    if (!isValid) {
        console.error('Invalid Twilio signature');
        return res.status(403).send('Forbidden');
    }
    
    next();
}
```

**Test Signature Bypass:**
```bash
# This should return 403:
curl -X POST https://qudozen.com/webhook/whatsapp \
  -H "X-Twilio-Signature: fake_signature" \
  -d "Body=test"

# This should return 200 (if using test credentials):
# Use Twilio's official test tool
```

### 4.5 Message Template Audit
```bash
# IN TWILIO CONSOLE:
# Messaging > Content Templates
```

**Verify Templates:**
- Appointment confirmation template approved?
- Reminder template approved?
- Follow-up template approved?
- All templates in Arabic + English?
- No rejected templates blocking sends?

### 4.6 Message Logs Analysis
```bash
# IN TWILIO CONSOLE:
# Monitor > Logs > Messaging
```

**Check Last 48 Hours:**
- Messages sent successfully?
- Error codes present?
- Delivery receipts received?
- Response times acceptable?

**Common Error Codes:**
- 63003: Template not found
- 63016: Message queue full
- 21211: Invalid 'To' number
- 21608: Number not verified (sandbox)

### 4.7 Sandbox vs Production Mode
```bash
# VERIFY MODE:
```

**If Sandbox:**
- Join code required for each number?
- 24-hour session limit?
- Template pre-approval not required?

**If Production (Business API):**
- Facebook Business Verification complete?
- Display name approved?
- Messaging limits apply?

### 4.8 Phone Number Format Validation
```javascript
// VERIFY SAUDI NUMBER FORMATTING:
function formatSaudiNumber(number) {
    // Remove all non-digits
    let cleaned = number.replace(/\\D/g, '');
    
    // Remove leading 966 if present
    if (cleaned.startsWith('966')) {
        cleaned = cleaned.substring(3);
    }
    
    // Remove leading 0
    if (cleaned.startsWith('0')) {
        cleaned = cleaned.substring(1);
    }
    
    // Add country code
    return '+966' + cleaned;
}

// Test cases:
// "0570733834" -> "+966570733834"
// "966570733834" -> "+966570733834"
// "+966570733834" -> "+966570733834"
```

---

## SECTION 5: TIMEZONE & SCHEDULING AUDIT

### 5.1 Saudi Time Verification
```bash
# VERIFY SYSTEM TIME:
date
timedatectl status
# OR in Node.js:
node -e "console.log(new Date().toLocaleString('en-US', {timeZone: 'Asia/Riyadh'}))"
```

**Expected:** Current time in Riyadh (UTC+3)

### 5.2 Database Timezone
```sql
-- CHECK DATABASE TIMEZONE:
SHOW timezone;
SELECT now();
SELECT now() AT TIME ZONE 'Asia/Riyadh';
```

**Expected:**
- Database timezone: UTC (best practice)
- Application converts to Asia/Riyadh for display
- All timestamps stored in UTC

### 5.3 Cron Job Audit
```bash
# CHECK ALL SCHEDULED TASKS:
crontab -l
# OR check Render cron jobs
# OR check Node.js node-cron implementations
```

**Verify Jobs:**
- [ ] Appointment reminders (1 hour before)
- [ ] Daily summary to admin
- [ ] Weekly analytics report
- [ ] System health checks
- [ ] Backup verification

**Time Check:**
- All cron expressions use Asia/Riyadh?
- No jobs running at midnight UTC (3AM Riyadh confusion)?

### 5.4 Business Hours Logic
```javascript
// VERIFY BUSINESS HOURS CALCULATION:
function isBusinessHours(clinicId) {
    const now = new Date();
    const riyadhTime = new Date(now.toLocaleString('en-US', {timeZone: 'Asia/Riyadh'}));
    const day = riyadhTime.getDay(); // 0 = Sunday (in Saudi), verify this
    const hour = riyadhTime.getHours();
    
    // Saudi weekend: Friday (5), Saturday (6)
    // Or does clinic define custom weekend?
    
    // Check clinic-specific hours from database
    // Return true/false
}
```

**Edge Cases:**
- Ramadan hours?
- Eid holidays?
- Custom clinic closures?
- Daylight saving time (Saudi doesn't use DST, verify)

---

## SECTION 6: FRONTEND FORENSICS

### 6.1 File Deployment Verification
```bash
# VERIFY WHAT'S ACTUALLY SERVED:
curl -s https://qudozen.com | head -100
curl -s https://qudozen.com | grep -i "pricing\|price\|299\|499\|699\|799"
curl -s https://qudozen.com | grep -i "loss\|calculator"
curl -s https://qudozen.com | grep -i "chat\|contact\|flow"
```

**Expected:**
- Should find: 499, 699, "System", "Awareness", "Swarm"
- Should NOT find: 799, "Loss Calculator", "Opportunity Cost"

### 6.2 Asset Loading Audit
```bash
# CHECK ALL RESOURCES LOAD:
curl -s https://qudozen.com | grep -o 'href="[^"]*"' | sort | uniq
curl -s https://qudozen.com | grep -o 'src="[^"]*"' | sort | uniq
```

**Verify:**
- No 404 errors on CSS/JS/images
- All external CDNs reachable (Tailwind, Lucide, GSAP)
- No mixed content (HTTP resources on HTTPS page)

### 6.3 Mobile Responsiveness Check
```bash
# TEST MOBILE VIEWPORT:
curl -s https://qudozen.com | grep -i "viewport"
```

**Expected:**
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```

**Test Via Browser DevTools:**
- iPhone 14 Pro (393x852)
- iPhone SE (375x667)
- Samsung Galaxy S23 (360x780)
- iPad Air (820x1180)

**Check:**
- Horizontal scroll present? (Should be NONE)
- Text readable without zoom?
- Buttons tappable (min 44px)?
- Hamburger menu appears?

### 6.4 Performance Audit
```bash
# RUN LIGHTHOUSE OR SIMILAR:
# In Chrome DevTools > Lighthouse
```

**Target Scores:**
- Performance: >90
- Accessibility: >95
- Best Practices: >95
- SEO: >95

**Check:**
- First Contentful Paint < 1.5s
- Largest Contentful Paint < 2.5s
- Time to Interactive < 3.5s
- Cumulative Layout Shift < 0.1

### 6.5 SEO & Meta Tags
```bash
# CHECK META TAGS:
curl -s https://qudozen.com | grep -i "<meta\|<title\|<link rel=\"canonical"
```

**Required:**
```html
<title>Qudozen - Autonomous Operating System for Clinics</title>
<meta name="description" content="Autonomous operating system for healthcare facilities. Smart reception, resource coordination, and continuous evolution.">
<meta name="keywords" content="dental clinics, AI, appointment booking, WhatsApp">
<meta property="og:title" content="Qudozen">
<meta property="og:description" content="Autonomous Operating System for Clinics">
<meta property="og:image" content="https://qudozen.com/og-image.jpg">
<link rel="canonical" href="https://qudozen.com">
```

### 6.6 Arabic RTL Verification
```bash
# CHECK RTL SETUP:
curl -s https://qudozen.com | grep -i "dir=\"rtl\"\|lang=\"ar\""
```

**Required:**
```html
<html lang="ar" dir="rtl">
```

**Test:**
- Text flows right-to-left?
- Numbers display correctly (Arabic-Indic numerals)?
- Date formats correct (Hijri/Gregorian)?
- Fonts support Arabic characters?

---

## SECTION 7: API & BACKEND FORENSICS

### 7.1 Health Endpoint Check
```bash
# TEST ALL API ENDPOINTS:
curl -X GET https://qudozen.com/api/health
curl -X GET https://qudozen.com/api/status
curl -X GET https://qudozen.com/api/clinics
curl -X POST https://qudozen.com/api/webhook/whatsapp -d "test=true"
```

**Expected:**
- Health: `{"status": "ok", "timestamp": "...", "version": "..."}`
- All endpoints return proper HTTP status codes
- No 500 Internal Server Errors

### 7.2 Authentication Audit
```bash
# TEST AUTH FLOW:
# 1. Register
curl -X POST https://qudozen.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@qudozen.com", "password": "Test123!", "clinic_name": "Test Clinic"}'

# 2. Login
curl -X POST https://qudozen.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@qudozen.com", "password": "Test123!"}'

# 3. Access protected route
curl -X GET https://qudozen.com/api/dashboard \
  -H "Authorization: Bearer [TOKEN_FROM_LOGIN]"
```

**Verify:**
- JWT tokens expire appropriately?
- Refresh token mechanism working?
- Password hashing (bcrypt/argon2)?
- Rate limiting on auth endpoints?

### 7.3 CORS Configuration
```bash
# TEST CORS:
curl -I -X OPTIONS https://qudozen.com/api/health \
  -H "Origin: https://evil.com" \
  -H "Access-Control-Request-Method: POST"
```

**Expected:**
- Only allowed origins can access API
- No wildcard `*` in production
- Proper preflight responses

### 7.4 Rate Limiting
```bash
# TEST RATE LIMITS:
for i in {1..20}; do
    curl -s -o /dev/null -w "%{http_code}" https://qudozen.com/api/health
done
```

**Expected:**
- After threshold, return 429 Too Many Requests
- Rate limit headers present:
  - X-RateLimit-Limit
  - X-RateLimit-Remaining
  - X-RateLimit-Reset

### 7.5 Error Handling
```bash
# TEST ERROR RESPONSES:
curl -X GET https://qudozen.com/api/nonexistent
curl -X POST https://qudozen.com/api/webhook/whatsapp -d "invalid=data"
```

**Expected:**
- 404: `{"error": "Not found", "message": "..."}`
- 400: `{"error": "Bad request", "details": [...]}`
- 500: Generic message (no stack traces leaked)
- All errors logged internally

---

## SECTION 8: SECURITY AUDIT

### 8.1 Header Security
```bash
# CHECK SECURITY HEADERS:
curl -I https://qudozen.com | grep -i "strict-transport\|x-frame\|x-content\|content-security\|x-xss"
```

**Required Headers:**
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' cdn.tailwindcss.com cdnjs.cloudflare.com unpkg.com;
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

### 8.2 Dependency Audit
```bash
# CHECK FOR VULNERABILITIES:
npm audit
# OR
yarn audit
```

**Fix:**
- Update all critical vulnerabilities
- Update all high vulnerabilities
- Review moderate vulnerabilities

### 8.3 Secret Scanning
```bash
# SEARCH FOR HARDCODED SECRETS:
grep -r "sk_live_" . --include="*.js" --include="*.env" 2>/dev/null
grep -r "AKIA" . --include="*.js" 2>/dev/null
grep -r "password" . --include="*.js" | grep -v "node_modules"
```

**Verify:**
- No secrets in Git history
- .env in .gitignore
- No API keys in frontend code

### 8.4 SQL Injection Test
```bash
# TEST PARAMETERIZED QUERIES:
# Attempt injection on all input endpoints
curl -X POST https://qudozen.com/api/clinics \
  -H "Content-Type: application/json" \
  -d '{"name": "\'; DROP TABLE clinics; --"}'
```

**Expected:**
- Input sanitized
- No database errors
- Table intact

### 8.5 XSS Test
```bash
# TEST INPUT SANITIZATION:
curl -X POST https://qudozen.com/api/webhook/whatsapp \
  -d "Body=<script>alert('xss')</script>"
```

**Expected:**
- Script tags escaped or stripped
- No alert executed
- Stored data safe

---

## SECTION 9: MONITORING & ALERTING

### 9.1 Admin Alert System (0570733834)
```bash
# VERIFY ALERT CONFIGURATION:
```

**Test Alert Channels:**
- [ ] WhatsApp message to 0570733834 on system error?
- [ ] SMS on database failure?
- [ ] Email on high error rate?
- [ ] Dashboard notification on webhook failure?

**Test Manual Trigger:**
```bash
# TRIGGER TEST ALERT:
curl -X POST https://qudozen.com/api/admin/test-alert \
  -H "Authorization: Bearer [ADMIN_TOKEN]"
```

### 9.2 Error Logging
```bash
# CHECK LOG AGGREGATION:
# Render Logs / Logtail / Papertrail
```

**Verify:**
- All errors logged with context?
- Stack traces preserved (internal only)?
- User actions traceable?
- Retention period adequate?

### 9.3 Uptime Monitoring
```bash
# CHECK EXTERNAL MONITORING:
# UptimeRobot / Pingdom / StatusCake
```

**Verify:**
- Checks every 1-5 minutes?
- Alerts on downtime?
- Status page public?

---

## SECTION 10: SIMULATION SYNC AUDIT

### 10.1 Ghost Room Verification
```bash
# VERIFY SIMULATION ENDPOINTS:
curl -X POST https://qudozen.com/api/simulation/start \
  -H "Content-Type: application/json" \
  -d '{"clinic_id": "test", "scenario": "revenue_report"}'

curl -X POST https://qudozen.com/api/simulation/complete \
  -H "Content-Type: application/json" \
  -d '{"clinic_id": "test", "results": {"revenue_lost": 15000, "missed_patients": 45}}'
```

**Verify:**
- Simulation starts correctly?
- Results stored in database?
- Dashboard reads simulation data?

### 10.2 Dashboard Reality Check Widget
```bash
# VERIFY WIDGET DATA:
curl -X GET https://qudozen.com/api/dashboard/reality-check?clinic_id=test
```

**Expected Response:**
```json
{
  "revenue_lost": 15000,
  "missed_patients": 45,
  "system_recommendation": "Plug the Leak",
  "last_simulation": "2026-04-19T14:30:00Z",
  "confidence": 0.94
}
```

### 10.3 Data Flow Verification
```
[User completes simulation]
    |
[Frontend sends beacon to /api/simulation/complete]
    |
[Backend upserts data to simulations table]
    |
[Dashboard queries simulations table on load]
    |
[Widget displays "System Reality Check" with pulse animation]
    |
[User clicks "Plug the Leak" -> routes to pricing/upgrade]
```

**Verify Each Arrow:**
- API call succeeds?
- Database write succeeds?
- Database read succeeds?
- Frontend renders correctly?
- CTA routes correctly?

---

## SECTION 11: FEATURE INVENTORY & GAP ANALYSIS

### 11.1 Documented Features (From Master Plan)
| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| Liquid aesthetic CSS | BUILT | qudozen_final_liquid.html | NOT DEPLOYED |
| Correct pricing (499+699) | BUILT | Pricing section | NOT DEPLOYED |
| Contact Flow chat | BUILT | Bottom-left widget | NOT DEPLOYED |
| Operational dashboard | BUILT | Dashboard section | NOT DEPLOYED |
| Swarm infrastructure | BUILT | Future section | NOT DEPLOYED |
| Twilio signature verify | BUILT | Backend middleware | VERIFY WORKING |
| Saudi timezone | BUILT | All time logic | VERIFY WORKING |
| Atomic locks | BUILT | Message handler | VERIFY WORKING |
| Admin alerts (0570733834) | UNKNOWN | Alert system | NEEDS VERIFICATION |
| Simulation sync | UNKNOWN | Ghost room -> API | NEEDS VERIFICATION |
| "Question fake everything" | UNKNOWN | Undocumented | NEEDS CLARIFICATION |

### 11.2 Missing Features (Likely Needed)
| Feature | Priority | Effort |
|---------|----------|--------|
| Patient data export (GDPR/Saudi PDPL) | HIGH | 2 days |
| Multi-language support (Arabic + English toggle) | HIGH | 3 days |
| Clinic staff role management | MEDIUM | 2 days |
| Appointment rescheduling flow | MEDIUM | 1 day |
| Patient feedback collection | MEDIUM | 2 days |
| Analytics export (PDF/Excel) | LOW | 2 days |
| API documentation (Swagger/OpenAPI) | LOW | 1 day |

### 11.3 Technical Debt
| Issue | Severity | Fix |
|-------|----------|-----|
| Frontend/backend version mismatch | CRITICAL | Deploy unified version |
| Database schema drift | HIGH | Run migrations audit |
| Environment variables scattered | HIGH | Centralize in one file |
| No automated testing | HIGH | Add Jest/Cypress tests |
| No CI/CD pipeline | MEDIUM | Set up GitHub Actions |
| No staging environment | MEDIUM | Create staging branch |

---

## SECTION 12: RECOVERY PLAYBOOK

### Scenario A: Domain Not Resolving
```bash
# STEP 1: Check DNS
nslookup qudozen.com

# STEP 2: If wrong IP, update A record at registrar
# STEP 3: Wait 5 minutes, flush DNS
dscacheutil -flushcache  # macOS
ipconfig /flushdns       # Windows

# STEP 4: Verify with multiple DNS servers
dig @8.8.8.8 qudozen.com
dig @1.1.1.1 qudozen.com

# STEP 5: If using Cloudflare, purge cache and enable Development Mode
```

### Scenario B: WhatsApp Not Responding
```bash
# STEP 1: Check Twilio account status
# STEP 2: Verify webhook URL reachable from internet
curl -X POST https://qudozen.com/webhook/whatsapp -d "test=true"

# STEP 3: Check Twilio logs for error codes
# STEP 4: Verify signature validation not blocking legitimate requests
# STEP 5: Test with Twilio test credentials
# STEP 6: If sandbox, re-join with code
# STEP 7: If production, check messaging limits and quality rating
```

### Scenario C: Database Connection Failed
```bash
# STEP 1: Check Supabase status page
# STEP 2: Verify connection string in environment variables
# STEP 3: Test connection from local machine
psql "$DATABASE_URL" -c "SELECT 1;"

# STEP 4: Check connection pool limits
# STEP 5: Verify IP allowlist (Render IP allowed?)
# STEP 6: Restart database service if needed
# STEP 7: Check for long-running queries blocking connections
```

### Scenario D: Frontend Shows Old Version
```bash
# STEP 1: Verify file uploaded to correct location
# STEP 2: Check if CDN cache needs purge
# STEP 3: Add cache-busting query strings
# <link rel="stylesheet" href="/style.css?v=2">

# STEP 4: Check if service worker caching old version
# STEP 5: Force hard refresh (Ctrl+Shift+R)
# STEP 6: Check Render build logs for errors
# STEP 7: Verify correct branch deployed (main vs master)
```

### Scenario E: Complete System Rebuild
```bash
# EMERGENCY NUCLEAR OPTION:

# 1. Export database
pg_dump "$DATABASE_URL" > qudozen_backup_$(date +%Y%m%d).sql

# 2. Clone latest known good code
git clone [repository] qudozen-fresh
cd qudozen-fresh

# 3. Install dependencies
npm install

# 4. Set all environment variables
cp .env.example .env
# Edit .env with all required values

# 5. Run database migrations
npm run migrate

# 6. Seed essential data
npm run seed

# 7. Deploy to fresh Render instance
# 8. Update DNS to new IP
# 9. Verify all integrations
# 10. Monitor for 24 hours
```

---

## SECTION 13: TESTING MATRIX

### 13.1 End-to-End User Flows

**Flow 1: New Visitor -> Understand -> Subscribe**
```
1. Visit qudozen.com
2. See liquid aesthetic hero
3. Scroll to 3-layer system explanation
4. Click "I want to understand the system" in Contact Flow
5. Navigate through chat tree
6. Click pricing
7. Select "System" (499 + 699)
8. Fill registration form
9. Receive WhatsApp confirmation
10. See dashboard onboarding
```

**Flow 2: Existing Doctor -> Dashboard -> Alert**
```
1. Login to dashboard
2. See "System Reality Check" widget
3. View operational metrics (not financial)
4. Receive patient message on WhatsApp
5. AI handles conversation
6. See appointment auto-booked
7. Receive daily summary at 6 PM
```

**Flow 3: Admin -> System Down -> Alert**
```
1. Database connection fails
2. System detects failure
3. Sends WhatsApp to 0570733834
4. Admin receives alert
5. Admin checks Render logs
6. Admin restarts service
7. System sends recovery confirmation
```

### 13.2 Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| Patient sends image on WhatsApp | Acknowledge, ask for text description |
| Patient sends voice message | Transcribe if possible, else ask to text |
| Double-booking detected | Suggest alternative times, notify admin |
| Clinic closes early (emergency) | Auto-reschedule, notify patients |
| AI confidence < 80% | Escalate to human with context |
| Twilio webhook timeout | Queue message, retry 3x, then alert |
| Database write fails | Rollback, log error, notify admin |
| Rate limit exceeded | Graceful degradation, queue requests |

---

## SECTION 14: DOCUMENTATION REQUIREMENTS

### 14.1 README.md Template
```markdown
# Qudozen
## Autonomous Healthcare Operating System

### Quick Start
1. Clone repository
2. Copy .env.example to .env and fill values
3. npm install
4. npm run migrate
5. npm run dev

### Environment Variables
| Variable | Required | Description |
|----------|----------|-------------|
| DATABASE_URL | Yes | Supabase PostgreSQL connection |
| TWILIO_ACCOUNT_SID | Yes | Twilio account identifier |
| TWILIO_AUTH_TOKEN | Yes | Twilio authentication |
| ... | ... | ... |

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/webhook/whatsapp | Incoming WhatsApp messages |
| GET | /api/health | System health check |
| ... | ... | ... |

### Deployment
1. Push to main branch
2. Render auto-deploys
3. Verify at https://qudozen.com

### Monitoring
- Logs: Render Dashboard
- Errors: [Error tracking service]
- Uptime: [Uptime monitoring service]
```

### 14.2 API Documentation
```yaml
# openapi.yaml
openapi: 3.0.0
info:
  title: Qudozen API
  version: 2.0.0
paths:
  /api/webhook/whatsapp:
    post:
      summary: Receive WhatsApp messages
      requestBody:
        required: true
        content:
          application/x-www-form-urlencoded:
            schema:
              type: object
              properties:
                From:
                  type: string
                Body:
                  type: string
                MessageSid:
                  type: string
      responses:
        200:
          description: Message processed
        403:
          description: Invalid signature
        500:
          description: Server error
```

### 14.3 Change Log Format
```markdown
## [2.0.0] - 2026-04-19
### Added
- Liquid aesthetic redesign
- Correct pricing: 299/499+699/Swarm
- Contact Flow offline chat system
- Operational dashboard (no financial data)
- Twilio signature verification
- Saudi timezone enforcement
- Atomic processing locks

### Changed
- Positioning: from revenue tool to infrastructure OS
- Visual language: from neon to bioluminescent

### Removed
- Loss calculator
- Financial projections
- Fake urgency elements

### Fixed
- Timezone midnight bug
- Webhook signature bypass vulnerability
- Atomic lock race conditions
```

---

## SECTION 15: KNOWLEDGE BASE FOR AI ASSISTANTS

### 15.1 Context Summary (Paste to Any AI)
```
Qudozen is an Autonomous Operating System for healthcare facilities,
starting with dental clinics in Saudi Arabia.

CORE PRINCIPLES:
1. Sell operational consciousness, not revenue generation
2. Liquid aesthetic: calm, breathing, zero chaos
3. Three layers: Reception -> Coordination -> Evolution
4. Pricing: 299 (Awareness) / 499+699 (System) / Swarm (custom)
5. WhatsApp-native, Arabic-first, Saudi-hosted

CURRENT CRISIS:
- Domain qudozen.com not resolving correctly
- Frontend showing old version (wrong pricing, wrong messaging)
- WhatsApp integration broken
- Multiple platforms used without coordination
- Features built but not deployed

TECH STACK:
- Frontend: React + Tailwind + GSAP (liquid aesthetic)
- Backend: Node.js + Express
- Database: Supabase PostgreSQL
- Messaging: Twilio WhatsApp Business API
- Hosting: Render
- Domain: [registrar unknown, needs verification]

ADMIN CONTACT: 0570733834
TIMEZONE: Asia/Riyadh (UTC+3)
```

### 15.2 Decision Tree for Common Issues
```
[Domain not working]
    |- DNS issue? -> Check A records, NS lookup
    |- SSL issue? -> Check certificate expiry
    |- Hosting down? -> Check Render status
    |- CDN issue? -> Purge cache

[WhatsApp not working]
    |- Twilio account? -> Check balance, status
    |- Webhook URL? -> Test reachability
    |- Signature verify? -> Test with valid/invalid sig
    |- Sandbox mode? -> Check join code
    |- Number format? -> Validate Saudi format

[Database error]
    |- Connection? -> Test psql connection
    |- Credentials? -> Verify env vars
    |- Pool exhausted? -> Check active connections
    |- Query slow? -> Check indexes, explain analyze

[Frontend wrong]
    |- Wrong file deployed? -> Check Render build output
    |- CDN cached? -> Purge, add version query
    |- Branch mismatch? -> Verify main vs master
    |- Build failed? -> Check logs, dependencies
```

---

## SECTION 16: FINAL VERIFICATION CHECKLIST

### Pre-Deployment
- [ ] All environment variables set
- [ ] Database migrations run
- [ ] Twilio webhooks configured
- [ ] SSL certificate valid
- [ ] DNS records correct
- [ ] CDN cache purged

### Post-Deployment
- [ ] qudozen.com loads correctly
- [ ] www.qudozen.com redirects to qudozen.com
- [ ] HTTPS enforced (no HTTP access)
- [ ] Mobile responsive (test iPhone + Android)
- [ ] Arabic RTL correct
- [ ] Pricing shows 499 + 699 (not 799)
- [ ] No "loss calculator" visible
- [ ] Contact Flow chat appears
- [ ] Dashboard shows operational metrics

### Integration Tests
- [ ] Send WhatsApp to clinic -> AI responds in 3s
- [ ] Book appointment -> Appears in dashboard
- [ ] Complete simulation -> Dashboard updates
- [ ] Trigger error -> Admin receives alert
- [ ] Visit pricing -> Shows correct tiers

### Monitoring
- [ ] Error logs flowing
- [ ] Admin alerts working
- [ ] Uptime monitoring active
- [ ] Performance metrics acceptable

---

## APPENDIX A: COMMAND REFERENCE

### DNS
```bash
nslookup qudozen.com
dig qudozen.com ANY
whois qudozen.com
```

### SSL
```bash
openssl s_client -connect qudozen.com:443
nmap --script ssl-cert qudozen.com
```

### Server
```bash
curl -I https://qudozen.com
curl -s https://qudozen.com | wc -c
ping -c 4 qudozen.com
```

### Database
```bash
psql "$DATABASE_URL" -c "\\dt"
psql "$DATABASE_URL" -c "SELECT count(*) FROM clinics;"
pg_dump "$DATABASE_URL" > backup.sql
```

### Twilio
```bash
curl -X GET "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID" \
  -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN"
```

---

## APPENDIX B: CONTACT INFORMATION TEMPLATE

Fill in and store securely:

| Service | Account | URL | Recovery Method |
|---------|---------|-----|-----------------|
| Domain Registrar | | | |
| Render | | https://dashboard.render.com | |
| Supabase | | https://app.supabase.com | |
| Twilio | | https://console.twilio.com | |
| Cloudflare (if used) | | https://dash.cloudflare.com | |
| Git Repository | | | |
| Admin Phone | 0570733834 | WhatsApp/SMS | |

---

## DOCUMENT METADATA

```yaml
document: Qudozen Universal Debugging & Audit Prompt
version: 3.0
total_lines: 3000+
created: 2026-04-19
last_updated: 2026-04-19
author: System Recovery Team
status: ACTIVE
next_review: 2026-04-26
```

---

## EXECUTION INSTRUCTIONS

1. **Copy this entire document**
2. **Paste into Claude Terminal / Cloud Code / Antigravity**
3. **Add:** "Execute Section [X] now" to focus on specific area
4. **Report:** All RED CRITICAL items must be resolved first
5. **Update:** This document after each fix

**PRIORITY ORDER:**
1. Domain/DNS (Section 1)
2. Hosting/Deployment (Section 2)
3. Database (Section 3)
4. WhatsApp/Twilio (Section 4)
5. Frontend (Section 6)
6. Everything else

---

END OF DOCUMENT
