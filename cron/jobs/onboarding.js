const db = require('../../db.js');
const onboarding = require('../../growth/onboarding-state-machine.js');

async function runOnboardingCron() {
  // Find pending cron jobs that are due
  const jobs = await db.getPendingCronJobs();
  
  for (const job of jobs) {
    const state = await db.getOnboardingById(job.onboarding_id);
    
    if (job.type === 'followup') await onboarding.runDay1(state);
    if (job.type === 'checkin') await onboarding.runDay3(state);
    if (job.type === 'review') await onboarding.runDay7(state);
    
    await db.markCronJobExecuted(job.id);
  }
}

// Run every hour
module.exports = runOnboardingCron;
