const { createClient } = require('@supabase/supabase-js');
const { sendWhatsApp } = require('./lib/whatsappProvider');
const { isWithinBusinessHours } = require('./compliance');
const { applyGuardrails, getGhostRoomUrl, detectLanguage } = require('./brain');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const CADENCE = {
  hot: [0, 1, 3, 5],
  warm: [0, 3, 7]
};

const RATE_LIMITS = {
  system_daily: 50,
  lead_daily: 3
};

async function checkRateLimits(leadId) {
  const today = new Date().toISOString().split('T')[0];
  
  // Check system total for the day
  const { count: systemCount } = await supabase
    .from('gs_conversations')
    .select('*', { count: 'exact', head: true })
    .eq('direction', 'outbound')
    .gte('sent_at', today);
    
  if (systemCount >= RATE_LIMITS.system_daily) {
    console.warn(`[sender] System daily limit reached (${RATE_LIMITS.system_daily})`);
    return false;
  }

  // Check lead total for the day
  const { count: leadCount } = await supabase
    .from('gs_conversations')
    .select('*', { count: 'exact', head: true })
    .eq('direction', 'outbound')
    .eq('lead_id', leadId)
    .gte('sent_at', today);
    
  if (leadCount >= RATE_LIMITS.lead_daily) {
    console.warn(`[sender] Lead daily limit reached for ${leadId} (${RATE_LIMITS.lead_daily})`);
    return false;
  }

  return true;
}

async function sendFollowUps() {
  console.log('[sender] Processing scheduled follow-ups based on Hot/Warm cadences...');
  // Logic to process gs_sequences based on hot/warm priority cadence
}

async function processBatch(leads) {
  const results = [];
  
  if (!isWithinBusinessHours()) {
    console.warn('[sender] Outside business hours. Halting batch.');
    return results;
  }

  for (const lead of leads) {
    const canSend = await checkRateLimits(lead.id);
    if (!canSend) continue;

    const url = getGhostRoomUrl(lead);
    const lang = detectLanguage(lead);
    
    let msg = lang === 'ar'
      ? `مرحباً دكتور ${lead.name || ''}، مرضى ${lead.company_name || 'العيادة'} يذهبون للمنافسين. اكتشف كم تخسر:`
      : `Hi Dr. ${lead.name || ''}, patients at ${lead.company_name || 'your clinic'} are going to competitors. See what you're losing:`;
      
    // Apply guardrails handles constraints
    msg = applyGuardrails(msg);

    const sent = await sendWhatsApp(lead.phone, msg);
    results.push({ id: lead.id, success: sent.success });
    
    if (sent.success) {
      await supabase.from('gs_conversations').insert({
        lead_id: lead.id,
        channel: 'whatsapp',
        direction: 'outbound',
        message_text: msg,
        status: 'sent',
        ai_generated: true,
        sent_at: new Date().toISOString()
      });
    }
  }
  return results;
}

module.exports = { sendFollowUps, processBatch, CADENCE, RATE_LIMITS, checkRateLimits };
