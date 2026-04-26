// ═══════════════════════════════════════════════════════════════
// nurture.js — Growth Swarm 3.0: Automated Sequence Engine
// Brain Step 8: Multi-step nurture sequences based on gs_sequences
// ═══════════════════════════════════════════════════════════════

require('dotenv').config();

const OpenAI = require('openai');
const { sendWhatsApp } = require('./lib/whatsappProvider');
const { getGhostRoomUrl, detectLanguage } = require('./brain');

const supabase = require('./lib/supabase');
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

/**
 * Generate a follow-up message using AI.
 * It reads the previous messages to ensure the follow-up is contextual.
 */
async function generateFollowUpMessage(lead, stepNumber, history = []) {
  try {
    const lang = detectLanguage(lead);
    const url = getGhostRoomUrl(lead);
    const company = lead.company_name || 'your clinic';
    const owner = lead.owner_name || 'Doctor';
    
    const historyText = history.map(h => `Jake (Previous): ${h.message_text}`).join('\n');

    const systemPrompt = `You are Jake, an AI growth consultant for Qudozen.
You are sending Follow-up #${stepNumber} to ${owner} at ${company} via WhatsApp.

CONTEXT:
- You previously sent these messages:
${historyText || '(No previous messages found)'}
- The lead has NOT replied yet.

RULES:
1. MUST be extremely short (under 30 words).
2. MUST sound like a real human texting (casual, direct, no emojis except maybe one).
3. Do NOT repeat the exact same pitch. 
4. If Step 1: "Did you get a chance to take a look?"
5. If Step 2: "Just bumping this in case it got buried."
6. If Step 3: Use social proof. "Another clinic nearby just deployed this and booked 4 implants this weekend."
7. If Step 4: "Last message from me on this. If timing changes, let me know."
8. Language: ${lang === 'ar' ? 'Arabic (Saudi dialect, casual professional)' : 'English'}
9. Always include this link naturally: ${url}

Generate the follow-up message now.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }],
      temperature: 0.7,
      max_tokens: 100
    });

    return response.choices[0].message.content.trim();
  } catch (err) {
    console.error('[nurture] ❌ Failed to generate follow-up:', err.message);
    const url = getGhostRoomUrl(lead);
    const lang = detectLanguage(lead);
    if (stepNumber === 1) {
      return lang === 'ar' 
        ? `دكتور هل كان لديك وقت للاطلاع؟ ${url} -جيك`
        : `Did you get a chance to take a look? ${url} -Jake`;
    } else if (stepNumber === 2) {
      return lang === 'ar' 
        ? `فقط أذكرك بالموضوع في حال انشغلت. ${url} -جيك`
        : `Just bumping this in case it got buried. ${url} -Jake`;
    } else if (stepNumber === 3) {
      return lang === 'ar' 
        ? `عيادة أخرى قريبة بدأت باستخدام النظام وحققت 4 حجوزات زراعة هذا الأسبوع. ${url} -جيك`
        : `Another clinic nearby just deployed this and booked 4 implants this weekend. ${url} -Jake`;
    } else {
      return lang === 'ar' 
        ? `هذه آخر رسالة مني. إذا تغير الوقت، أنا موجود. ${url} -جيك`
        : `Last message from me. If timing changes, I'm here. ${url} -Jake`;
    }
  }
}

/**
 * Run the nurture engine to process all pending sequence steps.
 */
