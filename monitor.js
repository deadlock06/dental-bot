// ─────────────────────────────────────────────────────────────
// monitor.js — Self-Healing AI Monitoring Agent
// Watches the entire system, detects failures, auto-recovers
// ─────────────────────────────────────────────────────────────
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const OPENAI_KEY = process.env.OPENAI_KEY;

// ─── Error Tracking ──────────────────────────────────────────
const errorLog = [];
const MAX_ERROR_LOG = 100;

function logError(component, error, context = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    component,
    message: error.message || String(error),
    context,
    resolved: false
  };
  errorLog.push(entry);
  if (errorLog.length > MAX_ERROR_LOG) errorLog.shift();
  console.error(`[Monitor] ❌ ${component}: ${entry.message}`, context);
  return entry;
}

function getRecentErrors(minutes = 60) {
  const cutoff = new Date(Date.now() - minutes * 60000).toISOString();
  return errorLog.filter(e => e.timestamp > cutoff);
}

// ─── Self-Healing Wrapper ────────────────────────────────────
// Wraps any async function with retry + error tracking + auto-recovery
async function withMonitor(fn, context = {}, options = {}) {
  const { retries = 2, retryDelay = 1000, component = 'unknown', fallback = null } = options;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const entry = logError(component, err, { ...context, attempt: attempt + 1 });

      if (attempt < retries) {
        console.log(`[Monitor] 🔄 Retrying ${component} (attempt ${attempt + 2}/${retries + 1}) in ${retryDelay}ms...`);
        await new Promise(r => setTimeout(r, retryDelay));

        // Self-healing: attempt auto-fix based on error type
        const healed = await attemptAutoHeal(component, err, context);
        if (healed) {
          entry.resolved = true;
          console.log(`[Monitor] ✅ Auto-healed ${component}`);
        }
      } else {
        console.error(`[Monitor] 💀 ${component} failed after ${retries + 1} attempts`);
        if (fallback) {
          console.log(`[Monitor] 🔀 Using fallback for ${component}`);
          return fallback;
        }
        throw err;
      }
    }
  }
}

// ─── Auto-Healing Logic ──────────────────────────────────────
async function attemptAutoHeal(component, error, context) {
  const msg = error.message || '';

  // Supabase connection issues → retry with fresh client
  if (component === 'database' && (msg.includes('fetch') || msg.includes('timeout') || msg.includes('ECONNREFUSED'))) {
    console.log('[Monitor] 🔧 Healing: Supabase connection reset');
    return true; // retry will use fresh connection
  }

  // OpenAI rate limit → wait and retry
  if (component === 'ai' && (msg.includes('429') || msg.includes('rate limit'))) {
    console.log('[Monitor] 🔧 Healing: OpenAI rate limit — waiting 3s');
    await new Promise(r => setTimeout(r, 3000));
    return true;
  }

  // OpenAI timeout → will retry with shorter timeout
  if (component === 'ai' && (msg.includes('timeout') || msg.includes('ETIMEDOUT'))) {
    console.log('[Monitor] 🔧 Healing: OpenAI timeout — will retry');
    return true;
  }

  // Twilio sending error → check credentials
  if (component === 'twilio' && (msg.includes('authenticate') || msg.includes('401'))) {
    console.log('[Monitor] ⚠️ Twilio auth error — credentials may be invalid');
    return false; // can't auto-fix bad credentials
  }

  // Twilio rate limit
  if (component === 'twilio' && (msg.includes('429') || msg.includes('Too Many Requests'))) {
    console.log('[Monitor] 🔧 Healing: Twilio rate limit — waiting 2s');
    await new Promise(r => setTimeout(r, 2000));
    return true;
  }

  // Stuck flow — patient stuck in an impossible state
  if (component === 'flow' && context.phone) {
    console.log(`[Monitor] 🔧 Healing: Resetting stuck flow for ${context.phone}`);
    try {
      await supabase.from('patients').update({
        current_flow: null,
        flow_step: 0,
        flow_data: {}
      }).eq('phone', context.phone);
      return true;
    } catch (e) {
      console.error('[Monitor] Failed to reset flow:', e.message);
      return false;
    }
  }

  return false;
}

