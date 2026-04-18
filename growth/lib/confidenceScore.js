/**
 * LeadSync Scoring Algorithm
 * 0-100 score: Fit + Pain + Timing + Reachability
 */

function calculateConfidenceScore(verificationData, parsedLead) {
  let fitScore = 0;        // 0-25
  let painScore = 0;       // 0-35
  let timingScore = 0;     // 0-20
  let reachabilityScore = 0; // 0-20
  
  // ========== FIT (25 points) ==========
  
  // Location is specific Saudi city (10)
  if (parsedLead.city && parsedLead.city !== 'Unknown') {
    fitScore += 10;
  }
  
  // Business type is dental clinic (10)
  if (/dental|عيادة|clinic/i.test(parsedLead.name)) {
    fitScore += 10;
  }
  
  // Name appears to be real business (5)
  if (parsedLead.name.length > 5 && parsedLead.name.length < 40) {
    fitScore += 5;
  }
  
  // ========== PAIN (35 points) ==========
  
  // Website found with owner name (15)
  if (verificationData.website?.found) {
    painScore += 10;
    if (verificationData.website.ownerName) {
      painScore += 5;
    }
  }
  
  // Pain hints from input (15)
  if (parsedLead.painHints?.includes('hiring_receptionist')) {
    painScore += 15; // Highest value signal
  } else if (parsedLead.painHints?.includes('bad_reviews')) {
    painScore += 12;
  } else if (parsedLead.painHints?.includes('missed_calls')) {
    painScore += 10;
  } else if (parsedLead.painHints?.includes('no_booking_system')) {
    painScore += 8;
  }
  
  // No website = operational pain (5)
  if (!verificationData.website?.found) {
    painScore += 5;
  }
  
  // ========== TIMING (20 points) ==========
  
  // Mobile phone = can reach now (15)
  if (verificationData.phone?.isMobile) {
    timingScore += 15;
  } else if (verificationData.phone?.isLandline) {
    timingScore += 5; // Can call during hours
  }
  
  // WhatsApp active (5)
  if (verificationData.whatsapp?.exists) {
    timingScore += 5;
  }
  
  // ========== REACHABILITY (20 points) ==========
  
  // Mobile = direct owner access (12)
  if (verificationData.phone?.isPersonal) {
    reachabilityScore += 12;
  }
  
  // Multiple contact methods found (8)
  let contactMethods = 0;
  if (verificationData.phone?.isMobile) contactMethods++;
  if (verificationData.website?.emails?.length > 0) contactMethods++;
  if (verificationData.whatsapp?.exists) contactMethods++;
  if (verificationData.website?.found) contactMethods++;
  
  reachabilityScore += Math.min(contactMethods * 2, 8);
  
  // ========== TOTAL ==========
  
  const totalScore = fitScore + painScore + timingScore + reachabilityScore;
  
  return {
    fitScore,
    painScore,
    timingScore,
    reachabilityScore,
    totalScore: Math.min(totalScore, 100),
    isQualified: totalScore >= 70,
    isOwnerVerified: totalScore >= 70 && verificationData.phone?.isPersonal,
    breakdown: {
      fit: `${fitScore}/25`,
      pain: `${painScore}/35`,
      timing: `${timingScore}/20`,
      reachability: `${reachabilityScore}/20`
    }
  };
}

module.exports = { calculateConfidenceScore };
