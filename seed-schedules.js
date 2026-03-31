// seed-schedules.js — Insert / refresh doctor schedules for all clinics
// Usage: node seed-schedules.js
// Safe to re-run (uses merge-duplicates)

require('dotenv').config();
const axios = require('axios');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const headers = {
  apikey:        SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  Prefer:        'return=representation,resolution=merge-duplicates'
};

// ─────────────────────────────────────────────
// Clinic: Smile Dental Clinic
// ─────────────────────────────────────────────
const SMILE_CLINIC_ID = '013f7762-501b-4b53-822b-69b4acf9ab94';

const schedules = [
  // Dr. Ahmed Al-Rashid — Orthodontics
  // Works: Sun / Mon / Tue / Wed
  // Hours: 9:00 AM – 5:00 PM (30-min slots, 1-2 PM lunch)
  {
    clinic_id:             SMILE_CLINIC_ID,
    doctor_id:             'dr_ahmed_alrashid',
    doctor_name:           'Ahmed Al-Rashid',
    working_days:          ['Sunday', 'Monday', 'Tuesday', 'Wednesday'],
    start_time:            '09:00',
    end_time:              '17:00',
    break_start:           '13:00',
    break_end:             '14:00',
    slot_duration_minutes: 30,
    is_active:             true
  },

  // Dr. Sara Al-Otaibi — Implants & Surgery
  // Works: Mon / Wed / Thu
  // Hours: 10:00 AM – 6:00 PM (30-min slots, 1:30-2:30 PM lunch)
  {
    clinic_id:             SMILE_CLINIC_ID,
    doctor_id:             'dr_sara_alotaibi',
    doctor_name:           'Sara Al-Otaibi',
    working_days:          ['Monday', 'Wednesday', 'Thursday'],
    start_time:            '10:00',
    end_time:              '18:00',
    break_start:           '13:30',
    break_end:             '14:30',
    slot_duration_minutes: 30,
    is_active:             true
  }
];

async function seed() {
  console.log(`Seeding ${schedules.length} doctor schedules...`);
  try {
    const res = await axios.post(
      `${SUPABASE_URL}/rest/v1/doctor_schedules`,
      schedules,
      { headers }
    );
    console.log(`Done. Status: ${res.status}`);
    for (const s of res.data) {
      console.log(`  ✓ ${s.doctor_name} (${s.doctor_id}) — ${s.working_days.join(', ')} ${s.start_time}-${s.end_time}`);
    }
  } catch (err) {
    console.error('Seed error:', err.response?.data || err.message);
  }
}

seed();
