// slots.js — Doctor-specific dynamic slot generation and availability

const axios = require('axios');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json'
};

// ─────────────────────────────────────────────
// Schedule queries
// ─────────────────────────────────────────────

async function getDoctorSchedules(clinicId) {
  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/doctor_schedules?clinic_id=eq.${clinicId}&is_active=eq.true&select=*`,
      { headers }
    );
    return res.data || [];
  } catch (err) {
    console.error('[Slots] getDoctorSchedules error:', err.message);
    return [];
  }
}

async function getDoctorSchedule(clinicId, doctorId) {
  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/doctor_schedules?clinic_id=eq.${clinicId}&doctor_id=eq.${encodeURIComponent(doctorId)}&is_active=eq.true&select=*&limit=1`,
      { headers }
    );
    return res.data[0] || null;
  } catch (err) {
    console.error('[Slots] getDoctorSchedule error:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────

// Convert stored human-readable date string to YYYY-MM-DD
function toDateISO(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  } catch (e) { /* ignore */ }
  return null;
}

// Get English day name from ISO date string (uses noon UTC to avoid timezone edge cases)
function getDayName(isoDate) {
  const d = new Date(isoDate + 'T12:00:00Z');
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()];
}

// ─────────────────────────────────────────────
// Slot generation
// ─────────────────────────────────────────────

async function generateSlotsForDate(clinicId, doctorId, isoDate) {
  try {
    const schedule = await getDoctorSchedule(clinicId, doctorId);
    if (!schedule) return [];

    const dayName = getDayName(isoDate);
    if (!schedule.working_days.includes(dayName)) return [];

    const slots = [];
    let current = parseTime(schedule.start_time);
    const end = parseTime(schedule.end_time);
    const breakStart = schedule.break_start ? parseTime(schedule.break_start) : null;
    const breakEnd   = schedule.break_end   ? parseTime(schedule.break_end)   : null;
    const dur = schedule.slot_duration_minutes || 30;

    while (current + dur <= end) {
      if (breakStart !== null && breakEnd !== null && current >= breakStart && current < breakEnd) {
        current += dur;
        continue;
      }

      const hh = String(Math.floor(current / 60)).padStart(2, '0');
      const mm = String(current % 60).padStart(2, '0');

      slots.push({
        clinic_id:            clinicId,
        doctor_id:            doctorId,
        doctor_name:          schedule.doctor_name,
        slot_date:            isoDate,
        slot_time:            `${hh}:${mm}`,
        slot_time_display:    formatTime(current),
        slot_time_display_ar: formatTimeAr(current),
        status:               'available'
      });

      current += dur;
    }

    if (slots.length > 0) {
      await axios.post(
        `${SUPABASE_URL}/rest/v1/doctor_slots`,
        slots,
        { headers: { ...headers, Prefer: 'resolution=ignore-duplicates' } }
      );
    }

    return slots;
  } catch (err) {
    console.error('[Slots] generateSlotsForDate error:', err.message);
    return [];
  }
}

// ─────────────────────────────────────────────
// Availability query
// ─────────────────────────────────────────────

async function getAvailableSlots(clinicId, doctorId, isoDate) {
  try {
    await generateSlotsForDate(clinicId, doctorId, isoDate);

    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/doctor_slots?clinic_id=eq.${clinicId}&doctor_id=eq.${encodeURIComponent(doctorId)}&slot_date=eq.${isoDate}&status=eq.available&order=slot_time.asc&select=*`,
      { headers }
    );
    return res.data || [];
  } catch (err) {
    console.error('[Slots] getAvailableSlots error:', err.message);
    return [];
  }
}

// ─────────────────────────────────────────────
// Booking / release (atomic)
// ─────────────────────────────────────────────

// Book a slot atomically — returns { success: true } or { success: false, reason }
// The WHERE status=eq.available ensures only one patient can succeed (race condition safe)
async function bookSlot(clinicId, doctorId, isoDate, slotTime, patientPhone) {
  try {
    const res = await axios.patch(
      `${SUPABASE_URL}/rest/v1/doctor_slots?clinic_id=eq.${clinicId}&doctor_id=eq.${encodeURIComponent(doctorId)}&slot_date=eq.${isoDate}&slot_time=eq.${encodeURIComponent(slotTime)}&status=eq.available`,
      { status: 'booked', patient_phone: patientPhone },
      { headers: { ...headers, Prefer: 'return=representation' } }
    );
    if (!res.data || res.data.length === 0) {
      return { success: false, reason: 'slot_taken' };
    }
    return { success: true };
  } catch (err) {
    console.error('[Slots] bookSlot error:', err.message);
    return { success: false, reason: 'error' };
  }
}

// Release a slot when appointment is cancelled (matches by patient_phone + date + doctor)
async function releaseSlotByPatient(clinicId, doctorId, isoDate, patientPhone) {
  try {
    await axios.patch(
      `${SUPABASE_URL}/rest/v1/doctor_slots?clinic_id=eq.${clinicId}&doctor_id=eq.${encodeURIComponent(doctorId)}&slot_date=eq.${isoDate}&patient_phone=eq.${encodeURIComponent(patientPhone)}&status=eq.booked`,
      { status: 'available', appointment_id: null, patient_phone: null },
      { headers }
    );
    return true;
  } catch (err) {
    console.error('[Slots] releaseSlotByPatient error:', err.message);
    return false;
  }
}

// Update slot with appointment_id after appointment is saved (fire-and-forget linkage)
async function linkSlotToAppointment(clinicId, doctorId, isoDate, patientPhone, appointmentId) {
  try {
    await axios.patch(
      `${SUPABASE_URL}/rest/v1/doctor_slots?clinic_id=eq.${clinicId}&doctor_id=eq.${encodeURIComponent(doctorId)}&slot_date=eq.${isoDate}&patient_phone=eq.${encodeURIComponent(patientPhone)}&status=eq.booked`,
      { appointment_id: appointmentId },
      { headers }
    );
  } catch (err) {
    console.error('[Slots] linkSlotToAppointment error:', err.message);
  }
}

// ─────────────────────────────────────────────
// Time helpers
// ─────────────────────────────────────────────

// Parse "HH:MM" or "HH:MM:SS" to total minutes
function parseTime(timeStr) {
  const parts = timeStr.split(':').map(Number);
  return parts[0] * 60 + parts[1];
}

// Format minutes to "9:00 AM"
function formatTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${displayH}:${String(m).padStart(2, '0')} ${ampm}`;
}

// Format minutes to Arabic "9:00 صباحاً"
function formatTimeAr(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? 'مساءً' : 'صباحاً';
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${displayH}:${String(m).padStart(2, '0')} ${ampm}`;
}

module.exports = {
  getDoctorSchedules,
  getDoctorSchedule,
  generateSlotsForDate,
  getAvailableSlots,
  bookSlot,
  releaseSlotByPatient,
  linkSlotToAppointment,
  toDateISO,
  getDayName
};
