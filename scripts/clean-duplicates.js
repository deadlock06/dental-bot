require('dotenv').config();
const axios = require('axios');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation'
};

async function checkDuplicates() {
  console.log('Fetching active appointments...');
  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/appointments?status=neq.cancelled&select=*`,
      { headers }
    );
    
    const appointments = res.data;
    console.log(`Found ${appointments.length} active appointments.`);
    
    const map = new Map();
    const duplicates = [];
    
    for (const appt of appointments) {
      const key = `${appt.clinic_id}_${appt.doctor_name}_${appt.appointment_date}_${appt.appointment_time}`;
      if (map.has(key)) {
        duplicates.push({ keep: map.get(key), duplicate: appt });
      } else {
        map.set(key, appt);
      }
    }
    
    if (duplicates.length > 0) {
      console.log(`🚨 Found ${duplicates.length} duplicate slots!`);
      for (const pair of duplicates) {
        console.log(`- Duplicate ID: ${pair.duplicate.id} conflicts with ID: ${pair.keep.id} (${pair.keep.appointment_date} ${pair.keep.appointment_time} with ${pair.keep.doctor_name})`);
        
        // Clean it up (cancel the duplicate)
        console.log(`  Cancelling duplicate ID: ${pair.duplicate.id}...`);
        await axios.patch(
          `${SUPABASE_URL}/rest/v1/appointments?id=eq.${pair.duplicate.id}`,
          { status: 'cancelled' },
          { headers }
        );
      }
      console.log('✅ Duplicates cleaned up.');
    } else {
      console.log('✅ No duplicates found. Safe to apply unique index.');
    }
    
  } catch (err) {
    console.error('Error fetching appointments:', err.response ? err.response.data : err.message);
  }
}

checkDuplicates();
