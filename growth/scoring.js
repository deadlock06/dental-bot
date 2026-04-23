// ═══════════════════════════════════════════════════════════════
// scoring.js — Growth Swarm 3.0: 4D Scoring Engine
// Brain Step 4: Fit, Pain, Timing, Reachability (4D)
// ═══════════════════════════════════════════════════════════════

const { detectPainSignals } = require('./finder');

// ─────────────────────────────────────────────
// 1. FIT SCORE (0-100)
// How well does this lead match our ideal customer profile (ICP)?
// ─────────────────────────────────────────────

function calculateFitScore(lead, campaignTarget = {}) {
  let score = 0;
  const reasons = [];

  // Industry match
  if (lead.industry) {
    const isDental = /dental|dentist|orthodontist|clinic|health|medical/i.test(lead.industry);
    if (isDental) {
      score += 40;
      reasons.push('+40: Exact industry match (Dental/Medical)');
    } else if (campaignTarget.target_industry && new RegExp(campaignTarget.target_industry, 'i').test(lead.industry)) {
      score += 30;
      reasons.push(`+30: Campaign target industry match (${campaignTarget.target_industry})`);
    } else {
      score += 10;
      reasons.push('+10: Generic local business');
    }
  }

  // City match
  if (lead.city && campaignTarget.target_city) {
    if (new RegExp(campaignTarget.target_city, 'i').test(lead.city)) {
      score += 20;
      reasons.push(`+20: Target city match (${lead.city})`);
    }
  } else if (lead.city) {
    score += 10; // Better than no city
  }

  // Size/Maturity proxy (Review count)
  if (lead.google_review_count > 100) {
    score += 30;
    reasons.push('+30: Established business (>100 reviews)');
  } else if (lead.google_review_count > 20) {
    score += 20;
    reasons.push('+20: Growing business (20-100 reviews)');
  } else if (lead.google_review_count > 0) {
    score += 10;
    reasons.push('+10: New/Small business (<20 reviews)');
  }

  // Website quality proxy
  if (lead.website && lead.domain) {
    score += 10;
    reasons.push('+10: Has dedicated domain');
  }

  score = Math.min(100, score);
  return { score, reasons };
}

// ─────────────────────────────────────────────
// 2. TIMING SCORE (0-100)
// Is this a good time to reach out? (Change events, hiring, etc)
// ─────────────────────────────────────────────

function calculateTimingScore(lead) {
  let score = 0;
  const reasons = [];

  // Hiring indicates budget and operational focus
  if (lead.is_hiring) {
    const daysAgo = lead.hiring_posted_days_ago || 999;
    if (daysAgo <= 7) {
      score += 50;
      reasons.push(`+50: Highly active (hiring posted ${daysAgo} days ago)`);
    } else if (daysAgo <= 30) {
      score += 30;
      reasons.push(`+30: Recently hiring (posted ${daysAgo} days ago)`);
    } else {
      score += 15;
      reasons.push('+15: History of hiring');
    }

    if (lead.hiring_roles && lead.hiring_roles.some(r => /receptionist|front desk|admin|manager/i.test(r))) {
      score += 40;
      reasons.push('+40: Hiring front-desk/admin (perfect trigger for AI agent)');
    }
  }

  // Recent negative reviews (immediate pain)
  if (lead.has_negative_reviews) {
    score += 30;
    reasons.push('+30: Experiencing immediate pain (recent bad reviews)');
  }

  score = Math.min(100, score);
  return { score, reasons };
}

// ─────────────────────────────────────────────
// 3. REACHABILITY SCORE (0-100)
// How many channels do we have to contact them?
// ─────────────────────────────────────────────

function calculateReachabilityScore(lead) {
  let score = 0;
  const reasons = [];

  if (lead.phone) {
    score += 30;
    reasons.push('+30: Has phone number');
    if (lead.phone_type === 'mobile' || lead.whatsapp_detected) {
      score += 40;
      reasons.push('+40: Mobile/WhatsApp detected (direct access)');
    }
  }

  if (lead.email) {
    score += 20;
    reasons.push('+20: Has email address');
  }

  if (lead.instagram_handle) {
    score += 10;
    reasons.push('+10: Has Instagram handle (DM potential)');
  }

  score = Math.min(100, score);
  return { score, reasons };
}

// ─────────────────────────────────────────────
// 4D SCORING ENGINE ENTRY POINT
// Computes all 4 dimensions and returns the final aggregate
// ─────────────────────────────────────────────

function compute4DScore(lead, campaignTarget = {}) {
  const fit = calculateFitScore(lead, campaignTarget);
  const timing = calculateTimingScore(lead);
  const reachability = calculateReachabilityScore(lead);
  
  // Pain score was built in Step 3 (finder.js)
  const pain = detectPainSignals(lead);

  const totalScore = fit.score + timing.score + reachability.score + pain.pain_score;
  const maxPossible = 400; // 100 per dimension
  
  const normalizedTotal = Math.round((totalScore / maxPossible) * 100);

  // Combine top reasons for the score explanation
  let topReason = 'No clear signal';
  if (pain.top_signal) {
    topReason = `Pain: ${pain.top_signal}`;
  } else if (timing.reasons.length > 0) {
    topReason = timing.reasons[0].split(': ')[1] || timing.reasons[0];
  } else if (fit.reasons.length > 0) {
    topReason = fit.reasons[0].split(': ')[1] || fit.reasons[0];
  }

  return {
    dimensions: {
      fit: fit.score,
      pain: pain.pain_score,
      timing: timing.score,
      reachability: reachability.score
    },
    raw_total: totalScore,
    score_100: normalizedTotal, // 0-100 scale
    priority: determinePriority(normalizedTotal),
    explanation: `${normalizedTotal}/100. ${topReason}.`,
    details: {
      fit_reasons: fit.reasons,
      timing_reasons: timing.reasons,
      reachability_reasons: reachability.reasons,
      pain_signals: pain.signals
    }
  };
}

function determinePriority(score100) {
  if (score100 >= 75) return 'hot';
  if (score100 >= 50) return 'warm';
  if (score100 >= 30) return 'cool';
  return 'cold';
}

module.exports = {
  calculateFitScore,
  calculateTimingScore,
  calculateReachabilityScore,
  compute4DScore,
  determinePriority
};
