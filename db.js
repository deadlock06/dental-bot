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
    const rpcPayload = {
      p_clinic_id: data.clinic_id || null,
      p_doctor_name: data.doctor_name || null,
      p_preferred_date_iso: data.preferred_date_iso || null,
      p_time_slot: data.time_slot || null,
      p_phone: data.phone || null,
      p_name: data.name || null,
      p_treatment: data.treatment || null
    };

    const rpcRes = await axios.post(
      `${SUPABASE_URL}/rest/v1/rpc/book_slot_atomic`,
      rpcPayload,
      { headers }
    );

    if (rpcRes.data && rpcRes.data.success) {
      return { id: rpcRes.data.appointment_id, ...data, status: 'confirmed' };
    } else {
      console.warn('[DB] Atomic booking rejected: Slot already taken');
      return { error: 'SLOT_TAKEN' };
    }
  } catch (err) {
    // If RPC is missing (SQL not run yet), or other errors
    const errData = err.response?.data || err.message;
    console.error('saveAppointment RPC error:', errData);
    
    // Return a structured error so bot.js can handle it bilingual
    return { error: 'DB_ERROR', details: errData };
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

// Gets the count of existing appointments for a specific date (used for Elastic Capacity)
async function getAppointmentCountsForDate(clinicId, doctorId, isoDate) {
  try {
    const url = doctorId
      ? `${SUPABASE_URL}/rest/v1/appointments?clinic_id=eq.${clinicId}&doctor_id=eq.${encodeURIComponent(doctorId)}&preferred_date_iso=eq.${isoDate}&status=in.(confirmed,pending)&select=time_slot`
      : `${SUPABASE_URL}/rest/v1/appointments?clinic_id=eq.${clinicId}&preferred_date_iso=eq.${isoDate}&status=in.(confirmed,pending)&select=time_slot`;
    
    const res = await axios.get(url, { headers });
    const counts = {};
    for (const row of res.data || []) {
      if (row.time_slot) {
        counts[row.time_slot] = (counts[row.time_slot] || 0) + 1;
      }
    }
    return counts;
  } catch (err) {
    console.error('[DB] getAppointmentCountsForDate error:', err.message);
    return {};
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

// ─────────────────────────────────────────────
// Doctor Schedules — used as fallback when clinics.doctors JSONB is empty
// ─────────────────────────────────────────────
async function getDoctorsByClinic(clinicId) {
  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/doctor_schedules?clinic_id=eq.${encodeURIComponent(clinicId)}&is_active=eq.true&select=*&order=doctor_name.asc`,
      { headers }
    );
    return res.data || [];
  } catch (err) {
    console.error('[DB] getDoctorsByClinic error:', err.message);
    return [];
  }
}

// ─────────────────────────────────────────────
// Onboarding State Machine (Phase 3)
// ─────────────────────────────────────────────

async function getOnboardingByPhone(phone) {
  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/onboarding_states?owner_phone=eq.${encodeURIComponent(phone)}&select=*&order=created_at.desc&limit=1`,
      { headers }
    );
    return res.data[0] || null;
  } catch (err) {
    console.error('getOnboardingByPhone error:', err.message);
    return null;
  }
}

async function getOnboardingById(id) {
  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/onboarding_states?id=eq.${id}&select=*`,
      { headers }
    );
    return res.data[0] || null;
  } catch (err) {
    console.error('getOnboardingById error:', err.message);
    return null;
  }
}

async function createOnboarding(data) {
  try {
    const res = await axios.post(
      `${SUPABASE_URL}/rest/v1/onboarding_states`,
      data,
      { headers: { ...headers, Prefer: 'return=representation' } }
    );
    return res.data[0] || null;
  } catch (err) {
    console.error('createOnboarding error:', err.response?.data || err.message);
    return null;
  }
}

async function updateOnboarding(id, fields) {
  try {
    fields.updated_at = new Date().toISOString();
    await axios.patch(
      `${SUPABASE_URL}/rest/v1/onboarding_states?id=eq.${id}`,
      fields,
      { headers }
    );
  } catch (err) {
    console.error('updateOnboarding error:', err.response?.data || err.message);
  }
}

async function logOnboardingMessage(onboardingId, day, type, content) {
  try {
    await axios.post(
      `${SUPABASE_URL}/rest/v1/onboarding_logs`,
      { onboarding_id: onboardingId, day, message_type: type, content },
      { headers }
    );
  } catch (err) {
    console.error('logOnboardingMessage error:', err.response?.data || err.message);
  }
}

async function createCronJob(data) {
  try {
    await axios.post(
      `${SUPABASE_URL}/rest/v1/cron_jobs`,
      data,
      { headers }
    );
  } catch (err) {
    console.error('createCronJob error:', err.response?.data || err.message);
  }
}

async function getPendingCronJobs() {
  try {
    // type IN ('followup', 'checkin', 'review') AND run_at <= NOW() AND executed = false
    const now = new Date().toISOString();
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/cron_jobs?executed=eq.false&run_at=lte.${now}&type=in.(followup,checkin,review)&select=*`,
      { headers }
    );
    return res.data || [];
  } catch (err) {
    console.error('getPendingCronJobs error:', err.message);
    return [];
  }
}

