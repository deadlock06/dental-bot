/**
 * Deduplication Engine
 * Prevents messaging same clinic multiple times
 */

/**
 * Check for duplicate leads
 * @param {Object} supabase - Supabase client
 * @param {string} phone - Normalized phone
 * @param {string} name - Business name
 * @param {string} city - City
 */
async function checkDuplicate(supabase, phone, name, city) {
  // Priority 1: Exact phone match (strongest signal)
  const { data: phoneMatch, error: phoneError } = await supabase
    .from('growth_leads_v2')
    .select('id, name, status, created_at, message_sent_at')
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (phoneMatch) {
    return {
      isDuplicate: true,
      confidence: 1.0,
      reason: 'exact_phone_match',
      existingId: phoneMatch.id,
      existingName: phoneMatch.name,
      existingStatus: phoneMatch.status,
      lastContact: phoneMatch.message_sent_at,
      action: getDuplicateAction(phoneMatch.status)
    };
  }
  
  // Priority 2: Name + city match (fuzzy-ish via ilike)
  const { data: nameMatches, error: nameError } = await supabase
    .from('growth_leads_v2')
    .select('id, name, phone, status, created_at')
    .eq('city', city)
    .ilike('name', `%${name.replace(/\s+/g, '%')}%`)
    .limit(5);
  
  if (nameMatches && nameMatches.length > 0) {
    // Calculate similarity
    for (const match of nameMatches) {
      const similarity = calculateNameSimilarity(name, match.name);
      
      if (similarity > 0.85) {
        return {
          isDuplicate: true,
          confidence: similarity,
          reason: 'high_name_similarity_same_city',
          existingId: match.id,
          existingName: match.name,
          existingPhone: match.phone,
          existingStatus: match.status,
          similarity: Math.round(similarity * 100) + '%',
          action: getDuplicateAction(match.status)
        };
      }
    }
  }
  
  return {
    isDuplicate: false,
    confidence: 0,
    reason: 'no_match_found'
  };
}

/**
 * Calculate string similarity (Jaccard index on character bigrams)
 */
function calculateNameSimilarity(a, b) {
  if (!a || !b) return 0;
  
  const normalize = (str) => str
    .toLowerCase()
    .replace(/[^\w\u0600-\u06FF]/g, '')
    .replace(/عيادة|clinic|dental|مستشفى|hospital/g, '');
  
  const cleanA = normalize(a);
  const cleanB = normalize(b);
  
  if (cleanA === cleanB) return 1.0;
  if (cleanA.length < 3 || cleanB.length < 3) return 0;
  
  // Character bigram similarity
  const getBigrams = (str) => {
    const bigrams = new Set();
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.add(str.substring(i, i + 2));
    }
    return bigrams;
  };
  
  const bigramsA = getBigrams(cleanA);
  const bigramsB = getBigrams(cleanB);
  
  const intersection = new Set([...bigramsA].filter(x => bigramsB.has(x)));
  const union = new Set([...bigramsA, ...bigramsB]);
  
  return intersection.size / union.size;
}

/**
 * Determine action based on existing lead status
 */
function getDuplicateAction(status) {
  const actions = {
    'pending': 'skip_pending',
    'verifying': 'skip_processing',
    'verified_owner': 'skip_qualified',
    'needs_review': 'review_together',
    'messaged': 'wait_for_reply',
    'replied': 'handoff_active',
    'handed_off': 'handoff_active',
    'customer': 'upsell_opportunity',
    'dropped': 'reconsider_if_new_info'
  };
  
  return actions[status] || 'review_manual';
}

/**
 * Merge data from multiple sources for same clinic
 */
async function mergeLeadData(supabase, existingId, newData) {
  const { data: existing } = await supabase
    .from('growth_leads_v2')
    .select('*')
    .eq('id', existingId)
    .single();
  
  if (!existing) return null;
  
  // Merge sources array
  const mergedSources = [...new Set([
    ...(existing.sources || []),
    ...(newData.sources || ['manual'])
  ])];
  
  // Update with richer data if available
  const updates = {
    sources: mergedSources,
    updated_at: new Date().toISOString()
  };
  
  if (!existing.website_found && newData.website_found) {
    updates.website_found = true;
    updates.website_url = newData.website_url;
  }
  
  if (!existing.linkedin_found && newData.linkedin_found) {
    updates.linkedin_found = true;
    updates.linkedin_owner_name = newData.linkedin_owner_name;
  }
  
  // Recalculate confidence with merged data could go here...
  
  const { data: updated } = await supabase
    .from('growth_leads_v2')
    .update(updates)
    .eq('id', existingId)
    .select()
    .single();
  
  return updated;
}

module.exports = {
  checkDuplicate,
  calculateNameSimilarity,
  mergeLeadData
};
