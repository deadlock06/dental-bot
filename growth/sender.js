const { sendWhatsApp } = require('./lib/whatsappProvider');
const { isWithinBusinessHours } = require('./compliance');
const { applyGuardrails, getGhostRoomUrl, detectLanguage } = require('./brain');
const supabase = require('./lib/supabase');

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

    const lang = detectLanguage(lead);
    
    let msg = lang === 'ar'
      ? `مرحباً دكتور ${lead.name || ''}، لقد بنيت محاكاة ذكية لمكتب استقبال عيادة ${lead.company_name || 'العيادة'}. هل تود أن أرسل لك رابط التجربة؟`
      : `Hi Dr. ${lead.name || ''}, I've built a digital twin for your front desk at ${lead.company_name || 'your clinic'}. Would you like me to send you the link to try the simulation?`;


      
    // Apply guardrails handles constraints
    msg = applyGuardrails(msg);

    const sent = await sendWhatsApp(lead.phone, msg);
    results.push({ id: lead.id, success: sent.success });
    
    if (sent.success) {
      // CRITICAL-6 Fix: Bridge to GS 3.0 State Machine so we can log conversation & handle replies
      await supabase.from('gs_leads').upsert({
        id: lead.id,
        phone: lead.phone,
        company_name: lead.business_name || lead.name,
        owner_name: lead.website_owner_name || lead.name,
        status: 'engaged',
        source: 'auto-batch'
      });

      await supabase.from('gs_conversations').insert({
        lead_id: lead.id,
        channel: 'whatsapp',
        direction: 'outbound',
        message_text: msg,
        status: 'sent',
        ai_generated: true,
        sent_at: new Date().toISOString()
      });

      // Explicitly log the lifecycle event
      await supabase.from('gs_events').insert({
        lead_id: lead.id,
        event_type: 'CONTACTED',
        old_state: lead.status || 'scouted',
        new_state: 'engaged',
        metadata: { message: msg }
      });

      // Update the legacy table
      await supabase.from('growth_leads_v2').update({
        status: 'messaged',
        last_message_sent: msg,
        last_contacted_at: new Date().toISOString(),
        message_count: (lead.message_count || 0) + 1
      }).eq('id', lead.id);
    }
  }
  return results;
}

module.exports = { sendFollowUps, processBatch, CADENCE, RATE_LIMITS, checkRateLimits };
