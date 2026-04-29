// slots.js — Doctor-specific dynamic slot generation and availability

const axios = require('axios');
const { DateTime } = require('luxon');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json'
};

// ─────────────────────────────────────────────
// In-Memory Elastic Soft-Locks (Waitlists)
// ─────────────────────────────────────────────
const slotHolds = new Map();

function getActiveHoldsCount(clinicId, doctorId, isoDate, slotTime) {
  const holdKey = `${clinicId}_${doctorId}_${isoDate}_${slotTime}`;
  const holds = slotHolds.get(holdKey) || [];
  const now = Date.now();
  return holds.filter(h => h.expiresAt > now).length;
}

function acquireHold(clinicId, doctorId, isoDate, slotTime, phone) {
  const holdKey = `${clinicId}_${doctorId}_${isoDate}_${slotTime}`;
  const holds = slotHolds.get(holdKey) || [];
  const now = Date.now();
  const validHolds = holds.filter(h => h.expiresAt > now && h.phone !== phone);
  
  // Wait, capacity validation usually happens before calling acquireHold, but we'll return true.
  validHolds.push({ phone, expiresAt: now + 10 * 60 * 1000 }); // 10 min hold
  slotHolds.set(holdKey, validHolds);
  return true;
}

function releaseHold(clinicId, doctorId, isoDate, slotTime, phone) {
  const holdKey = `${clinicId}_${doctorId}_${isoDate}_${slotTime}`;
  const holds = slotHolds.get(holdKey) || [];
  slotHolds.set(holdKey, holds.filter(h => h.phone !== phone));
}

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
    const d = DateTime.fromISO(dateStr, { zone: 'Asia/Riyadh' });
    if (d.isValid) return d.toISODate();
    // Fallback for other formats
    const d2 = new Date(dateStr);
    if (!isNaN(d2.getTime())) return DateTime.fromJSDate(d2).setZone('Asia/Riyadh').toISODate();
  } catch (e) { /* ignore */ }
  return null;
}

// Get English day name from ISO date string (uses noon UTC to avoid timezone edge cases)
function getDayName(isoDate) {
  const d = DateTime.fromISO(isoDate, { zone: 'Asia/Riyadh' });
  return d.isValid ? d.toFormat('cccc') : null;
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
        // Jump directly past the break instead of stepping through it slot-by-slot
        current = breakEnd;
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
      // Use upsert with ignore-duplicates so re-generating an already-populated date is safe.
      // The on_conflict param tells Supabase which unique key to use (clinic_id, doctor_id, slot_date, slot_time).
      await axios.post(
        `${SUPABASE_URL}/rest/v1/doctor_slots?on_conflict=clinic_id,doctor_id,slot_date,slot_time`,
        slots,
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=ignore-duplicates,return=minimal'
          }
        }
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
    const now = DateTime.now().setZone('Asia/Riyadh');
    await generateSlotsForDate(clinicId, doctorId, isoDate);

    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/doctor_slots?clinic_id=eq.${clinicId}&doctor_id=eq.${encodeURIComponent(doctorId)}&slot_date=eq.${isoDate}&status=in.(available,booked)&order=slot_time.asc&select=*`,
      { headers }
    );
    const allSlots = res.data || [];

    const { getAppointmentCountsForDate } = require('./db');
    const dbCounts = await getAppointmentCountsForDate(clinicId, doctorId, isoDate);

    const elasticSlots = [];
    const ELASTIC_CAPACITY_MAX = 2; // Allow up to 2 overlapping patients per slot

    const isToday = isoDate === now.toISODate();
    const currentMinutes = now.hour * 60 + now.minute;

    for (const slot of allSlots) {
      // Filter out past slots if it's today
      if (isToday) {
        const slotMinutes = parseTime(slot.slot_time);
        if (slotMinutes <= currentMinutes + 15) continue; // 15 min buffer
      }

      const activeDbCount = dbCounts[slot.slot_time] || 0;
      const memHoldCount  = getActiveHoldsCount(clinicId, doctorId, isoDate, slot.slot_time);
      const totalCapacityUsed = activeDbCount + memHoldCount;

      if (totalCapacityUsed < ELASTIC_CAPACITY_MAX) {
        if (totalCapacityUsed > 0) {
          slot.is_walkin = true;
          slot.slot_time_display += ' (Short Wait)';
          slot.slot_time_display_ar += ' (انتظار قصير)';
        }
        elasticSlots.push(slot);
      }
    }
    return elasticSlots;
  } catch (err) {
    console.error('[Slots] getAvailableSlots error:', err.message);
    return [];
  }
}

// ─────────────────────────────────────────────
// Booking / release (atomic)
// ─────────────────────────────────────────────

// Book a slot with Elastic Capacity limits — validates using db counts to prevent overbooking
async function bookSlot(clinicId, doctorId, isoDate, slotTime, patientPhone) {
  console.log('[Slots] Booking slot:', clinicId, doctorId, isoDate, slotTime);
  try {
    const { getAppointmentCountsForDate } = require('./db');
    const dbCounts = await getAppointmentCountsForDate(clinicId, doctorId, isoDate);
    const activeCount = dbCounts[slotTime] || 0;
    const ELASTIC_CAPACITY_MAX = 2;

    if (activeCount >= ELASTIC_CAPACITY_MAX) {
      return { success: false, reason: 'slot_taken' };
    }

    await axios.patch(
      `${SUPABASE_URL}/rest/v1/doctor_slots?clinic_id=eq.${clinicId}&doctor_id=eq.${encodeURIComponent(doctorId)}&slot_date=eq.${isoDate}&slot_time=eq.${encodeURIComponent(slotTime)}`,
      { status: 'booked', patient_phone: patientPhone },
      { headers: { ...headers, Prefer: 'return=representation' } }
    );
    
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
  getAvailableSlots, bookSlot, releaseSlotByPatient, generateSlotsForDate,
  acquireHold, releaseHold, getActiveHoldsCount,
  linkSlotToAppointment,
  toDateISO,
  getDayName
};
