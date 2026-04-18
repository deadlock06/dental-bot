/**
 * handoff.js — Anti-Gravity V2.5
 * Smart intent detection + bilingual patient creation
 */

// *** ADD detectGrowthLeadReply AT TOP of your /webhook handler before dental bot logic ***

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const ARABIC_REGEX = /[\u0600-\u06FF]/;

const INTENT_PATTERNS = {
  price_query:   /سعر|price|كم|cost|expensive|رسوم|تكلفة|كمية|كم الاشتراك/i,
  demo_request:  /demo|جرب|try|test|تجربة|نجرب|شوف|أريد أن أرى/i,
  complaint:     /مشكلة|problem|slow|bad|بطيء|سيء|ما يرد/i,
};

function detectIntent(message) {
  if (!message) return 'general';
  for (const [intent, pattern] of Object.entries(INTENT_PATTERNS)) {
    if (pattern.test(message)) {
      console.log(`[handoff.js] Intent detected: ${intent}`);
      return intent;
    }
  }
  return 'general';
}

function detectLanguage(message) {
  return ARABIC_REGEX.test(message) ? 'ar' : 'en';
}

async function handoffLead(lead, replyMessage) {
  console.log(`[handoff.js] HANDOFF: ${lead.name} (${lead.business_name}) — "${(replyMessage || '').substring(0, 40)}"`);

  const intent = detectIntent(replyMessage);
  const language = detectLanguage(replyMessage);

  const { data: existing } = await supabase
    .from('patients')
    .select('phone')
    .eq('phone', lead.phone)
    .maybeSingle();

  let patientAction = 'exists';

  if (!existing) {
    const patientData = {
      phone: lead.phone,
      name: lead.name,
      language,
      flow_data: {},
      updated_at: new Date().toISOString(),
    };

    if (intent === 'demo_request') {
      patientData.current_flow = 'booking';
      patientData.flow_step = 0;
    } else if (intent === 'price_query') {
      patientData.current_flow = 'roi_pitch';
      patientData.flow_step = 0;
    } else {
      patientData.current_flow = 'welcome';
      patientData.flow_step = 0;
    }

    const { error: insertError } = await supabase.from('patients').insert(patientData);
    if (insertError) {
      console.error('[handoff.js] Insert error:', insertError.message);
      return { success: false, error: insertError.message };
    }
    console.log(`[handoff.js] Patient created (lang: ${language}, intent: ${intent}, flow: ${patientData.current_flow})`);
    patientAction = 'created';
  } else {
    // Update language on existing patient if we can detect it
    await supabase.from('patients').update({ language, updated_at: new Date().toISOString() }).eq('phone', lead.phone);
    console.log(`[handoff.js] Patient exists — updated language to ${language}`);
  }

  const now = new Date().toISOString();
  await supabase.from('growth_leads_v2').update({
    status: 'handed_off',
    replied_at: now,
    handed_off_at: now,
  }).eq('id', lead.id);

  console.log(`[handoff.js] Handoff complete — ${patientAction}, intent: ${intent}`);
  return { success: true, action: patientAction, intent, language };
}

async function detectGrowthLeadReply(supabase, phone, messageBody) {
  const normalizedPhone = phone.replace('whatsapp:', '');

  const { data: growthLead, error } = await supabase
    .from('growth_leads_v2')
    .select('*')
    .eq('phone', normalizedPhone)
    .in('status', ['messaged', 'bumped_1', 'bumped_2'])
    .maybeSingle();

  if (error) {
    console.error('[handoff.js] Detection error:', error.message);
    return null;
  }

  if (growthLead) console.log(`[handoff.js] Growth lead reply: ${normalizedPhone} (intent: ${detectIntent(messageBody)})`);
  return growthLead || null;
}

module.exports = { handoffLead, detectGrowthLeadReply, detectIntent, detectLanguage };
