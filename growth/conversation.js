// ═══════════════════════════════════════════════════════════════
// conversation.js — Growth Swarm 3.0: LLM Conversation Engine
// Brain Step 6: Intent Classification & AI Response Generation
// ═══════════════════════════════════════════════════════════════

require('dotenv').config();
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });
const { getGhostRoomUrl, detectLanguage } = require('./brain');

/**
 * Classify the intent of the incoming message.
 * Returns: 'ENGAGED' | 'OBJECTION' | 'HANDED_OFF' | 'OPT_OUT'
 */
async function classifyIntent(messageText, history = []) {
  try {
    const historyText = history.map(h => `${h.direction === 'inbound' ? 'Lead' : 'Jake'}: ${h.message_text}`).join('\n');
    
    const systemPrompt = `You are a conversation intent classifier for a cold outreach campaign.
We sent an initial WhatsApp message offering an AI automation system (Qudozen) to a clinic owner.

Analyze the lead's latest message and classify their intent into exactly ONE of these categories:
1. OPT_OUT: They explicitly asked to stop, remove them, or said they are not interested in ANY way (e.g. "stop", "no thanks", "not interested", "unsubscribe", "لا شكرا").
2. HANDED_OFF: They want to book a call, speak to a human, asked for our phone number, or agreed to a meeting (e.g. "call me", "how do we start", "send pricing", "let's talk").
3. OBJECTION: They raised a specific objection or doubt (e.g. "AI doesn't work for dental", "my receptionists are fine", "is this real?", "you're a bot").
4. ENGAGED: They asked a question about the product, asked who we are, or gave a general non-committal reply (e.g. "who is this?", "what is qudozen?", "how does it work?").

Respond ONLY with the category name (e.g., ENGAGED). No other text.`;

    const userPrompt = `History:\n${historyText}\n\nLead's Latest Message: "${messageText}"\n\nIntent:`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: 10
    });

    const intent = response.choices[0].message.content.trim().toUpperCase();
    console.log(`[conversation] 🧠 Intent Classified: ${intent} for message: "${messageText}"`);
    
    if (['OPT_OUT', 'HANDED_OFF', 'OBJECTION', 'ENGAGED'].includes(intent)) {
      return intent;
    }
    return 'ENGAGED'; // Fallback

  } catch (err) {
    console.error('[conversation] ❌ Intent classification failed:', err.message);
    return 'ENGAGED'; // Fallback to engaged so we don't drop them
  }
}

/**
 * Generate a contextual response as Jake based on the conversation so far.
 */
async function generateResponse(lead, messageText, history = [], intent) {
  try {
    const lang = detectLanguage(lead);
    const url = getGhostRoomUrl(lead);
    
    const historyText = history.map(h => `${h.direction === 'inbound' ? 'Lead' : 'Jake'}: ${h.message_text}`).join('\n');
    
    const company = lead.company_name || 'your clinic';
    const owner = lead.owner_name || 'Doctor';

    const systemPrompt = `You are Jake, an AI growth consultant for Qudozen (an AI business OS).
You are texting the owner of ${company} (${owner}) via WhatsApp.

CONTEXT:
- You previously sent a cold message about how missed WhatsApp replies cost them patients.
- The lead replied with intent: ${intent}.
- Your goal is to keep them engaged, answer their question naturally, and softly point them to the demo link.

COMMON OBJECTIONS & HOW TO HANDLE THEM:
- "AI doesn't work / sounds robotic": "That's why we don't use standard chatbots. Qudozen uses an 'Illusion Architecture' — patients actually think they are talking to a human receptionist. It handles bookings naturally."
- "Too expensive": "It costs less than half of a receptionist's salary, works 24/7, never takes sick days, and pays for itself with the first 2 patients it saves from going to a competitor."
- "My receptionists are fine": "I'm sure they are great! But even the best receptionist can't reply to a WhatsApp message at 2 AM on a Friday. That's when you lose patients."
- "Who are you?": "I'm Jake, I build AI systems for clinics. I noticed your clinic was losing patients to competitors due to response times, so I reached out."

RULES:
1. MUST be extremely short (under 40 words). No long paragraphs.
2. MUST sound like a real human texting (casual, direct, no emojis except maybe one).
3. Do NOT be overly polite or use corporate speak ("Dear Doctor", "Thank you for your response"). Start immediately with the answer.
4. If they raised an objection, address it directly using the logic above but rewrite it naturally.
5. Language: ${lang === 'ar' ? 'Arabic (Saudi dialect, casual professional)' : 'English'}
6. Always include this link at the end if they seem interested or need proof: ${url}
7. DO NOT say "Here is the link:". Just append it naturally.

Generate your reply now.`;

    const userPrompt = `History:\n${historyText}\n\nLead's Latest Message: "${messageText}"\n\nJake's Reply:`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 150
    });

    const reply = response.choices[0].message.content.trim();
    console.log(`[conversation] 🧠 Generated reply for ${company}:\n${reply}`);
    return reply;

  } catch (err) {
    console.error('[conversation] ❌ Response generation failed:', err.message);
    const lang = detectLanguage(lead);
    return lang === 'ar' 
      ? 'سأكون متاحاً لمناقشة هذا الأمر قريباً. هل جربت الديمو؟ ' + getGhostRoomUrl(lead)
      : 'I’ll be available to discuss this shortly. Have you tried the demo? ' + getGhostRoomUrl(lead);
  }
}

module.exports = {
  classifyIntent,
  generateResponse
};
