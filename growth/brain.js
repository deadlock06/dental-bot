const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

function buildGhostRoomUrl(lead) {
  const base = (process.env.BASE_URL || '').replace(/\/$/, '');
  if (!base) return '';

  // Strip the "whatsapp:" prefix so the link uses a plain phone number
  const phone = (process.env.TWILIO_WHATSAPP_FROM || '').replace(/^whatsapp:/i, '');

  const qs = new URLSearchParams({
    name:   lead.name          || '',
    clinic: lead.business_name || '',
    city:   lead.city          || '',
    pain:   lead.pain_signal   || 'default',
    phone:  phone
  });

  return `${base}/growth/room?${qs.toString()}`;
}

async function generateMessage(lead) {
  const prompt = `You write outreach messages for a dental AI receptionist company.
Write ONE sentence only. Mention their specific situation.
No links. End with a question. Sign with -Jake at the end.
Max 300 characters. Sound human, not robotic.

LEAD: ${lead.name} at ${lead.business_name}
PAIN: ${lead.pain_details || lead.pain_signal}
CITY: ${lead.city}

Write ONLY the message text. No explanations.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 150
  });

  const aiMessage = response.choices[0].message.content.trim();

  const ghostRoomUrl = buildGhostRoomUrl(lead);
  if (ghostRoomUrl) {
    return `${aiMessage}\n\n${ghostRoomUrl}`;
  }

  return aiMessage;
}

module.exports = { generateMessage };

// Test if run directly: node growth/brain.js
if (require.main === module) {
  generateMessage({
    name: 'Dr. Ahmed',
    business_name: 'Al Noor Dental',
    pain_signal: 'is_hiring',
    pain_details: 'Hiring a receptionist on Indeed',
    city: 'Jazan'
  }).then(msg => {
    console.log('\n--- Generated message ---');
    console.log(msg);
    console.log('-------------------------\n');
  });
}
