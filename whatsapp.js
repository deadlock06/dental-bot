const twilio = require('twilio');

async function sendMessage(to, text) {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken  = process.env.TWILIO_AUTH_TOKEN;
    const from       = process.env.TWILIO_WHATSAPP_FROM;

    const client = twilio(accountSid, authToken);
    await client.messages.create({
      from: from,
      to:   `whatsapp:+${to}`,
      body: text
    });
  } catch (err) {
    console.error('sendMessage error:', err.message);
  }
}

module.exports = { sendMessage };
