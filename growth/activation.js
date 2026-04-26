const supabase = require('./lib/supabase');
const bcrypt = require('bcryptjs');
const { sendWhatsApp } = require('./lib/whatsappProvider');
const { alertAdmin } = require('../utils/alertAdmin');

/**
 * Provisions a new clinic after successful Stripe payment.
 * Fills the "Activation Gap".
 */
async function provisionClinic(lead) {
  try {
    console.log(`[Activation] Provisioning clinic for lead ${lead.id}...`);

    // 1. Generate unique bot phone (mock Twilio assignment for now)
    const botPhone = `+1555${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`;
    
    // 2. Insert into clinics
    const { data: clinic, error: clinicErr } = await supabase
      .from('clinics')
      .insert({
        whatsapp_number: botPhone,
        name: lead.company_name || lead.business_name || lead.name || 'New Clinic',
        plan: 'premium',
        doctors: [
          { doctor_id: "dr_default", doctor_name: "Dr. Main", specialization: "General", is_active: true }
        ],
        config: { tz: 'Asia/Riyadh' }
      })
      .select()
      .single();

    if (clinicErr) throw clinicErr;

    // 3. Generate credentials
    const rawPassword = Math.random().toString(36).slice(-8); // 8-char random
    const hashedPassword = await bcrypt.hash(rawPassword, 10);
    const username = lead.phone.replace('+', ''); // Using owner phone as username

    // 4. Create Onboarding State
    const { error: onboardErr } = await supabase
      .from('onboarding_states')
      .insert({
        business_id: clinic.id,
        clinic_name: clinic.name,
        owner_name: lead.owner_name || lead.name,
        owner_phone: lead.phone,
        current_state: 'dashboard_active',
        dashboard_username: username,
        dashboard_password: hashedPassword,
        dashboard_credentials_sent: true
      });

    if (onboardErr) throw onboardErr;

    // 5. Send Welcome WhatsApp Message
    const welcomeMsg = `🎉 *Welcome to Qudozen!* 🎉\n\nYour AI receptionist is being deployed.\n\nHere is your Operator Dashboard access:\n🔗 https://qudozen.com/dashboard/login\n👤 Username: ${username}\n🔑 Password: ${rawPassword}\n\nYour bot's assigned WhatsApp number is: ${botPhone}.`;
    
    await sendWhatsApp(lead.phone, welcomeMsg);

    console.log(`[Activation] ✅ Clinic provisioned. Bot: ${botPhone}, Owner: ${lead.phone}`);
    return { success: true, clinicId: clinic.id, botPhone, username, password: rawPassword };

  } catch (err) {
    console.error('[Activation] ❌ Provisioning failed:', err.message);
    await alertAdmin('PROVISIONING_FAILED', { leadId: lead.id, error: err.message }, 'CRITICAL');
    return { success: false, error: err.message };
  }
}

module.exports = { provisionClinic };
