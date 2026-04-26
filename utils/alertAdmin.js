/**
 * alertAdmin.js — Loud failure alerts
 * Replaces "log and continue" with "alert and continue" for critical failures.
 * Import this wherever a silent failure causes business damage.
 * 
 * Usage:
 *   const { alertAdmin } = require('./utils/alertAdmin');
 *   await alertAdmin('STRIPE_WEBHOOK_FAILED', { phone, error: err.message });
 */

const { sendMessage } = require('../whatsapp');

const ADMIN_PHONE = process.env.ADMIN_PHONE || '966500000000';

const ALERT_LEVELS = {
  CRITICAL: '🔴 CRITICAL',
  HIGH:     '🟠 HIGH',
  MEDIUM:   '🟡 MEDIUM'
};

// In-memory dedup: don't fire the same alert more than once per 5 minutes
const _recentAlerts = new Map();
const ALERT_DEDUP_MS = 5 * 60 * 1000;

async function alertAdmin(code, context = {}, level = 'HIGH') {
  try {
    const dedupKey = `${code}:${JSON.stringify(context).slice(0, 50)}`;
    const last = _recentAlerts.get(dedupKey);
    if (last && Date.now() - last < ALERT_DEDUP_MS) {
      console.log(`[Alert] Suppressed duplicate: ${code}`);
      return;
    }
    _recentAlerts.set(dedupKey, Date.now());

    const prefix = ALERT_LEVELS[level] || ALERT_LEVELS.HIGH;
    const lines = [`${prefix} SYSTEM ALERT: ${code}`];
    for (const [k, v] of Object.entries(context)) {
      lines.push(`• ${k}: ${String(v).slice(0, 100)}`);
    }
    lines.push(`\nTime: ${new Date().toISOString()}`);

    const msg = lines.join('\n');
    console.error(`[Alert] ${msg}`);
    await sendMessage(ADMIN_PHONE, msg);
  } catch (e) {
    // Never let the alert system crash the parent flow
    console.error('[Alert] Failed to send admin alert:', e.message);
  }
}

module.exports = { alertAdmin };
