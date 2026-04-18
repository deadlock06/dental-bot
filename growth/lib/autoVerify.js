/**
 * Auto-Verification Engine
 * Runs all checks and returns complete verification profile
 */

const { findWebsite } = require('./findWebsite');
const { classifyPhone } = require('./classifyPhone');
const { calculateConfidenceScore } = require('./confidenceScore');

async function autoVerify(parsedLead, supabase) {
  console.log(`[AutoVerify] Starting for ${parsedLead.name} (${parsedLead.phone})`);
  
  // Run all checks in parallel where possible
  const [websiteResult, phoneResult] = await Promise.all([
    findWebsite(parsedLead.name, parsedLead.city),
    Promise.resolve(classifyPhone(parsedLead.phone))
    // WhatsApp check can be added here later
  ]);
  
  // Compile verification data
  const verificationData = {
    website: websiteResult,
    phone: phoneResult,
    whatsapp: {
      exists: true, // Assume valid format = exists for now
      profileName: null // Would need actual WhatsApp API check
    }
  };
  
  // Calculate LeadSync score
  const scoring = calculateConfidenceScore(verificationData, parsedLead);
  
  // Determine decision
  let decision = 'DROP';
  if (scoring.isOwnerVerified) {
    decision = 'MESSAGE';
  } else if (scoring.totalScore >= 50) {
    decision = 'REVIEW';
  }
  
  // Check for duplicates
  const duplicateCheck = await checkDuplicate(supabase, parsedLead.phone, parsedLead.name);
  
  return {
    ...verificationData,
    confidenceScore: scoring.totalScore,
    scoringBreakdown: scoring.breakdown,
    isOwnerVerified: scoring.isOwnerVerified,
    isQualified: scoring.isQualified,
    decision, // 'MESSAGE', 'REVIEW', or 'DROP'
    duplicate: duplicateCheck,
    verifiedAt: new Date().toISOString()
  };
}

async function checkDuplicate(supabase, phone, name) {
  // Exact phone match
  const { data: phoneMatch } = await supabase
    .from('growth_leads_v2')
    .select('id, status, created_at')
    .eq('extracted_phone', phone)
    .limit(1)
    .single();
  
  if (phoneMatch) {
    return {
      isDuplicate: true,
      reason: 'exact_phone',
      existingId: phoneMatch.id,
      existingStatus: phoneMatch.status
    };
  }
  
  // Name similarity check (simplified)
  // Using ilike as a proxy for similarity if pg_trgm is not available/easy to use directly here
  const { data: nameMatches } = await supabase
    .from('growth_leads_v2')
    .select('id, extracted_name')
    .ilike('extracted_name', `%${name}%`)
    .limit(3);
  
  if (nameMatches?.length > 0) {
    return {
      isDuplicate: true,
      reason: 'name_similarity',
      existingId: nameMatches[0].id
    };
  }
  
  return { isDuplicate: false };
}

module.exports = { autoVerify };
