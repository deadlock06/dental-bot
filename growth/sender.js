const twilio = require('twilio');
const { createClient } = require('@supabase/supabase-js');
const { generateMessage } = require('./brain');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function sendWhatsApp(phone, message) {
  try {
    const msg = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to: `whatsapp:${phone}`,
      body: message
    });
    return { success: true, sid: msg.sid };
  } catch (err) {
    console.error('Send failed:', err.message);
    return { success: false, error: err.message };
  }
}

async function processBatch(limit = 5) {
  const { data: leads, error } = await supabase
    .from('growth_leads')
    .select('*')
    .eq('status', 'new')
    .limit(limit);

  if (error || !leads || leads.length === 0) {
    console.log('No new leads to message');
    return [];
  }

  const results = [];
  for (const lead of leads) {
    const message = await generateMessage(lead);
    const sent = await sendWhatsApp(lead.phone, message);

    if (sent.success) {
      await supabase.from('growth_leads').update({
        status: 'messaged',
        last_message_sent: message,
        first_contacted_at: new Date().toISOString(),
        last_contacted_at: new Date().toISOString(),
        message_count: 1
      }).eq('id', lead.id);
    }

    results.push({ phone: lead.phone, sent: sent.success, sid: sent.sid || sent.error });
  }

  return results;
}

// ─────────────────────────────────────────────
// Follow-up sequence — runs daily at 9 AM
// Sends a bump to leads that haven't replied in 3 days (message_count < 3)
// ─────────────────────────────────────────────
const FOLLOWUP_TEMPLATES = [
  // message_count === 1 → Day 3 bump
  (lead) =>
    `Hey ${lead.name || 'Doctor'}, just following up — still curious how much ${lead.business_name || 'your clinic'} loses to missed calls each month? The link shows your exact number: ${buildGhostRoomUrl(lead)} -Jake`,

  // message_count === 2 → Day 7 final nudge
  (lead) =>
    `Last message from me, ${lead.name || 'Doctor'} — if the timing isn't right, no worries. The report for ${lead.business_name || 'your clinic'} is still here when you're ready: ${buildGhostRoomUrl(lead)} -Jake`
];

function buildGhostRoomUrl(lead) {
  const base = (process.env.BASE_URL || '').replace(/\/$/, '');
  if (!base) return '';
  const phone = (process.env.TWILIO_WHATSAPP_FROM || '').replace(/^whatsapp:/i, '');
  const qs = new URLSearchParams({
    name:   lead.name          || '',
    clinic: lead.business_name || '',
    city:   lead.city          || '',
    pain:   lead.pain_signal   || 'default',
    phone:  phone
  });
  return `${base}/growth/room?${qs.toString()}`;
}

async function sendFollowUps() {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Leads messaged 3+ days ago with 1 message sent (Day 3 bump)
  // Leads messaged 7+ days ago with 2 messages sent (Day 7 final)
  const { data: leads, error } = await supabase
    .from('growth_leads')
    .select('*')
    .eq('status', 'messaged')
    .lt('message_count', 3)
    .or(
      `and(message_count.eq.1,last_contacted_at.lt.${threeDaysAgo}),` +
      `and(message_count.eq.2,last_contacted_at.lt.${sevenDaysAgo})`
    );

  if (error) {
    console.error('[FollowUp] Supabase query error:', error.message);
    return [];
  }

  if (!leads || leads.length === 0) {
    console.log('[FollowUp] No leads due for follow-up');
    return [];
  }

  console.log(`[FollowUp] ${leads.length} lead(s) due for follow-up`);
  const results = [];

  for (const lead of leads) {
    // Pick the right template: index 0 for first follow-up, index 1 for second
    const templateIndex = (lead.message_count || 1) - 1;
    const template = FOLLOWUP_TEMPLATES[templateIndex];
    if (!template) continue;

    const message = template(lead);
    const sent = await sendWhatsApp(lead.phone, message);

    if (sent.success) {
      await supabase.from('growth_leads').update({
        last_message_sent: message,
        last_contacted_at: new Date().toISOString(),
        message_count: (lead.message_count || 1) + 1
      }).eq('id', lead.id);

      console.log(`[FollowUp] Sent bump #${(lead.message_count || 1) + 1} to ${lead.phone} (${lead.business_name})`);
    }

    results.push({ phone: lead.phone, sent: sent.success, bump: templateIndex + 1, sid: sent.sid || sent.error });
  }

  return results;
}

module.exports = { sendWhatsApp, processBatch, sendFollowUps };
