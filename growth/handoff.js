const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function handoffLead(lead, replyMessage) {
  const phone = lead.phone;
  console.log(`[Handoff] ${phone} → dental bot`);

  // 1. Check if already exists in patients table
  const { data: existing } = await supabase
    .from('patients')
    .select('phone')
    .eq('phone', phone)
    .maybeSingle();

  if (!existing) {
    // 2. Create patient for dental bot
    await supabase.from('patients').insert({
      phone,
      language: 'ar',
      current_flow: null,
      flow_step: 0,
      flow_data: {},
      updated_at: new Date().toISOString()
    });
    console.log('[Handoff] Created patient');
  } else {
    console.log('[Handoff] Patient already exists');
  }

  // 3. Mark growth lead as handed off in growth_leads_v2
  await supabase.from('growth_leads_v2').update({
    status: 'handed_off',
    replied_at: new Date().toISOString(),
    handed_off_at: new Date().toISOString()
  }).eq('id', lead.id);

  return { success: true, action: existing ? 'exists' : 'created' };
}

module.exports = { handoffLead };
