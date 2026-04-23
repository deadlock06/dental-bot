const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

function calculateFit(lead) {
  let score = 0;
  // returns 0-25
  if (lead.industry && /dental|dentist|orthodontist|clinic|health|medical/i.test(lead.industry)) score += 10;
  if (lead.google_review_count > 50) score += 10;
  else if (lead.google_review_count > 10) score += 5;
  if (lead.website) score += 5;
  return Math.min(25, score);
}

function calculatePain(lead) {
  let score = 0;
  // returns 0-35
  if (lead.google_rating && lead.google_rating < 4.0) score += 15;
  if (!lead.website || !lead.has_booking_system) score += 10;
  if (lead.has_negative_reviews) score += 10;
  
  if (lead.pain_signals && lead.pain_signals.length > 0) {
     score += (lead.pain_signals.length * 5);
  }
  return Math.min(35, score);
}

function calculateTiming(lead) {
  let score = 0;
  // returns 0-20
  if (lead.is_hiring) {
    if (lead.hiring_posted_days_ago && lead.hiring_posted_days_ago <= 14) score += 20;
    else score += 10;
  }
  if (lead.instagram_last_post_date) {
    const days = Math.floor((Date.now() - new Date(lead.instagram_last_post_date).getTime()) / 86400000);
    if (days > 60) score += 10; // Inactive social means they might need help now
  }
  if (lead.has_negative_reviews) {
    score += 10; // Recent negative reviews indicate immediate timing
  }
  return Math.min(20, score);
}

function calculateReach(lead) {
  let score = 0;
  // returns 0-20
  if (lead.phone) score += 10;
  if (lead.phone_type === 'mobile' || lead.whatsapp_detected) score += 10;
  else if (lead.email) score += 5;
  
  if (lead.instagram_handle) score += 5;
  return Math.min(20, score);
}

function calculate4DScore(lead) {
  const fit = calculateFit(lead);
  const pain = calculatePain(lead);
  const timing = calculateTiming(lead);
  const reach = calculateReach(lead);

  const total = fit + pain + timing + reach;
  
  let priority = 'skip';
  if (total >= 85) priority = 'hot';
  else if (total >= 70) priority = 'warm';
  else if (total >= 50) priority = 'cool';
  else if (total >= 30) priority = 'cold';

  return {
    total,
    priority,
    breakdown: {
      fit,
      pain,
      timing,
      reach
    }
  };
}

async function generateScoreExplanation(lead, scores) {
  try {
    const systemPrompt = `You are an AI growth analyst evaluating a lead for Qudozen (an AI business OS).
Given the lead's 4D scores and basic info, write a 2-3 sentence explanation of why they received this score and priority. Focus on the pain points and timing.
DO NOT use emojis.
Lead Info:
Name: ${lead.company_name || 'Unknown'}
Scores: Fit=${scores.breakdown.fit}/25, Pain=${scores.breakdown.pain}/35, Timing=${scores.breakdown.timing}/20, Reach=${scores.breakdown.reach}/20. Total=${scores.total}/100, Priority=${scores.priority}.
`;
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }],
      temperature: 0.7,
      max_tokens: 100
    });
    return response.choices[0].message.content.trim();
  } catch (err) {
    console.error('Failed to generate score explanation:', err.message);
    return `Score: ${scores.total}. Priority: ${scores.priority}. Based on fit, pain, timing, and reachability.`;
  }
}

module.exports = {
  calculateFit,
  calculatePain,
  calculateTiming,
  calculateReach,
  calculate4DScore,
  generateScoreExplanation
};
