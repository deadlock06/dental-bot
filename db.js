const axios = require('axios');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates'
};

// ─────────────────────────────────────────────
// Patients
// ─────────────────────────────────────────────

async function getPatient(phone) {
  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/patients?phone=eq.${encodeURIComponent(phone)}&select=*`,
      { headers }
    );
    return res.data[0] || null;
  } catch (err) {
    console.error('getPatient error:', err.message);
    return null;
  }
}

async function insertPatient(phone) {
  const payload = {
    phone,
    language: null,
    current_flow: null,
    flow_step: 0,
    flow_data: {},
    updated_at: new Date().toISOString()
  };
  console.log('[insertPatient] Inserting new patient:', phone);
  try {
    const res = await axios.post(
      `${SUPABASE_URL}/rest/v1/patients`,
      payload,
      { headers: { ...headers, Prefer: 'return=representation,resolution=merge-duplicates' } }
    );
    console.log('[insertPatient] POST status:', res.status);
    return res.data[0] || null;
  } catch (err) {
    console.error('[insertPatient] ERROR status:', err.response?.status);
    console.error('[insertPatient] ERROR body:', JSON.stringify(err.response?.data));
    return null;
  }
}

async function savePatient(phone, data) {
  const payload = {
    phone,
    language: data.language !== undefined ? data.language : null,
    current_flow: data.current_flow || null,
    flow_step: typeof data.flow_step === 'number' ? data.flow_step : 0,
    flow_data: data.flow_data || {},
    updated_at: new Date().toISOString()
  };
  console.log('[savePatient] Saving:', JSON.stringify(payload));
  try {
    const patch = await axios.patch(
      `${SUPABASE_URL}/rest/v1/patients?phone=eq.${encodeURIComponent(phone)}`,
      payload,
      { headers: { ...headers, Prefer: 'return=representation' } }
    );
    console.log('[savePatient] PATCH status:', patch.status, 'rows:', patch.data?.length);
  } catch (err) {
    console.error('[savePatient] ERROR:', err.response?.status, JSON.stringify(err.response?.data));
  }
}

async function deletePatient(phone) {
  try {
    await axios.delete(
      `${SUPABASE_URL}/rest/v1/patients?phone=eq.${encodeURIComponent(phone)}`,
      { headers }
    );
  } catch (err) {
    console.error('[deletePatient] ERROR:', err.message);
  }
}

// ─────────────────────────────────────────────
// Clinics
// ─────────────────────────────────────────────

async function getClinicById(id) {
  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/clinics?id=eq.${encodeURIComponent(id)}&select=*`,
      { headers }
    );
    return res.data[0] || null;
  } catch (err) {
    console.error('getClinicById error:', err.message);
    return null;
  }
}

async function getClinic(whatsappNumber) {
  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/clinics?whatsapp_number=eq.${encodeURIComponent(whatsappNumber)}&select=*`,
      { headers }
    );
    return res.data[0] || null;
  } catch (err) {
    console.error('getClinic error:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// Appointments
// ─────────────────────────────────────────────

async function saveAppointment(data) {
  try {
    const res = await axios.post(
      `${SUPABASE_URL}/rest/v1/appointments`,
      {
        phone: data.phone,
        clinic_id: data.clinic_id || null,
        name: data.name,
        treatment: data.treatment,
        description: data.description || '',
        preferred_date: data.preferred_date,
        time_slot: data.time_slot,
        doctor_name: data.doctor_name || null,
        status: 'confirmed',
        reminder_sent_24h: false,
        reminder_sent_1h: false,
        follow_up_sent: false
      },
      { headers: { ...headers, Prefer: 'return=representation' } }
    );
    return res.data[0] || null;
  } catch (err) {
    console.error('saveAppointment error:', err.response?.data || err.message);
    return null;
  }
}

async function getAppointment(phone) {
  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/appointments?phone=eq.${encodeURIComponent(phone)}&status=in.(confirmed,pending)&order=created_at.desc&limit=1&select=*`,
      { headers }
    );
    return res.data[0] || null;
  } catch (err) {
    console.error('getAppointment error:', err.message);
    return null;
  }
}

async function updateAppointment(id, fields) {
  try {
    await axios.patch(
      `${SUPABASE_URL}/rest/v1/appointments?id=eq.${id}`,
      fields,
      { headers }
    );
  } catch (err) {
    console.error('updateAppointment error:', err.response?.data || err.message);
  }
}

// Get appointments for reminder processing
async function getAppointmentsForReminder(filterFn) {
  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/appointments?status=eq.confirmed&select=*`,
      { headers }
    );
    return (res.data || []).filter(filterFn);
  } catch (err) {
    console.error('getAppointmentsForReminder error:', err.message);
    return [];
  }
}

module.exports = {
  getPatient, insertPatient, savePatient, deletePatient,
  getClinic, getClinicById,
  saveAppointment, getAppointment, updateAppointment, getAppointmentsForReminder
};