async function processSequences() {
  const results = { processed: 0, sent: 0, completed: 0, errors: 0 };
  const now = new Date().toISOString();

  try {
    // 1. Fetch sequences that are due
    const { data: sequences, error } = await supabase
      .from('gs_sequences')
      .select('*, lead:lead_id(*)')
      .eq('is_paused', false)
      .eq('is_completed', false)
      .lte('next_send_at', now);

    if (error) throw error;
    if (!sequences || sequences.length === 0) {
      console.log('[nurture] No sequences due for sending at this time.');
      return results;
    }

    console.log(`[nurture] Found ${sequences.length} sequences due for follow-up.`);

    for (const seq of sequences) {
      results.processed++;
      const lead = seq.lead;
      if (!lead) continue;

      const nextStep = seq.current_step + 1;
      
      // We only support a 4-step sequence by default
      if (nextStep > 4 || nextStep > seq.total_steps) {
        await supabase.from('gs_sequences').update({ is_completed: true }).eq('id', seq.id);
        results.completed++;
        continue;
      }

      // Fetch what we sent them previously
      const { data: history } = await supabase
        .from('gs_conversations')
        .select('message_text, direction')
        .eq('lead_id', lead.id)
        .eq('direction', 'outbound')
        .order('created_at', { ascending: false })
        .limit(2);

      // Generate the message
      const messageText = await generateFollowUpMessage(lead, nextStep, history || []);

      // Send the message
      const sendResult = await sendWhatsApp(lead.phone, messageText);

      if (sendResult.success) {
        // Log the message
        await supabase.from('gs_conversations').insert({
          lead_id: lead.id,
          campaign_id: lead.campaign_id,
          channel: 'whatsapp',
          direction: 'outbound',
          message_text: messageText,
          status: 'sent',
          ai_generated: true,
          sent_at: new Date().toISOString()
        });

        // Calculate next send date (+3d, +6d, +11d to map to Days 4, 10, 21)
        const nextSend = new Date();
        if (nextStep === 1) nextSend.setDate(nextSend.getDate() + 3);
        else if (nextStep === 2) nextSend.setDate(nextSend.getDate() + 6);
        else if (nextStep === 3) nextSend.setDate(nextSend.getDate() + 11);
        else nextSend.setDate(nextSend.getDate() + 30);
        
        // Update sequence
        await supabase.from('gs_sequences').update({
          current_step: nextStep,
          next_send_at: nextSend.toISOString(),
          whatsapp_sent: seq.whatsapp_sent + 1,
          is_completed: nextStep >= 4 // Mark complete if we hit step 4
        }).eq('id', seq.id);

        results.sent++;
        if (nextStep >= 4) results.completed++;
        console.log(`[nurture] ✅ Sent Step ${nextStep} to ${lead.phone}`);
      } else {
        console.error(`[nurture] ❌ Failed to send Step ${nextStep} to ${lead.phone}:`, sendResult.error);
        results.errors++;
      }
    }

    console.log(`[nurture] Run complete: ${results.sent} sent, ${results.completed} completed, ${results.errors} errors.`);
    return results;

  } catch (err) {
    console.error('[nurture] ❌ Fatal error running sequences:', err.message);
    return results;
  }
}

/**
 * Start a new sequence for a lead (called when the first message is sent).
 */
async function startSequence(leadId, totalSteps = 4, delayDays = 3) {
  try {
    // CRITICAL-4 Fix: Prevent duplicate sequences
    const { data: existing } = await supabase
      .from('gs_sequences')
      .select('id')
      .eq('lead_id', leadId)
      .eq('is_completed', false)
      .maybeSingle();

    if (existing) {
      console.log(`[nurture] Sequence already exists for lead ${leadId}, skipping insertion.`);
      return;
    }

    const nextSend = new Date();
    nextSend.setDate(nextSend.getDate() + delayDays);

    await supabase.from('gs_sequences').insert({
      lead_id: leadId,
      sequence_type: 'cold_outreach',
      current_step: 0,
      total_steps: totalSteps,
      next_send_at: nextSend.toISOString(),
      is_paused: false,
      is_completed: false,
      whatsapp_sent: 1 // Initial message counts as sent
    });
    console.log(`[nurture] Started sequence for lead ${leadId}`);
  } catch (err) {
    console.error('[nurture] Failed to start sequence:', err.message);
  }
}

module.exports = {
  processSequences,
  startSequence
};
