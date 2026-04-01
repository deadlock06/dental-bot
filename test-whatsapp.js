require('dotenv').config();
const { sendMessage } = require('./whatsapp');

async function check() {
  const testPhone = '201119760927'; // Is this the user's phone? I'll use the one from index.js log fragments if I can find it. 
  // Actually, I should use the user's phone if possible.
  // The log fragment showed: whatsapp:+966572914855
  const userPhone = '966572914855';
  
  console.log('Sending test message to:', userPhone);
  await sendMessage(userPhone, 'Hello from Dental Bot diagnostic script! 🦷');
  console.log('Message sent (check console for errors)');
}

check();
