const cron = require('node-cron');
const axios = require('axios');
const { DateTime } = require('luxon');
require('dotenv').config();

// Configuration
const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
console.log(`[Worker] Starting Qudozen Autonomous Worker...`);
console.log(`[Worker] Target Base URL: ${BASE_URL}`);

// Helper to log with timestamp
const log = (msg) => console.log(`[${new Date().toISOString()}] [Worker] ${msg}`);

// 1. Reminders - Every 30 minutes
cron.schedule('*/30 * * * *', async () => {
  log('Triggering 30-min reminder check...');
  try {
    await axios.post(`${BASE_URL}/send-reminders`);
  } catch (e) {
    console.error('[Worker] Reminder trigger error:', e.message);
  }
});

// 2. Slot Cleanup - Hourly
cron.schedule('0 * * * *', async () => {
  log('Triggering hourly slot cleanup...');
  try {
    await axios.post(`${BASE_URL}/cleanup-slots`);
  } catch (e) {
    console.error('[Worker] Cleanup trigger error:', e.message);
  }
});

// 3. System Health Check - Every 10 minutes
cron.schedule('*/10 * * * *', async () => {
  log('Running system health check...');
  try {
    // Health check logic often needs DB access, we'll proxy it to keep worker light
    // or we can import monitor directly if we share the DB config
    const { runPeriodicCheck } = require('./monitor');
    const { getClinic } = require('./db');
    const botPhoneRaw = process.env.WHATSAPP_PHONE_ID || '';
    const botPhone = botPhoneRaw.replace(/^whatsapp:/i, '').replace(/^\+/, '');
    const clinic = await getClinic(botPhone);
    const adminPhone = process.env.ADMIN_PHONE || clinic?.staff_phone || null;
    await runPeriodicCheck(adminPhone);
  } catch (e) {
    console.error('[Worker] Health check error:', e.message);
  }
});

// 4. Growth Follow-ups - Daily 9 AM Saudi (6 AM UTC)
cron.schedule('0 6 * * *', async () => {
  log('Running daily growth follow-ups...');
  try {
    await axios.post(`${BASE_URL}/growth/send-followups`);
  } catch (e) {
    console.error('[Worker] Follow-up trigger error:', e.message);
  }
});

// 5. Job Portal Scout - Every 6 hours
cron.schedule('0 */6 * * *', async () => {
  log('Running job portal scout (6h)...');
  try {
    const { runAllScouts } = require('./growth/scouts/orchestrator');
    const sb = require('./growth/lib/supabase');
    const report = await runAllScouts(sb, { scouts: ['indeed', 'job_portals'], autoSend: false });
    log(`Job scout done: ${report.inserted} new leads`);
  } catch (e) {
    console.error('[Worker] Job scout error:', e.message);
  }
});

// 6. Google Places Scout - Weekly Sunday 4 AM UTC
cron.schedule('0 4 * * 0', async () => {
  log('Running weekly Google Places scout...');
  try {
    const { runAllScouts } = require('./growth/scouts/orchestrator');
    const sb = require('./growth/lib/supabase');
    const report = await runAllScouts(sb, { scouts: ['google_places'], autoSend: false });
    log(`Places scout done: ${report.inserted} new leads`);
  } catch (e) {
    console.error('[Worker] Places scout error:', e.message);
  }
});

// 7. Auto-batch Send - Daily 10 AM Saudi (7 AM UTC)
cron.schedule('0 7 * * *', async () => {
  log('Running daily auto-batch send...');
  try {
    const { processBatch } = require('./growth/sender');
    const sb = require('./growth/lib/supabase');
    
    const { data: leads, error } = await sb
      .from('growth_leads_v2')
      .select('*')
      .in('status', ['new', 'verified_owner'])
      .order('confidence_score', { ascending: false, nullsFirst: false })
      .limit(10);

    if (error) throw error;
    if (leads && leads.length > 0) {
      const results = await processBatch(leads);
      const sent = results.filter(r => r.success).length;
      log(`Auto-batch done: ${sent} messages sent`);
    }
  } catch (e) {
    console.error('[Worker] Auto-batch error:', e.message);
  }
});

// 8. Morning Brief - Daily 08:30 Saudi (05:30 UTC)
cron.schedule('30 5 * * *', async () => {
  log('Running morning brief...');
  try {
    const sb = require('./growth/lib/supabase');
    const { sendMessage } = require('./whatsapp');
    const now = DateTime.now().setZone('Asia/Riyadh');
    const todayISO = now.toISODate();

    const [{ count: apptCount }, { count: leadCount }] = await Promise.all([
      sb.from('appointments').select('*', { count: 'exact', head: true })
        .eq('preferred_date_iso', todayISO).neq('status', 'cancelled'),
      sb.from('growth_leads_v2').select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
    ]);

    const { data: newLeads } = await sb.from('growth_leads_v2')
      .select('business_name, city, confidence_score')
      .gte('created_at', new Date(Date.now() - 86400000).toISOString())
      .order('confidence_score', { ascending: false })
      .limit(5);

    const topLeads = (newLeads || [])
      .map(l => `• ${l.business_name || 'Unknown'} (${l.city || '?'}) — ${l.confidence_score}%`)
      .join('\n') || 'None';

    const { getAdminPhone } = require('./growth/lib/phone');
    const adminPhone = getAdminPhone();
    if (!adminPhone) return;

    const msg = `☀️ Morning Brief — Qudozen OS\n\n📅 Appointments Today: ${apptCount || 0}\n🔥 Leads Pending: ${leadCount || 0}\n\n🏆 Top Leads Yesterday:\n${topLeads}\n\n— Autonomous System`;
    await sendMessage(adminPhone, msg);
    log('Morning brief sent to admin');
  } catch (e) {
    console.error('[Worker] Morning brief error:', e.message);
  }
});

log('✅ All schedulers active. Worker process running in background.');

// Handle graceful shutdown
process.on('SIGTERM', () => {
  log('SIGTERM received. Shutting down worker...');
  process.exit(0);
});
