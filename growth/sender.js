/**
 * sender.js — Anti-Gravity V2.5
 * Bilingual follow-ups + opt-out
 */

const twilio = require('twilio');
const { createClient } = require('@supabase/supabase-js');
const { generateMessage, buildGhostRoomUrl, detectLanguage } = require('./brain');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const OPT_OUT_KEYWORDS = [
  'stop','unsubscribe','cancel','end','quit','remove',
  'توقف','إلغاء','لا أريد','أرجو','حذف','أوقف',
];

function checkOptOut(message) {
  if (!message) return false;
  const lower = message.toLowerCase().trim();
  return OPT_OUT_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
}

async function sendWhatsApp(phone, message) {
  try {
    const msg = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to: `whatsapp:${phone}`,
      body: message,
    });
    console.log(`[sender.js] Sent to ${phone} — SID: ${msg.sid}`);
    return { success: true, sid: msg.sid };
  } catch (err) {
    console.error('[sender.js] Twilio error:', err.message);
    return { success: false, error: err.message };
  }
}

async function processBatch(limit = 5) {
  const { data: leads, error } = await supabase
    .from('growth_leads_v2')
    .select('*')
    .in('status', ['new', 'verified_owner'])
    .order('confidence_score', { ascending: false })
    .limit(limit);

  if (error || !leads?.length) {
    console.log('[sender.js] No leads to process');
    return [];
  }

  console.log(`[sender.js] Processing ${leads.length} leads...`);
  const results = [];

  for (const lead of leads) {
    try {
      const message = await generateMessage(lead);
      const sent = await sendWhatsApp(lead.phone, message);

      if (sent.success) {
        const now = new Date().toISOString();
        await supabase.from('growth_leads_v2').update({
          status: 'messaged',
          last_message_sent: message,
          last_contacted_at: now,
          first_contacted_at: lead.first_contacted_at || now,
          message_count: (lead.message_count || 0) + 1,
        }).eq('id', lead.id);
      }

      results.push({ phone: lead.phone, name: lead.name, sent: sent.success, sid: sent.sid || sent.error });
    } catch (err) {
      console.error(`[sender.js] Error for ${lead.name}:`, err.message);
      results.push({ phone: lead.phone, name: lead.name, sent: false, error: err.message });
    }
  }

  return results;
}

async function sendFollowUps() {
  const results = [];
  const now = new Date();

  const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Bump 1 — Day 3
  const { data: bump1 } = await supabase
    .from('growth_leads_v2')
    .select('*')
    .eq('status', 'messaged')
    .lt('last_contacted_at', threeDaysAgo);

  if (bump1?.length) {
    console.log(`[sender.js] Bump 1: ${bump1.length} leads`);
    for (const lead of bump1) {
      const lang = detectLanguage(lead);
      const url = buildGhostRoomUrl(lead);
      const name = lead.name || 'دكتور';
      const message = lang === 'ar'
        ? `دكتور ${name}، هل فكرت في عدد المرضى الذين تفقدهم يومياً؟ أنا هنا إذا أردت الحل. ${url} -جيك`
        : `Dr. ${name}, have you counted how many patients slip away daily? I'm here if you want the fix. ${url} -Jake`;

      const sent = await sendWhatsApp(lead.phone, message);
      if (sent.success) {
        await supabase.from('growth_leads_v2').update({
          status: 'bumped_1',
          last_message_sent: message,
          last_contacted_at: now.toISOString(),
          message_count: (lead.message_count || 0) + 1,
        }).eq('id', lead.id);
        results.push({ name: lead.name, bump: 'bumped_1', sid: sent.sid });
      }
    }
  }

  // Bump 2 — Day 7
  const { data: bump2 } = await supabase
    .from('growth_leads_v2')
    .select('*')
    .eq('status', 'bumped_1')
    .lt('last_contacted_at', sevenDaysAgo);

  if (bump2?.length) {
    console.log(`[sender.js] Bump 2: ${bump2.length} leads`);
    for (const lead of bump2) {
      const lang = detectLanguage(lead);
      const url = buildGhostRoomUrl(lead);
      const name = lead.name || 'دكتور';
      const message = lang === 'ar'
        ? `دكتور ${name}، هذه آخر رسالة مني. إذا تغير الوقت، أنا موجود. ${url} -جيك`
        : `Dr. ${name}, last message from me. If timing changes, I'm here. ${url} -Jake`;

      const sent = await sendWhatsApp(lead.phone, message);
      if (sent.success) {
        await supabase.from('growth_leads_v2').update({
          status: 'bumped_2',
          last_message_sent: message,
          last_contacted_at: now.toISOString(),
          message_count: (lead.message_count || 0) + 1,
        }).eq('id', lead.id);
        results.push({ name: lead.name, bump: 'bumped_2', sid: sent.sid });
      }
    }
  }

  return results;
}

module.exports = { sendWhatsApp, processBatch, sendFollowUps, checkOptOut };
