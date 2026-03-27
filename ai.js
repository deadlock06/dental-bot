const axios = require('axios');

const OPENAI_KEY = process.env.OPENAI_KEY;

const SYSTEM_PROMPT = `You are a world-class bilingual AI receptionist for a premium dental clinic in Saudi Arabia. You understand Arabic and English perfectly.

Given the patient message, their current flow, and current step, return a JSON with:
- intent: one of [greeting, booking, my_appointment, reschedule, cancel, services, doctors, prices, location, reviews, human, continue_flow, change_language, unknown]
- detected_language: "ar" or "en"
- extracted_value: if the patient is in a flow, extract the actual value they provided (their name, chosen option, date, time slot, yes/no, phone number, etc). Return null if not applicable.
- confidence: "high", "medium", or "low"

Main menu numbering (when no active flow):
1 → booking
2 → my_appointment
3 → reschedule
4 → cancel
5 → services
6 → doctors
7 → prices
8 → location
9 → reviews
10 → human

Rules:
- If patient is mid-flow (current_flow is set) and their message matches expected input for that step → return intent: "continue_flow" and set extracted_value to the clean extracted value
- If patient sends a number with no active flow, map it using the menu numbering above
- If patient sends natural language mid-flow, extract the value intelligently (e.g. "my name is Ahmed" → extracted_value: "Ahmed")
- Understand dates in Arabic and English: tomorrow/غداً, Monday/الاثنين, April 15/15 أبريل — normalise to English
- Understand time in Arabic and English: "9 AM" / "9 صباحاً" / "التاسعة" → extracted_value: "9:00 AM"
- Never confuse a name input (step 1 of booking) with a menu selection
- If patient changes topic mid-flow (e.g. asks for prices while booking), detect the new intent
- For confirmations (yes/no): extracted_value should be "yes" or "no"
- For treatment selection: extracted_value should be the treatment name in English
- Return ONLY valid JSON, no extra text`;

async function detectIntent(messageText, currentFlow = null, currentStep = 0) {
  const contextMsg = currentFlow
    ? `Current flow: ${currentFlow}, Current step: ${currentStep}\nPatient message: ${messageText}`
    : `No active flow (patient is on main menu)\nPatient message: ${messageText}`;

  try {
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: contextMsg }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const content = res.data.choices[0].message.content;
    const parsed = JSON.parse(content);
    console.log(`[AI] msg="${messageText}" flow=${currentFlow} step=${currentStep} → intent=${parsed.intent} extracted="${parsed.extracted_value}" conf=${parsed.confidence}`);
    return {
      intent: parsed.intent || 'unknown',
      detected_language: parsed.detected_language || 'en',
      extracted_value: parsed.extracted_value ?? null,
      confidence: parsed.confidence || 'low'
    };
  } catch (err) {
    console.error('detectIntent error:', err.response?.data || err.message);
    return { intent: 'unknown', detected_language: 'en', extracted_value: null, confidence: 'low' };
  }
}

async function extractDate(text) {
  try {
    const today = new Date().toDateString();
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [{
          role: 'user',
          content: `Today is ${today}. Extract the appointment date from this text. Return ONLY a clean date string like "April 20, 2026" or "Monday April 21, 2026". Use today as reference for relative dates like "tomorrow" or "next Monday". If no clear date found, return the original text unchanged. Text: ${text}`
        }]
      },
      { headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' } }
    );
    const result = res.data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
    console.log(`[AI] extractDate: "${text}" → "${result}"`);
    return result;
  } catch (err) {
    console.error('extractDate error:', err.response?.data || err.message);
    return text;
  }
}

async function extractTimeSlot(text, slots) {
  try {
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [{
          role: 'user',
          content: `Available time slots: ${slots.join(', ')}. Match this time request to the closest available slot. Return ONLY the exact slot string from the list, nothing else. Time request: "${text}"`
        }]
      },
      { headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' } }
    );
    const result = res.data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
    console.log(`[AI] extractTimeSlot: "${text}" → "${result}"`);
    return slots.includes(result) ? result : null;
  } catch (err) {
    console.error('extractTimeSlot error:', err.response?.data || err.message);
    return null;
  }
}

module.exports = { detectIntent, extractDate, extractTimeSlot };
