const { createClient } = require('@supabase/supabase-js');
const { detectObjection, getObjectionResponse, getNextQualificationQuestion } = require('./objections');
const { detectLanguage, applyGuardrails } = require('./brain');
const { sendWhatsApp } = require('./lib/whatsappProvider');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const STATES = {
  INITIAL: 'INITIAL',
  REPLIED: 'REPLIED',
  QUALIFYING: 'QUALIFYING',
  OBJECTION: 'OBJECTION',
  INTERESTED: 'INTERESTED',
  BOOKING: 'BOOKING',
  BOOKED: 'BOOKED',
  NURTURING: 'NURTURING',
  ESCALATED: 'ESCALATED',
  DEAD: 'DEAD'
};

async function processInboundMessage(lead, messageText, messageSid) {
  try {
    // 1. Log inbound message
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

    // 2. Pause active nurture sequences
    await supabase.from('gs_sequences')
      .update({ is_paused: true })
      .eq('lead_id', lead.id)
      .eq('is_completed', false);

    // Ensure conversation_state exists, otherwise default to INITIAL
    let currentState = lead.conversation_state || STATES.INITIAL;
    let nextState = currentState;
    let replyMessage = null;
    let currentStep = lead.qualification_step || 0;

    // Detect Objection
    const objectionKey = detectObjection(messageText);

    if (objectionKey) {
      if (objectionKey === 'not_interested') {
        nextState = STATES.DEAD;
        replyMessage = getObjectionResponse(lead, objectionKey);
      } else if (objectionKey === 'call_me') {
        nextState = STATES.ESCALATED;
        replyMessage = getObjectionResponse(lead, objectionKey);
      } else {
        nextState = STATES.OBJECTION;
        replyMessage = getObjectionResponse(lead, objectionKey);
      }
    } else {
      // Normal flow state machine
      switch (currentState) {
        case STATES.INITIAL:
        case STATES.REPLIED:
        case STATES.OBJECTION:
        case STATES.NURTURING:
          // Move to Qualifying step 1
          nextState = STATES.QUALIFYING;
          replyMessage = getNextQualificationQuestion(lead, 0);
          currentStep = 1;
          break;

        case STATES.QUALIFYING:
          // Advance qualification
          replyMessage = getNextQualificationQuestion(lead, currentStep);
          if (replyMessage) {
            currentStep++;
          } else {
            // Out of questions, move to interested/booking
            nextState = STATES.INTERESTED;
            replyMessage = detectLanguage(lead) === 'ar' 
              ? "ممتاز. يبدو أن النظام سيكون مفيداً جداً لكم. هل نرتب موعداً لعمل عرض تجريبي (ديمو)؟" 
              : "Perfect. It sounds like this system would be a great fit. Shall we schedule a quick demo?";
            replyMessage = applyGuardrails(replyMessage);
          }
          break;

        case STATES.INTERESTED:
        case STATES.BOOKING:
          nextState = STATES.ESCALATED;
          replyMessage = detectLanguage(lead) === 'ar'
            ? "تم! سيتواصل معك أحد أفراد فريقنا لترتيب الموعد."
            : "Done! Someone from our team will reach out to coordinate the time.";
          replyMessage = applyGuardrails(replyMessage);
          break;

        default:
          nextState = STATES.ESCALATED;
          break;
      }
    }

    // 3. Send reply if generated
    if (replyMessage) {
      const sendResult = await sendWhatsApp(lead.phone, replyMessage);
      if (sendResult.success) {
        await supabase.from('gs_conversations').insert({
          lead_id: lead.id,
          campaign_id: lead.campaign_id,
          channel: 'whatsapp',
          direction: 'outbound',
          message_text: replyMessage,
          status: 'sent',
          ai_generated: true,
          sent_at: new Date().toISOString()
        });
      }
    }

    // 4. Update lead state
    await supabase.from('gs_leads').update({ 
      conversation_state: nextState,
      qualification_step: currentStep,
      status: nextState === STATES.DEAD ? 'opted_out' : (nextState === STATES.ESCALATED ? 'handed_off' : 'engaged'),
      last_replied_at: new Date().toISOString(),
      last_contacted_at: replyMessage ? new Date().toISOString() : lead.last_contacted_at
    }).eq('id', lead.id);

    console.log(`[conversation-engine] State transition: ${currentState} -> ${nextState} for lead ${lead.phone}`);

  } catch (err) {
    console.error('[conversation-engine] Fatal error:', err.message);
  }
}

module.exports = {
  STATES,
  processInboundMessage
};
