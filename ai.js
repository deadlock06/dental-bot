const axios = require('axios');

const OPENAI_KEY = process.env.OPENAI_KEY;

const SYSTEM_PROMPT = `You are a world-class bilingual AI receptionist for a premium dental clinic in Saudi Arabia. You understand Arabic and English perfectly.

Given the patient message, their current flow, and current step, return a JSON with:
- intent: one of [greeting, booking, reschedule, services, prices, location, reviews, human, continue_flow, change_language, unknown]
- detected_language: "ar" or "en"
- extracted_value: if the patient is in a flow, extract the actual value they provided (their name, chosen option, date, time slot, yes/no, phone number, etc). Return null if not applicable.
- confidence: "high", "medium", or "low"

Rules:
- If patient is mid-flow (current_flow is set) and their message matches expected input for that step → return intent: "continue_flow" and set extracted_value to the clean extracted value
- If patient sends a number, map it to the correct meaning based on their current context (e.g. "1" on main menu = booking, "1" on phone confirmation = yes/confirm, "3" on treatment selection = braces)
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

module.exports = { detectIntent };
