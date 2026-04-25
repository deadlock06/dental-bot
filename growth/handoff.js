const { sendWhatsApp } = require('./lib/whatsappProvider');

const supabase = require('./lib/supabase');

const ESCALATION_TRIGGERS = [
  'opt_out', 'legal', 'ai_questioned', 'pricing', 'buying_signal', 'stalled', 'low_confidence'
];

async function checkEscalationTriggers(lead, messageText, intent) {
  const lowerMsg = messageText.toLowerCase();
  
  if (intent === 'OPT_OUT') return 'opt_out';
  if (lowerMsg.includes('sue') || lowerMsg.includes('lawyer') || lowerMsg.includes('legal')) return 'legal';
  if (lowerMsg.includes('are you a bot') || lowerMsg.includes('ai')) return 'ai_questioned';
  if (lowerMsg.includes('how much') || lowerMsg.includes('price')) return 'pricing';
  if (intent === 'HANDED_OFF') return 'buying_signal';
  if (lead.qualification_step && lead.qualification_step > 5) return 'stalled';
  
  return null;
}

async function handoffLead(lead, triggerMessage, reason = 'buying_signal') {
  try {
    console.log(`[handoff] 🤝 Initiating handoff for ${lead.phone} (Reason: ${reason})`);

    const adminPhone = process.env.ADMIN_PHONE || '+966570733834';

    // Formatting alert specifically to the requested format
    const adminMsg = `🚨 *Qudozen Escalation Alert* 🚨\n\n` +
      `🏢 Clinic: ${lead.company_name || 'Unknown'}\n` +
      `📱 Phone: ${lead.phone}\n` +
      `🔥 Reason: ${reason.toUpperCase()}\n` +
      `💬 Last Msg: "${triggerMessage}"\n` +
      `📊 Score: ${lead.total_score || 0}/100\n\n` +
      `Action required immediately.`;

    await sendWhatsApp(adminPhone, adminMsg);

    // Create a 'patient' record to allow the lead to interact with the Qudozen demo bot
    const { error: patientError } = await supabase.from('patients').upsert({
      phone: lead.phone,
      language: lead.language || 'ar',
      current_flow: 'start',
      flow_step: 0,
      flow_data: { source: 'growth_swarm_handoff', reason }
    }, { onConflict: 'phone' });

    if (patientError) {
      console.error('[handoff] ❌ Failed to create patient record:', patientError.message);
    }

    const lang = lead.language || 'ar';
    let transitionMsg = "";

    if (reason === 'opt_out') {
      transitionMsg = lang === 'ar' ? "تم إزالة رقمك بنجاح. عذراً على الإزعاج." : "You've been successfully removed. Apologies for the interruption.";
    } else {
      transitionMsg = lang === 'ar'
        ? `لقد أبلغت فريقي وسيتواصلون معك قريباً. 📞\n\nفي هذه الأثناء، يمكنك تجربة روبوت خدمة العملاء الخاص بنا الآن. فقط أرسل *"مرحبا"* للبدء!`
        : `I've alerted the team and they'll reach out shortly. 📞\n\nIn the meantime, you can test out our AI Receptionist right now. Just reply *"Hello"* to start!`;
    }

    await sendWhatsApp(lead.phone, transitionMsg);
    
    const newState = reason === 'opt_out' ? 'opted_out' : 'handed_off';
    await supabase.from('gs_leads').update({ status: newState, conversation_state: 'ESCALATED' }).eq('id', lead.id);

    // Explicitly log the lifecycle event
    await supabase.from('gs_events').insert({
      lead_id: lead.id,
      event_type: 'HANDOFF',
      old_state: lead.status,
      new_state: newState,
      metadata: { reason, triggered_by: triggerMessage }
    });

    console.log(`[handoff] ✅ Handoff complete for ${lead.phone}`);
    return { success: true };

  } catch (err) {
    console.error('[handoff] ❌ Handoff failed:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  handoffLead,
  checkEscalationTriggers
};
