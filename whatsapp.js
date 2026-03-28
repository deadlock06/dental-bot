const twilio = require('twilio');

const TWILIO_ACCOUNT_SID  = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN   = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM;

async function sendMessage(to, text) {
  try {
    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    await client.messages.create({
      from: TWILIO_WHATSAPP_FROM,
      to:   `whatsapp:+${to}`,
      body: text
    });
  } catch (err) {
    console.error('sendMessage error:', err.message);
  }
}

module.exports = { sendMessage };
