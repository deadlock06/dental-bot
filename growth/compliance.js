const { DateTime } = require('luxon');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

function isWithinBusinessHours() {
  const now = DateTime.now().setZone('Asia/Riyadh');
  const hour = now.hour;
  const day = now.weekday; // 1 = Mon, 7 = Sun
  
  // Saudi business hours typically Sunday - Thursday, 9 AM to 6 PM
  // Some clinics work Saturday. We'll stick to safe hours: 10 AM to 5 PM
  if (day === 5) return false; // Friday off
  
  if (hour >= 10 && hour <= 17) {
    return true;
  }
  
  return false;
}

function detectStopCommand(messageText) {
  const lower = messageText.toLowerCase().trim();
  const stops = ['stop', 'unsubscribe', 'cancel', 'remove', 'quit', 'لا', 'توقف', 'إلغاء'];
  return stops.some(stop => lower.includes(stop));
}

async function auditTrailLog(action, entityId, details) {
  try {
    // In a real system, we'd have a gs_audit_log table. For now, output to console.
    console.log(`[compliance][AUDIT] ${action} on ${entityId}: ${JSON.stringify(details)}`);
  } catch (e) {
    console.error('Audit log failed', e);
  }
}

module.exports = {
  isWithinBusinessHours,
  detectStopCommand,
  auditTrailLog
};
