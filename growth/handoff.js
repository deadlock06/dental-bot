const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function handoffLead(lead, replyMessage) {
  console.log(`[Handoff] ${lead.phone} → dental bot`);

  // 1. Check if already exists in patients table
  const { data: existing } = await supabase
    .from('patients')
    .select('phone')
    .eq('phone', lead.phone)
    .single();

  if (!existing) {
    // 2. Create patient for dental bot
    await supabase.from('patients').insert({
      phone: lead.phone,
      name: lead.name || lead.business_name || 'Unknown',
      language: 'ar',
      current_flow: 'welcome',
      flow_step: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    console.log('[Handoff] Created patient');
  } else {
    console.log('[Handoff] Patient already exists');
  }

  // 3. Mark growth lead as handed off
  await supabase.from('growth_leads').update({
    status: 'handed_off',
    replied_at: new Date().toISOString(),
    handed_off_at: new Date().toISOString()
  }).eq('id', lead.id);

  return { success: true, action: existing ? 'exists' : 'created' };
}

module.exports = { handoffLead };