async function markCronJobExecuted(id) {
  try {
    await axios.patch(
      `${SUPABASE_URL}/rest/v1/cron_jobs?id=eq.${id}`,
      { executed: true },
      { headers }
    );
  } catch (err) {
    console.error('markCronJobExecuted error:', err.response?.data || err.message);
  }
}

async function getRandomHotLeads(count) {
  try {
    // In a real app we might query randomly, but for now just get top N
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/gs_leads?status=eq.new&order=total_score.desc&limit=${count}&select=*`,
      { headers }
    );
    return res.data || [];
  } catch (err) {
    console.error('getRandomHotLeads error:', err.message);
    return [];
  }
}

async function verifyDashboardCredentials(username, password) {
  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/onboarding_states?dashboard_username=eq.${encodeURIComponent(username)}&dashboard_password=eq.${encodeURIComponent(password)}&select=business_id,clinic_name`,
      { headers }
    );
    return res.data?.[0] || null;
  } catch (err) {
    console.error('verifyDashboardCredentials error:', err.message);
    return null;
  }
}

async function getDashboardMetrics(clinicId) {
  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/dashboard_metrics_view?clinic_id=eq.${clinicId}&select=*`,
      { headers }
    );
    return res.data?.[0] || null;
  } catch (err) {
    console.error('getDashboardMetrics error:', err.message);
    return null;
  }
}

async function getDashboardFeed(clinicId) {
  try {
    // Recent appointments as a proxy for "conversations" in MVP
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/appointments?clinic_id=eq.${clinicId}&order=created_at.desc&limit=20&select=*`,
      { headers }
    );
    return res.data || [];
  } catch (err) {
    console.error('getDashboardFeed error:', err.message);
    return [];
  }
}

async function getDashboardCalendar(clinicId) {
  try {
    // Current week appointments
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startISO = startOfWeek.toISOString().split('T')[0];

    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/appointments?clinic_id=eq.${clinicId}&preferred_date_iso=gte.${startISO}&order=preferred_date_iso.asc,time_slot.asc&select=*`,
      { headers }
    );
    return res.data || [];
  } catch (err) {
    console.error('getDashboardCalendar error:', err.message);
    return [];
  }
}

module.exports = {
  getPatient, insertPatient, savePatient, deletePatient,
  getClinic, getClinicById,
  saveAppointment, getAppointment, updateAppointment,
  checkDuplicateBooking, getAppointmentCountsForDate,
  getAppointmentsForReminder,
  getAppointmentsDueTomorrow, getAppointmentsDueInOneHour, getAppointmentsDueFollowUp,
  getDoctorsByClinic,
  getOnboardingByPhone, getOnboardingById, createOnboarding, updateOnboarding, logOnboardingMessage,
  createCronJob, getPendingCronJobs, markCronJobExecuted, getRandomHotLeads,
  verifyDashboardCredentials, getDashboardMetrics, getDashboardFeed, getDashboardCalendar
};
