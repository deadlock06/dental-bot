const ACCOUNT_SID = 'AC5fa90b9314dbb55c6d2b15ed31da8c06';
const AUTH_TOKEN  = '61f9cfd0d97a3a95dc1d425746ba57e7';
const FROM        = 'whatsapp:+14155238886';

async function sendMessage(to, text) {
  try {
    const twilio = require('twilio');
    const client = twilio(ACCOUNT_SID, AUTH_TOKEN);
    await client.messages.create({
      from: FROM,
      to:   `whatsapp:+${to}`,
      body: text
    });
  } catch (err) {
    console.error('sendMessage error:', err.message);
  }
}

module.exports = { sendMessage };
