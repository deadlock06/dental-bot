require('dotenv').config();
const { healthCheck } = require('../monitor');

async function runFullHealthCheck() {
  console.log('--- System Health Check (Supabase, OpenAI, Twilio) ---');
  try {
    const results = await healthCheck();
    console.log(JSON.stringify(results, null, 2));
    
    if (results.status === 'healthy') {
      console.log('\n✅ System is fully healthy and connected.');
    } else {
      console.log(`\n⚠️ System is ${results.status.toUpperCase()}. Check the components above.`);
    }
  } catch (err) {
    console.error('\n❌ Health check failed with error:', err.message);
  }
}

runFullHealthCheck();
