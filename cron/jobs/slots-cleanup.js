const db = require('../../db');
const axios = require('axios');
const { DateTime } = require('luxon');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json'
};

async function cleanupSlots() {
  try {
    const todayISO = DateTime.now().setZone('Asia/Riyadh').toISODate();
    
    // Release all booked slots from dates BEFORE today
    const res = await axios.patch(
      `${SUPABASE_URL}/rest/v1/doctor_slots?slot_date=lt.${todayISO}&status=eq.booked`,
      { status: 'available', patient_phone: null, appointment_id: null },
      { headers }
    );
    
    console.log(`[Job Slots Cleanup] Released ${res.data?.length || 0} old slots.`);
    return { success: true, count: res.data?.length || 0 };
  } catch (err) {
    console.error('[Job Slots Cleanup] Error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = cleanupSlots;