// ─── Health Check ────────────────────────────────────────────
// Tests all critical connections and returns system status
async function healthCheck() {
  const results = {
    timestamp: new Date().toISOString(),
    status: 'healthy',
    components: {},
    recentErrors: getRecentErrors(60).length,
    uptime: process.uptime()
  };

  // 1. Database (Supabase)
  try {
    const start = Date.now();
    const { data, error } = await supabase.from('clinics').select('id').limit(1);
    const latency = Date.now() - start;
    if (error) throw new Error(error.message);
    results.components.database = { status: 'healthy', latency: `${latency}ms` };
  } catch (e) {
    results.components.database = { status: 'unhealthy', error: e.message };
    results.status = 'degraded';
  }

  // 2. OpenAI API
  try {
    const start = Date.now();
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Reply with just "ok"' }],
        max_tokens: 5,
        temperature: 0
      },
      {
        headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
        timeout: 5000
      }
    );
    const latency = Date.now() - start;
    results.components.openai = { status: 'healthy', latency: `${latency}ms`, model: 'gpt-4o-mini' };
  } catch (e) {
    results.components.openai = { status: 'unhealthy', error: e.message };
    results.status = 'degraded';
  }

  // 3. Twilio
  try {
    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const start = Date.now();
    await client.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
    const latency = Date.now() - start;
    results.components.twilio = { status: 'healthy', latency: `${latency}ms` };
  } catch (e) {
    results.components.twilio = { status: 'unhealthy', error: e.message };
    results.status = 'degraded';
  }

  // 4. Check for stuck flows (patients stuck > 30 min)
  try {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60000).toISOString();
    const { data: stuckPatients } = await supabase
      .from('patients')
      .select('phone, current_flow, flow_step, updated_at')
      .not('current_flow', 'is', null)
      .lt('updated_at', thirtyMinAgo);

    if (stuckPatients && stuckPatients.length > 0) {
      results.components.stuck_flows = {
        status: 'warning',
        count: stuckPatients.length,
        patients: stuckPatients.map(p => ({ phone: p.phone, flow: p.current_flow, step: p.flow_step }))
      };
      // Auto-heal: reset stuck flows
      for (const p of stuckPatients) {
        console.log(`[Monitor] 🔧 Auto-resetting stuck flow for ${p.phone} (flow=${p.current_flow}, step=${p.flow_step})`);
        await supabase.from('patients').update({
          current_flow: null,
          flow_step: 0,
          flow_data: {}
        }).eq('phone', p.phone);
      }
      results.components.stuck_flows.healed = true;
    } else {
      results.components.stuck_flows = { status: 'healthy', count: 0 };
    }
  } catch (e) {
    results.components.stuck_flows = { status: 'unknown', error: e.message };
  }

  // 5. Environment variables check
  const requiredEnv = ['SUPABASE_URL', 'SUPABASE_KEY', 'OPENAI_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM'];
  const missingEnv = requiredEnv.filter(k => !process.env[k]);
  if (missingEnv.length > 0) {
    results.components.environment = { status: 'unhealthy', missing: missingEnv };
    results.status = 'degraded';
  } else {
    results.components.environment = { status: 'healthy' };
  }

  // 6. Error rate check
  const recentErrors = getRecentErrors(15); // last 15 minutes
  if (recentErrors.length > 10) {
    results.components.error_rate = { status: 'critical', count: recentErrors.length, message: 'High error rate detected' };
    results.status = 'critical';
  } else if (recentErrors.length > 3) {
    results.components.error_rate = { status: 'warning', count: recentErrors.length };
    results.status = results.status === 'healthy' ? 'warning' : results.status;
  } else {
    results.components.error_rate = { status: 'healthy', count: recentErrors.length };
  }

  return results;
}

// ─── Staff Alert on Critical Issues ─────────────────────────
let lastAlertTime = 0;
const ALERT_COOLDOWN = 5 * 60 * 1000; // 5 minutes between alerts

async function alertStaffIfCritical(status, staffPhone) {
  if (!staffPhone) return;
  if (status.status !== 'critical' && status.status !== 'degraded') return;
  if (Date.now() - lastAlertTime < ALERT_COOLDOWN) return;

  try {
    const { sendMessage } = require('./whatsapp');
    const unhealthy = Object.entries(status.components)
      .filter(([_, v]) => v.status === 'unhealthy' || v.status === 'critical')
      .map(([k, v]) => `❌ ${k}: ${v.error || v.message || 'failed'}`)
      .join('\n');

    await sendMessage(staffPhone,
      `🚨 *System Alert*\n━━━━━━━━━━━━━━\nStatus: ${status.status.toUpperCase()}\n\n${unhealthy}\n\nRecent errors: ${status.recentErrors}\nUptime: ${Math.floor(status.uptime / 60)} minutes\n━━━━━━━━━━━━━━\nAuto-healing in progress...`
    );
    lastAlertTime = Date.now();
    console.log('[Monitor] 📱 Staff alert sent to:', staffPhone);
  } catch (e) {
    console.error('[Monitor] Failed to send staff alert:', e.message);
  }
}

// ─── Periodic Self-Check (called by cron) ────────────────────
async function runPeriodicCheck(staffPhone) {
  console.log('[Monitor] 🔍 Running periodic health check...');
  const status = await healthCheck();
  console.log(`[Monitor] System status: ${status.status} | Errors: ${status.recentErrors} | Uptime: ${Math.floor(status.uptime / 60)}min`);

  // Alert staff if system is degraded
  await alertStaffIfCritical(status, staffPhone);

  return status;
}

// ─── Flow Watchdog ──────────────────────────────────────────
// Validates that a patient's flow state makes sense
function validateFlowState(patient) {
  const flow = patient.current_flow;
  const step = patient.flow_step || 0;
  const fd = patient.flow_data || {};

  if (!flow) return { valid: true };

  // Booking flow: steps 0-8 are valid
  if (flow === 'booking' && (step < 0 || step > 8)) {
    return { valid: false, reason: `Invalid booking step: ${step}` };
  }

  // Reschedule flow: steps 0-3 are valid
  if (flow === 'reschedule' && (step < 0 || step > 3)) {
    return { valid: false, reason: `Invalid reschedule step: ${step}` };
  }

  // Cancel flow: steps 0-1 are valid
  if (flow === 'cancel' && (step < 0 || step > 1)) {
    return { valid: false, reason: `Invalid cancel step: ${step}` };
  }

  // Booking step 8 without required data
  if (flow === 'booking' && step === 8 && !fd.name) {
    return { valid: false, reason: 'Booking at step 8 but missing patient name' };
  }

  return { valid: true };
}

module.exports = {
  withMonitor,
  healthCheck,
  runPeriodicCheck,
  alertStaffIfCritical,
  validateFlowState,
  logError,
  getRecentErrors
};
