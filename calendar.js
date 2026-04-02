const { google } = require('googleapis');

const TIMEZONE = 'Asia/Riyadh';
const DURATION_MINS = 30;

function getCalendarClient() {
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  let privateKey;

  if (process.env.GOOGLE_PRIVATE_KEY_BASE64) {
    privateKey = Buffer.from(process.env.GOOGLE_PRIVATE_KEY_BASE64, 'base64').toString('utf8');
    console.log('[Calendar] Using base64 decoded key');
  } else if (process.env.GOOGLE_PRIVATE_KEY) {
    privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n').trim();
    console.log('[Calendar] Using direct key');
  }

  if (!email || !privateKey) {
    throw new Error('Google Calendar credentials not configured');
  }

  console.log('[Calendar] Email:', email.substring(0, 40));
  console.log('[Calendar] Key type:', privateKey.includes('RSA') ? 'RSA' : 'PKCS8');
  console.log('[Calendar] Key has newlines:', privateKey.includes('\n'));

  // Use GoogleAuth with credentials object — handles PKCS#8 keys correctly
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: email,
      private_key:  privateKey
    },
    scopes: ['https://www.googleapis.com/auth/calendar']
  });

  return google.calendar({ version: 'v3', auth });
}

// "9:00 AM" → "09:00:00"
function parseSlotToHHMM(timeSlot) {
  const match = timeSlot.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return null;
  let hours   = parseInt(match[1]);
  const mins  = parseInt(match[2]);
  const ampm  = match[3].toUpperCase();
  if (ampm === 'PM' && hours !== 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00`;
}

// Returns true if no confirmed event exists in the slot window
async function isSlotAvailable(calendarId, dateISO, startTime, durationMins = DURATION_MINS) {
  try {
    const cal   = getCalendarClient();
    const hhmm  = parseSlotToHHMM(startTime);
    if (!hhmm) return true;
    const start = new Date(`${dateISO}T${hhmm}`);
    const end   = new Date(start.getTime() + durationMins * 60000);

    const res = await cal.events.list({
      calendarId,
      timeMin:      start.toISOString(),
      timeMax:      end.toISOString(),
      singleEvents: true,
      maxResults:   5
    });
    return (res.data.items || []).length === 0;
  } catch (err) {
    console.error('[Calendar] isSlotAvailable error:', err.message);
    return true; // non-blocking — don't block booking on calendar failure
  }
}

// Creates a calendar event and returns the event ID (or null on failure)
async function createBookingEvent(calendarId, appointment) {
  try {
    const cal  = getCalendarClient();
    const hhmm = parseSlotToHHMM(appointment.time_slot);
    if (!hhmm) {
      console.error('[Calendar] createBookingEvent: cannot parse time_slot:', appointment.time_slot);
      return null;
    }
    const start = new Date(`${appointment.preferred_date_iso}T${hhmm}`);
    const end   = new Date(start.getTime() + DURATION_MINS * 60000);

    const doctorLine = appointment.doctor_name ? `Doctor: ${appointment.doctor_name}\n` : '';
    const notesLine  = appointment.description  ? `Notes: ${appointment.description}\n`  : '';

    const event = {
      summary:     `${appointment.treatment} — ${appointment.name}`,
      description: `Patient: ${appointment.name}\nPhone: ${appointment.phone}\n${doctorLine}Treatment: ${appointment.treatment}\n${notesLine}`,
      start: { dateTime: start.toISOString(), timeZone: TIMEZONE },
      end:   { dateTime: end.toISOString(),   timeZone: TIMEZONE }
    };

    const res = await cal.events.insert({ calendarId, resource: event });
    console.log('[Calendar] Event created:', res.data.id);
    return res.data.id;
  } catch (err) {
    console.error('[Calendar] createBookingEvent error:', err.message);
    return null;
  }
}

// Deletes a calendar event by ID. Returns true on success.
async function deleteBookingEvent(calendarId, eventId) {
  if (!eventId) return false;
  try {
    const cal = getCalendarClient();
    await cal.events.delete({ calendarId, eventId });
    console.log('[Calendar] Event deleted:', eventId);
    return true;
  } catch (err) {
    if (err.code === 410 || err.code === 404) {
      // Already deleted — treat as success
      console.log('[Calendar] Event already gone:', eventId);
      return true;
    }
    console.error('[Calendar] deleteBookingEvent error:', err.message);
    return false;
  }
}

// Updates date/time of an existing calendar event. Returns true on success.
async function updateBookingEvent(calendarId, eventId, newDetails) {
  if (!eventId) return false;
  try {
    const cal  = getCalendarClient();
    const hhmm = parseSlotToHHMM(newDetails.time_slot);
    if (!hhmm) {
      console.error('[Calendar] updateBookingEvent: cannot parse time_slot:', newDetails.time_slot);
      return false;
    }
    const start = new Date(`${newDetails.preferred_date_iso}T${hhmm}`);
    const end   = new Date(start.getTime() + DURATION_MINS * 60000);

    await cal.events.patch({
      calendarId,
      eventId,
      resource: {
        start: { dateTime: start.toISOString(), timeZone: TIMEZONE },
        end:   { dateTime: end.toISOString(),   timeZone: TIMEZONE }
      }
    });
    console.log('[Calendar] Event updated:', eventId);
    return true;
  } catch (err) {
    console.error('[Calendar] updateBookingEvent error:', err.message);
    return false;
  }
}

// Startup connectivity test — call once after server starts
async function testCalendarConnection() {
  try {
    const cal = getCalendarClient();
    await cal.calendars.get({ calendarId: process.env.GOOGLE_CALENDAR_ID });
    console.log('[Calendar] ✅ Connection successful');
  } catch (e) {
    console.error('[Calendar] ❌ Connection failed:', e.message);
  }
}

module.exports = { isSlotAvailable, createBookingEvent, deleteBookingEvent, updateBookingEvent, testCalendarConnection };
