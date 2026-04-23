const { createClient } = require('@supabase/supabase-js');
const { getGhostRoomUrl, detectLanguage } = require('./brain');
const { sendWhatsApp } = require('./lib/whatsappProvider');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function sendFollowUps() {
  const results = [];
  const now = new Date();
  const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Bump 1
  const { data: bump1 } = await supabase
    .from('growth_leads_v2')
    .select('*')
    .eq('status', 'messaged')
    .lt('last_contacted_at', threeDaysAgo);

  if (bump1) {
    for (const lead of bump1) {
      const url = getGhostRoomUrl(lead);
      const name = lead.name || '';
      const msg = detectLanguage(lead) === 'ar'
        ? `دكتور ${name}، هل فكرت في عدد المرضى الذين تفقدهم يومياً؟ أنا هنا إذا أردت الحل. ${url} -جيك`
        : `Dr. ${name}, have you counted how many patients slip away daily? I'm here if you want the fix. ${url} -Jake`;

      const sent = await sendWhatsApp(lead.phone, msg);
      if (sent.success) {
        await supabase.from('growth_leads_v2').update({ status: 'bumped_1', last_contacted_at: now.toISOString() }).eq('id', lead.id);
        results.push({ id: lead.id, bump: 'bumped_1', sid: sent.sid });
      }
    }
  }

  // Bump 2
  const { data: bump2 } = await supabase
    .from('growth_leads_v2')
    .select('*')
    .eq('status', 'bumped_1')
    .lt('last_contacted_at', sevenDaysAgo);

  if (bump2) {
    for (const lead of bump2) {
      const url = getGhostRoomUrl(lead);
      const name = lead.name || '';
      const msg = detectLanguage(lead) === 'ar'
        ? `دكتور ${name}، هذه آخر رسالة مني. إذا تغير الوقت، أنا موجود. ${url} -جيك`
        : `Dr. ${name}, last message from me. If timing changes, I'm here. ${url} -Jake`;

      const sent = await sendWhatsApp(lead.phone, msg);
      if (sent.success) {
        await supabase.from('growth_leads_v2').update({ status: 'bumped_2', last_contacted_at: now.toISOString() }).eq('id', lead.id);
        results.push({ id: lead.id, bump: 'bumped_2', sid: sent.sid });
      }
    }
  }
  return results;
}

async function processBatch(supabase, leads) {
  const results = [];
  for (const lead of leads) {
    const { getGhostRoomUrl: gr, detectLanguage: dl } = require('./brain');
    const url = gr(lead);
    const msg = dl(lead) === 'ar'
      ? `مرحباً دكتور ${lead.name || ''}، مرضى ${lead.company_name || 'العيادة'} يذهبون للمنافسين. اكتشف كم تخسر: ${url} -جيك`
      : `Hi Dr. ${lead.name || ''}, patients at ${lead.company_name || 'your clinic'} are going to competitors. See what you're losing: ${url} -Jake`;
    const sent = await sendWhatsApp(lead.phone, msg);
    results.push({ id: lead.id, success: sent.success, provider: sent.provider });
  }
  return results;
}

module.exports = { sendFollowUps, processBatch };
