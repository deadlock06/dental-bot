const db = require('../../db');
const { sendMessage } = require('../../whatsapp');
const { DateTime } = require('luxon');
const dentalConfig = require('../../verticals/dental.json');

async function sendReminders() {
  try {
    const now = DateTime.now().setZone('Asia/Riyadh');
    const todayISO = now.toISODate();
    
    // 1. Get 24h reminders
    const appts24h = await db.getAppointmentsDueTomorrow();
    for (const appt of appts24h) {
      const ar = appt.language === 'ar';
      const template = ar ? dentalConfig.messages.reminders['24h'].ar : dentalConfig.messages.reminders['24h'].en;
      const msg = template
        .replace('{name}', appt.name)
        .replace('{date}', appt.preferred_date)
        .replace('{slot}', appt.time_slot)
        .replace('{clinic}', appt.clinic_name)
        .replace('{treatment}', appt.treatment || (ar ? 'كشف' : 'Consultation'));
      
      await sendMessage(appt.phone, msg);
      await db.updateAppointment(appt.id, { reminder_sent_24h: true });
    }

    // 2. Get 1h reminders
    const appts1h = await db.getAppointmentsDueInOneHour();
    for (const appt of appts1h) {
      const ar = appt.language === 'ar';
      const template = ar ? dentalConfig.messages.reminders['1h'].ar : dentalConfig.messages.reminders['1h'].en;
      const msg = template
        .replace('{slot}', appt.time_slot)
        .replace('{clinic}', appt.clinic_name || (ar ? 'العيادة' : 'the clinic'));
      
      await sendMessage(appt.phone, msg);
      await db.updateAppointment(appt.id, { reminder_sent_1h: true });
    }

    return { success: true, count: appts24h.length + appts1h.length };
  } catch (err) {
    console.error('[Job Reminders] Error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = sendReminders;
