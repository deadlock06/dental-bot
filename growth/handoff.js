// ═══════════════════════════════════════════════════════════════
// handoff.js — Growth Swarm 3.0: Intelligent Handoff
// Brain Step 9: Transitioning a lead to the main bot / human
// ═══════════════════════════════════════════════════════════════

const { createClient } = require('@supabase/supabase-js');
const { sendWhatsApp } = require('./lib/whatsappProvider');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

/**
 * Trigger an intelligent handoff.
 * 1. Alerts the admin via WhatsApp.
 * 2. Creates a 'patient' record so the lead can interact with the Qudozen demo bot.
 * 3. Sends a transition message.
 */
async function handoffLead(lead, triggerMessage) {
  try {
    console.log(`[handoff] 🤝 Initiating handoff for ${lead.phone}`);

    // 1. Notify Admin
    const adminPhone = process.env.ADMIN_PHONE;
    if (adminPhone) {
      const adminMsg = `🚨 *Growth Swarm Handoff* 🚨\n\nLead: ${lead.company_name || lead.business_name || 'Unknown'}\nPhone: ${lead.phone}\nTrigger: "${triggerMessage}"\nScore: ${lead.total_score || lead.confidence_score || 0}\n\nThey are ready to talk!`;
      await sendWhatsApp(adminPhone, adminMsg);
    }

    // 2. Insert into the main bot's `patients` table
    // This allows them to trigger the Dental Bot flows (demo mode)
    const { error: patientError } = await supabase.from('patients').upsert({
      phone: lead.phone,
      language: lead.language || 'ar',
      current_flow: 'start',
      flow_step: 0,
      flow_data: { source: 'growth_swarm_handoff' }
    }, { onConflict: 'phone' });

    if (patientError) {
      console.error('[handoff] ❌ Failed to create patient record:', patientError.message);
    }

    // 3. Send the transition message to the lead
    const lang = lead.language || 'ar'; // Default to Arabic
    const transitionMsg = lang === 'ar'
      ? `لقد طلبت التواصل مع فريقنا! سيتواصل معك أحد الخبراء قريباً. 📞\n\nفي هذه الأثناء، يمكنك تجربة روبوت خدمة العملاء الخاص بنا (الذي تستطيع الحصول على مثله). فقط أرسل *"مرحبا"* لتبدأ التجربة!`
      : `I've let the team know you're ready to chat! A human will reach out shortly. 📞\n\nIn the meantime, you can test out our AI Receptionist (the exact one you'd get). Just reply *"Hello"* to start the demo!`;

    await sendWhatsApp(lead.phone, transitionMsg);

    console.log(`[handoff] ✅ Handoff complete for ${lead.phone}`);
    return { success: true };

  } catch (err) {
    console.error('[handoff] ❌ Handoff failed:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  handoffLead
};
