require('dotenv').config();
const { getClinic } = require('./db');

async function check() {
  const botPhone = process.env.WHATSAPP_PHONE_ID;
  const fromNum  = process.env.TWILIO_WHATSAPP_FROM;
  
  console.log('Checking with WHATSAPP_PHONE_ID:', botPhone);
  const clinic1 = await getClinic(botPhone);
  console.log('Clinic found with Phone ID:', clinic1 ? clinic1.name : 'NONE');

  const cleanNum = fromNum.replace(/^whatsapp:\+/, '');
  console.log('Checking with TWILIO_WHATSAPP_FROM (cleaned):', cleanNum);
  const clinic2 = await getClinic(cleanNum);
  console.log('Clinic found with From Num:', clinic2 ? clinic2.name : 'NONE');
}

check();
