const { getGhostRoomUrl, detectLanguage: detectLeadLanguage } = require('./brain');

function detectIntent(message) {
  if (!message) return 'general';
  
  const msg = message.toLowerCase();
  
  if (/سعر|price|كم|cost|expensive|رسوم|تكلفة|كمية|كم الاشتراك/.test(msg)) {
    return 'price_query';
  }
  if (/demo|جرب|try|test|تجربة|نجرب|شوف|أريد أن أرى/.test(msg)) {
    return 'demo_request';
  }
  if (/مشكلة|problem|slow|bad|بطيء|سيء|ما يرد/.test(msg)) {
    return 'complaint';
  }
  return 'general';
}

function detectLanguage(message) {
  return /[\u0600-\u06FF]/.test(message || '') ? 'ar' : 'en';
}

function generateROIMessage(lead, lang) {
  const url = getGhostRoomUrl(lead);
  if (lang === 'ar') {
    return `بناءً على حساباتنا، التأخير في الرد يكلفك أكثر من ذكائنا الاصطناعي (299 ريال فقط/شهر). شاهده هنا: ${url}`;
  }
  return `Based on our maths, delayed replies cost you more than our AI (only 299 SAR/mo). See the math: ${url}`;
}

async function startDemoBooking(lead, lang) {
  // Logic to create patient and trigger the bot flow dynamically
  // Simulated here since bot.js depends on database actions
  console.log(`[handoff.js] Creating patient record for ${lead.phone} with initial flow booking...`);
  return { success: true, action: 'starting_demo', lang };
}

async function escalateToHuman(lead, message) {
  console.log(`[handoff.js] Escalate to human admin for ${lead.phone}. Reason: ${message}`);
  return { success: true, action: 'escalated' };
}

async function handleReply(lead, message) {
  const intent = detectIntent(message);
  const lang = detectLanguage(message);
  console.log(`[handoff] Reply detected: ${intent} / ${lang}`);

  switch (intent) {
    case 'price_query':
      console.log(generateROIMessage(lead, lang));
      return { action: 'roi', intent };
    case 'demo_request':
      await startDemoBooking(lead, lang);
      return { action: 'demo', intent };
    case 'complaint':
      await escalateToHuman(lead, message);
      return { action: 'human', intent };
    default:
      await startDemoBooking(lead, lang); // fallback default
      return { action: 'default', intent };
  }
}

module.exports = {
  detectIntent,
  detectLanguage,
  handleReply,
  generateROIMessage,
  startDemoBooking,
  escalateToHuman
};
