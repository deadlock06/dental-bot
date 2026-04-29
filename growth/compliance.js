const { DateTime } = require('luxon');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

function isWithinBusinessHours() {
  // For worldwide outreach, we use a conservative 'Safe Global Window'
  // Or ideally, this should detect the lead's timezone.
  // For now, we use UTC 7 AM to 3 PM (which covers morning/afternoon in most of EMEA)
  const now = DateTime.now().setZone('UTC');
  const hour = now.hour;
  const day = now.weekday; 

  // Avoid weekends globally
  if (day === 6 || day === 7) return false;
  
  // Safe window: 7 AM UTC to 4 PM UTC
  if (hour >= 7 && hour <= 16) {
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
