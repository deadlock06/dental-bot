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
      `${SUPABASE_URL}/rest/v1/clinics?whatsapp_number=eq.${encodeURIComponent(whatsappNumber)}&select=*&order=created_at.desc&limit=1`,
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
        phone:               data.phone,
        clinic_id:           data.clinic_id || null,
        name:                data.name,
        treatment:           data.treatment,
        description:         data.description || '',
        preferred_date:      data.preferred_date,
        preferred_date_iso:  data.preferred_date_iso || null,
        time_slot:           data.time_slot,
        doctor_id:           data.doctor_id || null,
        doctor_name:         data.doctor_name || null,
        status:              'confirmed',
        reminder_sent_24h:   false,
        reminder_sent_1h:    false,
        follow_up_sent:      false
      },
      { headers: { ...headers, Prefer: 'return=representation' } }
    );
    return res.data[0] || null;
  } catch (err) {
    console.error('saveAppointment error:', err.response?.data || err.message);
    return null;
  }
}

// Returns true if the patient already has a confirmed booking on that ISO date
async function checkDuplicateBooking(phone, isoDate) {
  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/appointments?phone=eq.${encodeURIComponent(phone)}&preferred_date_iso=eq.${isoDate}&status=eq.confirmed&limit=1&select=id`,
      { headers }
    );
    return Array.isArray(res.data) && res.data.length > 0;
  } catch (err) {
    console.error('checkDuplicateBooking error:', err.message);
    return false; // non-blocking
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

// Get appointments for reminder processing (all confirmed, filter in caller)
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

// ─── Typed reminder queries (use preferred_date_iso when available) ───

// 24h reminder: appointments tomorrow
async function getAppointmentsDueTomorrow() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowISO = tomorrow.toISOString().split('T')[0];
  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/appointments?status=eq.confirmed&reminder_sent_24h=eq.false&preferred_date_iso=eq.${tomorrowISO}&select=*`,
      { headers }
    );
    return res.data || [];
  } catch (err) {
    console.error('getAppointmentsDueTomorrow error:', err.message);
    return [];
  }
}

// 1h reminder: appointments today (caller filters by time window)
async function getAppointmentsDueInOneHour() {
  const todayISO = new Date().toISOString().split('T')[0];
  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/appointments?status=eq.confirmed&reminder_sent_1h=eq.false&preferred_date_iso=eq.${todayISO}&select=*`,
      { headers }
    );
    return res.data || [];
  } catch (err) {
    console.error('getAppointmentsDueInOneHour error:', err.message);
    return [];
  }
}

// Follow-up: appointments yesterday
async function getAppointmentsDueFollowUp() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayISO = yesterday.toISOString().split('T')[0];
  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/appointments?status=eq.confirmed&follow_up_sent=eq.false&preferred_date_iso=eq.${yesterdayISO}&select=*`,
      { headers }
    );
    return res.data || [];
  } catch (err) {
    console.error('getAppointmentsDueFollowUp error:', err.message);
    return [];
  }
}

module.exports = {
  getPatient, insertPatient, savePatient, deletePatient,
  getClinic, getClinicById,
  saveAppointment, getAppointment, updateAppointment,
  checkDuplicateBooking,
  getAppointmentsForReminder,
  getAppointmentsDueTomorrow, getAppointmentsDueInOneHour, getAppointmentsDueFollowUp
};
