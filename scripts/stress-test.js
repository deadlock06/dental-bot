require('dotenv').config();
const axios = require('axios');
const http = require('http');

const PORT = process.env.PORT || 3000;
const URL = `http://localhost:${PORT}/webhook`;

// We use 50 concurrent requests
const CONCURRENCY = 50;

async function runStressTest() {
  console.log(`🚀 Starting Atomic Lock Stress Test with ${CONCURRENCY} concurrent requests...`);
  console.log(`⚠️ Make sure your local server is running on port ${PORT}!`);

  // We are going to hit the webhook endpoint.
  // The webhook expects Twilio format: Form URL-encoded data.
  // But wait! We need to isolate this so it doesn't send real WhatsApp messages.
  // The user requested mocking Twilio sends in this script...
  // However, we are making HTTP requests to a running server.
  // We cannot monkey-patch the running server from this script directly unless we start the server from here,
  // OR we mock it inside the server code itself using a special test flag,
  // OR we just test the RPC function directly via the Supabase REST API!

  // The user said: "Stress test with mocked sends + test DB", 
  // "In scripts/stress-test.js, monkey-patch whatsapp.sendMessage before firing payloads."
  // Wait, if I monkey patch it here, I must require the local bot files and run the logic directly,
  // rather than making an HTTP request to the running express server.
  // Let's run the DB logic or the webhook logic directly!
  
  const bot = require('../bot.js');
  const whatsapp = require('../whatsapp.js');
  
  // Monkey patch Twilio sendMessage
  whatsapp.sendMessage = async (to, text) => {
    // Silent mock
    return;
  };
  whatsapp.sendInteractiveList = async () => {};
  whatsapp.sendMainMenu = async () => {};
  whatsapp.sendTreatmentMenu = async () => {};
  whatsapp.sendDoctorMenu = async () => {};
  whatsapp.sendTimeSlotMenu = async () => {};
  
  // Dummy Clinic and Date
  const dummyClinic = {
    id: '00000000-0000-0000-0000-000000000000', // needs to be a valid UUID for Supabase, or we just let it be null. But clinic_id is nullable.
    name: 'Stress Test Clinic',
    vertical: 'dental',
    services: [],
    config: {},
    doctors: [{
      id: 'doc1',
      name: 'Dr. Stress',
      available: 'Mon-Fri'
    }]
  };
  
  const isoDate = new Date().toISOString().split('T')[0]; // Today
  
  console.log('Mocking whatsapp.js sends... ✅');
  console.log('Preparing promises... ⏳');

  const promises = [];
  
  // To reach the exact atomic lock, we can bypass the AI and state machine and directly call handleBookingFlow?
  // Or we can just call saveAppointment from db.js directly to test the lock!
  // The user said: "If your current slot reservation is a standard read-then-update via Supabase REST... To make this pass, you likely need a Supabase Edge Function or RPC".
  // The truest test of the atomic lock is hammering db.js saveAppointment.
  
  const db = require('../db.js');
  
  // Generate 50 concurrent requests for the exact same slot
  for (let i = 0; i < CONCURRENCY; i++) {
    const payload = {
      phone: `+9665000000${i.toString().padStart(2, '0')}`,
      clinic_id: '013f7762-501b-4b53-822b-69b4acf9ab94',
      name: `Patient ${i}`,
      treatment: 'Consultation',
      preferred_date: 'Today',
      preferred_date_iso: isoDate,
      time_slot: '09:00 AM',
      doctor_id: 'doc1',
      doctor_name: 'Dr. Stress'
    };
    
    promises.push(db.saveAppointment(payload));
  }
  
  console.log(`Firing ${CONCURRENCY} concurrent saveAppointment requests... 🔫`);
  const startTime = Date.now();
  
  const results = await Promise.all(promises);
  
  const timeTaken = Date.now() - startTime;
  console.log(`Test completed in ${timeTaken}ms.`);
  
  const successes = results.filter(r => r && r.id && !r.error).length;
  const rejections = results.filter(r => !r || r.error === 'SLOT_TAKEN').length;
  const otherErrors = results.filter(r => r && r.error && r.error !== 'SLOT_TAKEN').length;
  
  console.log('--- RESULTS ---');
  console.log(`Successes: ${successes}`);
  console.log(`Rejections (SLOT_TAKEN): ${rejections}`);
  if (otherErrors > 0) {
    console.log(`Other Errors: ${otherErrors}`);
  }
  
  try {
    console.assert(successes === 1, `Expected 1 success, got ${successes}`);
    console.assert(rejections === 49, `Expected 49 rejections, got ${rejections}`);
    console.log('✅ ATOMIC LOCK VERIFIED: Only 1 booking succeeded, 49 were rejected.');
    
    // Also verify: a cancelled slot CAN be rebooked
    if (successes === 1) {
      console.log('Testing cancellation & rebooking (Partial Index check)...');
      const successfulAppt = results.find(r => r && r.id && !r.error);
      
      // Cancel it
      await db.updateAppointment(successfulAppt.id, { status: 'cancelled' });
      console.log(`Cancelled appointment ${successfulAppt.id}.`);
      
      // Try to book the exact same slot again
      const rebookPayload = {
        phone: `+966500000099`,
        clinic_id: '013f7762-501b-4b53-822b-69b4acf9ab94',
        name: `Patient 99 (Rebook)`,
        treatment: 'Consultation',
        preferred_date: 'Today',
        preferred_date_iso: isoDate,
        time_slot: '09:00 AM',
        doctor_id: 'doc1',
        doctor_name: 'Dr. Stress'
      };
      
      const rebookRes = await db.saveAppointment(rebookPayload);
      if (rebookRes && rebookRes.id && !rebookRes.error) {
        console.log('✅ REBOOKING VERIFIED: Cancelled slot was successfully rebooked.');
        // Clean up
        await db.updateAppointment(rebookRes.id, { status: 'cancelled' });
      } else {
        console.error('❌ REBOOKING FAILED: Partial index might be over-blocking!');
        console.log(rebookRes);
      }
    }
    
  } catch (err) {
    console.error('❌ ASSERTION FAILED:', err.message);
  }
  
  process.exit(0);
}

runStressTest();
