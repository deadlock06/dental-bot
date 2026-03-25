const axios = require('axios');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates'
};

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

// Insert a brand-new patient row (pure POST — never PATCH)
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
      { headers: { ...headers, Prefer: 'return=representation' } }
    );
    console.log('[insertPatient] POST status:', res.status);
    return res.data[0] || null;
  } catch (err) {
    console.error('[insertPatient] ERROR status:', err.response?.status);
    console.error('[insertPatient] ERROR body:', JSON.stringify(err.response?.data));
    console.error('[insertPatient] ERROR message:', err.message);
    return null;
  }
}

// Update an existing patient row (pure PATCH)
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
    console.log('[savePatient] PATCH status:', patch.status, 'rows affected:', patch.data?.length);
  } catch (err) {
    console.error('[savePatient] ERROR status:', err.response?.status);
    console.error('[savePatient] ERROR body:', JSON.stringify(err.response?.data));
    console.error('[savePatient] ERROR message:', err.message);
  }
}

// Delete a patient row by phone (for test cleanup)
async function deletePatient(phone) {
  try {
    const res = await axios.delete(
      `${SUPABASE_URL}/rest/v1/patients?phone=eq.${encodeURIComponent(phone)}`,
      { headers }
    );
    console.log('[deletePatient] Deleted rows for:', phone, 'status:', res.status);
  } catch (err) {
    console.error('[deletePatient] ERROR:', err.message);
  }
}

async function saveAppointment(data) {
  try {
    await axios.post(
      `${SUPABASE_URL}/rest/v1/appointments`,
      {
        phone: data.phone,
        name: data.name,
        treatment: data.treatment,
        description: data.description || '',
        preferred_date: data.preferred_date,
        time_slot: data.time_slot,
        status: 'pending'
      },
      { headers }
    );
  } catch (err) {
    console.error('saveAppointment error:', err.message);
  }
}

module.exports = { getPatient, insertPatient, savePatient, saveAppointment, deletePatient };
