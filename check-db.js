require('dotenv').config();
const { insertPatient, savePatient, getPatient } = require('./db');

async function check() {
  const testPhone = '1234567890';
  console.log('--- Testing Database ---');
  
  console.log('1. Trying to insert patient...');
  const res1 = await insertPatient(testPhone);
  console.log('Insert result:', res1 ? 'SUCCESS' : 'FAILED (check console logs)');

  console.log('2. Trying to update patient...');
  await savePatient(testPhone, { language: 'en', current_flow: 'test' });
  console.log('Update call finished (check console logs for status)');

  console.log('3. Trying to get patient...');
  const res2 = await getPatient(testPhone);
  console.log('Get result:', res2 ? 'SUCCESS' : 'FAILED');
  if (res2) console.log('Patient data:', JSON.stringify(res2));
}

check();
