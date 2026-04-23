// ═══════════════════════════════════════════════════════════════
// state-machine.js — Growth Swarm 3.0: Conversation State Machine
// Brain Step 6: Core logic for handling inbound replies
// ═══════════════════════════════════════════════════════════════

const { createClient } = require('@supabase/supabase-js');
const { classifyIntent, generateResponse } = require('./conversation');
const { sendWhatsApp } = require('./lib/whatsappProvider');
const { handoffLead } = require('./handoff');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

/**
 * Handle an incoming message from a Growth Swarm lead.
 * Called directly from the Twilio webhook in index.js.
 */
async function handleInboundMessage(lead, messageText, messageSid) {
  try {
    console.log(`[state-machine] 🔄 Processing inbound from ${lead.phone}: "${messageText}"`);

    // 1. Log the incoming message to gs_conversations
    await supabase.from('gs_conversations').insert({
      lead_id: lead.id,
      campaign_id: lead.campaign_id,
      channel: 'whatsapp',
      direction: 'inbound',
      message_text: messageText,
      status: 'received',
      twilio_sid: messageSid,
      sent_at: new Date().toISOString()
    });

    // 2. Pause any active nurture sequences
    await supabase.from('gs_sequences')
      .update({ is_paused: true })
      .eq('lead_id', lead.id)
      .eq('is_completed', false);

    // 3. Fetch conversation history for context (last 5 messages)
    const { data: history } = await supabase
      .from('gs_conversations')
      .select('direction, message_text, created_at')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: true })
      .limit(5);

    // 4. Classify Intent via LLM
    const intent = await classifyIntent(messageText, history || []);

    // Helper to get the last message Jake sent
    const lastOutbound = history && history.find(h => h.direction === 'outbound');
    const lastJakeMessage = lastOutbound ? lastOutbound.message_text : null;

    // 5. State Transitions based on Intent
    switch (intent) {
      case 'OPT_OUT':
        console.log(`[state-machine] 🛑 Lead opted out: ${lead.phone}`);
        await supabase.from('gs_leads').update({ status: 'opted_out' }).eq('id', lead.id);
        
        // Log negative feedback loop
        if (lastJakeMessage) {
          await supabase.from('gs_feedback').insert({
            lead_id: lead.id,
            feedback_type: 'opt_out',
            ai_output: lastJakeMessage,
            correct: false,
            rating: 1
          });
        }
        break;

      case 'HANDED_OFF':
        console.log(`[state-machine] 🤝 Lead ready for handoff: ${lead.phone}`);
        await supabase.from('gs_leads').update({ status: 'handed_off' }).eq('id', lead.id);
        
        // Log positive feedback loop
        if (lastJakeMessage) {
          await supabase.from('gs_feedback').insert({
            lead_id: lead.id,
            feedback_type: 'handoff',
            ai_output: lastJakeMessage,
            correct: true,
            rating: 5
          });
        }
        
        await handoffLead(lead, messageText);
        break;

      case 'OBJECTION':
      case 'ENGAGED':
        console.log(`[state-machine] 💬 Lead engaged (${intent}): ${lead.phone}`);

        if (intent === 'OBJECTION' && lastJakeMessage) {
          // Log objection feedback to improve future prompts
          await supabase.from('gs_feedback').insert({
            lead_id: lead.id,
            feedback_type: 'objection',
            ai_output: lastJakeMessage,
            human_correction: messageText // Storing their objection for analysis
          });
        }
        
        const replyText = await generateResponse(lead, messageText, history || [], intent);
        
        const sendResult = await sendWhatsApp(lead.phone, replyText);
        
        if (sendResult.success) {
          await supabase.from('gs_conversations').insert({
            lead_id: lead.id,
            campaign_id: lead.campaign_id,
            channel: 'whatsapp',
            direction: 'outbound',
            message_text: replyText,
            status: 'sent',
            ai_generated: true,
            sent_at: new Date().toISOString()
          });

          await supabase.from('gs_leads').update({ 
            status: 'engaged',
            last_replied_at: new Date().toISOString(),
            last_contacted_at: new Date().toISOString()
          }).eq('id', lead.id);
        } else {
          console.error(`[state-machine] ❌ Failed to send reply to ${lead.phone}:`, sendResult.error);
        }
        break;

      default:
        console.warn(`[state-machine] ⚠️ Unknown intent: ${intent}`);
        break;
    }

  } catch (err) {
    console.error('[state-machine] ❌ Fatal error processing message:', err.message);
  }
}

module.exports = {
  handleInboundMessage
};
