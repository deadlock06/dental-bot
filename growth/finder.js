// ═══════════════════════════════════════════════════════════════
// finder.js — Growth Swarm 3.0 Lead Discovery + Pain Intelligence
// Brain Step 3: Pain signal detection, deduplication, DB persistence
// ═══════════════════════════════════════════════════════════════

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// NOTE: scoring.js is required lazily inside functions to avoid circular dependency.
// (finder.js ← scoring.js ← finder.js cycle is broken by deferring the require)

// ─────────────────────────────────────────────
// Phone Normalization (Saudi Arabia)
// ─────────────────────────────────────────────

function normalizePhone(raw) {
  if (!raw) return null;
  let cleaned = raw.replace(/[^\d+]/g, '');

  if (cleaned.startsWith('+966')) return cleaned;
  if (cleaned.startsWith('966'))  return '+' + cleaned;
  if (cleaned.startsWith('0'))    return '+966' + cleaned.substring(1);
  if (cleaned.startsWith('5'))    return '+966' + cleaned;

  return null;
}

function isSaudiMobile(phone) {
  if (!phone) return false;
  const digits = phone.replace('+966', '');
  const prefix = digits.substring(0, 2);
  return ['50', '51', '53', '54', '55', '56', '58', '59'].includes(prefix);
}

// ─────────────────────────────────────────────
// PAIN SIGNAL DETECTION ENGINE
// Scans lead data for indicators that the business
// is struggling and would benefit from Qudozen.
// Returns { signals: [], pain_score: 0-100 }
// ─────────────────────────────────────────────

function detectPainSignals(lead) {
  try {
    const signals = [];
    let painScore = 0;

    // ── Signal 1: Low Google rating (<4.0) ──
    // A clinic with bad reviews is losing patients daily.
    // They KNOW they have a problem. High receptivity.
    if (lead.google_rating !== null && lead.google_rating !== undefined) {
      if (lead.google_rating < 3.5) {
        signals.push({
          type: 'low_google_rating_critical',
          severity: 'critical',
          detail: `Google rating ${lead.google_rating}/5 — patients actively avoiding`,
          score_contribution: 35
        });
        painScore += 35;
      } else if (lead.google_rating < 4.0) {
        signals.push({
          type: 'low_google_rating',
          severity: 'high',
          detail: `Google rating ${lead.google_rating}/5 — below competitive threshold`,
          score_contribution: 25
        });
        painScore += 25;
      }
    }

    // ── Signal 2: Few reviews (low visibility) ──
    // Even if rating is OK, few reviews = invisible on Google Maps.
    if (lead.google_review_count !== null && lead.google_review_count !== undefined) {
      if (lead.google_review_count < 10) {
        signals.push({
          type: 'low_review_count',
          severity: 'medium',
          detail: `Only ${lead.google_review_count} Google reviews — low social proof`,
          score_contribution: 15
        });
        painScore += 15;
      }
    }

    // ── Signal 3: No website ──
    // No online presence = missing 70% of potential patients.
    if (!lead.website || lead.website.trim() === '') {
      signals.push({
        type: 'no_website',
        severity: 'high',
        detail: 'No website detected — invisible to online searchers',
        score_contribution: 20
      });
      painScore += 20;
    }

    // ── Signal 4: No booking system on website ──
    // Has website but no way to book online = friction.
    if (lead.website && !lead.has_booking_system) {
      signals.push({
        type: 'no_booking_system',
        severity: 'high',
        detail: 'Website exists but no online booking — losing convenience-driven patients',
        score_contribution: 25
      });
      painScore += 25;
    }

    // ── Signal 5: Is actively hiring ──
    // Hiring = growing or replacing staff. Either way, they
    // have budget and are investing in operations.
    if (lead.is_hiring) {
      const daysAgo = lead.hiring_posted_days_ago || 999;
      if (daysAgo <= 14) {
        signals.push({
          type: 'actively_hiring_recent',
          severity: 'high',
          detail: `Hiring ${(lead.hiring_roles || []).join(', ')} — posted ${daysAgo} days ago`,
          score_contribution: 30
        });
        painScore += 30;
      } else if (daysAgo <= 60) {
        signals.push({
          type: 'hiring',
          severity: 'medium',
          detail: `Hiring ${(lead.hiring_roles || []).join(', ')} — posted ${daysAgo} days ago`,
          score_contribution: 15
        });
        painScore += 15;
      }
    }

    // ── Signal 6: Negative review themes ──
    // Specific complaints about wait times, no-shows, or communication
    // are exactly what Qudozen solves.
    if (lead.has_negative_reviews && lead.negative_review_themes && lead.negative_review_themes.length > 0) {
      const qudozenRelevant = ['wait_time', 'no_response', 'scheduling', 'no_show', 'communication', 'cancellation'];
      const matching = lead.negative_review_themes.filter(t => qudozenRelevant.includes(t));

      if (matching.length > 0) {
        signals.push({
          type: 'negative_reviews_relevant',
          severity: 'critical',
          detail: `Complaints about: ${matching.join(', ')} — Qudozen solves these directly`,
          score_contribution: 30
        });
        painScore += 30;
      } else {
        signals.push({
          type: 'negative_reviews_general',
          severity: 'medium',
          detail: `Negative themes: ${lead.negative_review_themes.join(', ')}`,
          score_contribution: 10
        });
        painScore += 10;
      }
    }

    // ── Signal 7: Instagram inactive (>60 days) ──
    // Abandoned social = no marketing effort. Easy sell for automation.
    if (lead.instagram_handle && lead.instagram_last_post_date) {
      const lastPost = new Date(lead.instagram_last_post_date);
      const daysSincePost = Math.floor((Date.now() - lastPost.getTime()) / (1000 * 60 * 60 * 24));

      if (daysSincePost > 180) {
        signals.push({
          type: 'instagram_abandoned',
          severity: 'high',
          detail: `Instagram inactive for ${daysSincePost} days — abandoned marketing`,
          score_contribution: 20
        });
        painScore += 20;
      } else if (daysSincePost > 60) {
        signals.push({
          type: 'instagram_inactive',
          severity: 'medium',
          detail: `Instagram inactive for ${daysSincePost} days — inconsistent presence`,
          score_contribution: 10
        });
        painScore += 10;
      }
    } else if (lead.instagram_handle === null || lead.instagram_handle === '') {
      // No Instagram at all
      signals.push({
        type: 'no_instagram',
        severity: 'low',
        detail: 'No Instagram presence detected',
        score_contribution: 5
      });
      painScore += 5;
    }

    // Cap at 100
    painScore = Math.min(100, painScore);

    console.log(`[finder] Pain signals for "${lead.company_name}": ${signals.length} signals, score: ${painScore}/100`);

    return {
      signals,
      pain_score: painScore,
      signal_count: signals.length,
      has_critical: signals.some(s => s.severity === 'critical'),
      top_signal: signals.length > 0
        ? signals.sort((a, b) => b.score_contribution - a.score_contribution)[0].type
        : null
    };
  } catch (err) {
    console.error(`[finder] ❌ Pain detection failed for "${lead.company_name}":`, err.message);
    return { signals: [], pain_score: 0, signal_count: 0, has_critical: false, top_signal: null };
  }
}

// ─────────────────────────────────────────────
// LEAD DEDUPLICATION
// Removes duplicates by phone number or domain.
// Keeps the lead with the most data (highest field count).
// ─────────────────────────────────────────────

function deduplicateLeads(leads) {
  try {
    if (!Array.isArray(leads) || leads.length === 0) return [];

    const phoneMap = new Map();
    const domainMap = new Map();
    const deduped = [];

    for (const lead of leads) {
      // Normalize phone for comparison
      const phone = normalizePhone(lead.phone);
      const domain = lead.domain ? lead.domain.toLowerCase().replace(/^www\./, '') : null;

      // Count non-null fields as a quality metric
      const fieldCount = Object.values(lead).filter(v => v !== null && v !== undefined && v !== '').length;

      // Check phone duplicate
      if (phone) {
        const existing = phoneMap.get(phone);
        if (existing) {
          const existingFieldCount = Object.values(existing).filter(v => v !== null && v !== undefined && v !== '').length;
          if (fieldCount > existingFieldCount) {
            // Replace with richer lead
            phoneMap.set(phone, { ...lead, phone });
          }
          continue; // Skip duplicate
        }
        phoneMap.set(phone, { ...lead, phone });
      }

      // Check domain duplicate (only if phone didn't catch it)
      if (domain && !phone) {
        const existing = domainMap.get(domain);
        if (existing) {
          const existingFieldCount = Object.values(existing).filter(v => v !== null && v !== undefined && v !== '').length;
          if (fieldCount > existingFieldCount) {
            domainMap.set(domain, lead);
          }
          continue;
        }
        domainMap.set(domain, lead);
      }
    }

    // Merge phone-based and domain-based unique leads
    const phoneLeads = Array.from(phoneMap.values());
    const domainLeads = Array.from(domainMap.values());

    // Combine, avoiding domain duplicates already covered by phone
    const allPhones = new Set(phoneLeads.map(l => l.phone).filter(Boolean));
    for (const dLead of domainLeads) {
      if (!dLead.phone || !allPhones.has(dLead.phone)) {
        deduped.push(dLead);
      }
    }
    deduped.unshift(...phoneLeads);

    console.log(`[finder] Deduplication: ${leads.length} → ${deduped.length} leads (${leads.length - deduped.length} duplicates removed)`);
    return deduped;
  } catch (err) {
    console.error('[finder] ❌ Deduplication failed:', err.message);
    return leads; // Return original on error, don't lose data
  }
}

// ─────────────────────────────────────────────
// SAVE LEAD TO DATABASE
// Inserts into gs_leads with pain signals + scoring.
// Uses upsert on phone to prevent duplicates.
// Returns the saved lead row or null on failure.
// ─────────────────────────────────────────────

async function saveLeadToDB(lead) {
  try {
    // Lazy require to avoid circular dependency (finder → scoring → finder)
    const { compute4DScore } = require('./scoring');

    // Run 4D scoring
    const scoreResult = compute4DScore(lead);

    // Extract domain from website if not provided
    let domain = lead.domain || null;
    if (!domain && lead.website) {
      try {
        const url = new URL(lead.website.startsWith('http') ? lead.website : `https://${lead.website}`);
        domain = url.hostname.replace(/^www\./, '');
      } catch {
        domain = null;
      }
    }

    // Normalize phone
    const phone = normalizePhone(lead.phone);
    if (!phone) {
      console.warn(`[finder] ⚠️ Skipping lead "${lead.company_name}" — invalid phone`);
      return null;
    }

    const row = {
      campaign_id: lead.campaign_id || null,
      source: lead.source || 'unknown',
      company_name: lead.company_name,
      owner_name: lead.owner_name || null,
      phone,
      phone_type: lead.phone_type || null,
      whatsapp_detected: lead.whatsapp_detected || false,
      email: lead.email || null,
      website: lead.website || null,
      domain,
      address: lead.address || null,
      city: lead.city || null,
      state: lead.state || null,
      country: lead.country || 'SA',
      google_rating: lead.google_rating || null,
      google_review_count: lead.google_review_count || null,
      industry: lead.industry || null,
      employee_count: lead.employee_count || null,
      pain_signals: scoreResult.details.pain_signals,
      is_hiring: lead.is_hiring || false,
      hiring_roles: lead.hiring_roles || null,
      hiring_posted_days_ago: lead.hiring_posted_days_ago || null,
      has_negative_reviews: lead.has_negative_reviews || false,
      negative_review_themes: lead.negative_review_themes || null,
      has_booking_system: lead.has_booking_system || false,
      website_last_updated: lead.website_last_updated || null,
      instagram_handle: lead.instagram_handle || null,
      instagram_last_post_date: lead.instagram_last_post_date || null,
      facebook_page: lead.facebook_page || null,
      fit_score: scoreResult.dimensions.fit,
      pain_score: scoreResult.dimensions.pain,
      timing_score: scoreResult.dimensions.timing,
      reachability_score: scoreResult.dimensions.reachability,
      total_score: scoreResult.score_100,
      score_explanation: scoreResult.explanation,
      priority: scoreResult.priority,
      status: 'new',
      approval_status: 'pending',
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('gs_leads')
      .upsert(row, { onConflict: 'phone', ignoreDuplicates: false })
      .select()
      .single();

    if (error) {
      console.error(`[finder] ❌ DB insert failed for "${lead.company_name}":`, error.message);
      return null;
    }

    console.log(`[finder] ✅ Saved lead "${lead.company_name}" — 4D Score: ${scoreResult.score_100}/100, Priority: ${scoreResult.priority}`);
    return data;
  } catch (err) {
    console.error(`[finder] ❌ saveLeadToDB failed for "${lead.company_name}":`, err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// BATCH SAVE — Process array of leads
// Deduplicates, detects pain, saves to DB
// Returns { saved: number, skipped: number, errors: number }
// ─────────────────────────────────────────────

async function batchSaveLeads(leads, campaignId = null) {
  try {
    const deduped = deduplicateLeads(leads);
    let saved = 0;
    let skipped = 0;
    let errors = 0;

    for (const lead of deduped) {
      if (campaignId) lead.campaign_id = campaignId;

      const result = await saveLeadToDB(lead);
      if (result) {
        saved++;
      } else if (!normalizePhone(lead.phone)) {
        skipped++;
      } else {
        errors++;
      }
    }

    console.log(`[finder] Batch complete: ${saved} saved, ${skipped} skipped, ${errors} errors (from ${leads.length} input)`);
    return { saved, skipped, errors, total_input: leads.length, deduplicated_to: deduped.length };
  } catch (err) {
    console.error('[finder] ❌ Batch save failed:', err.message);
    return { saved: 0, skipped: 0, errors: leads.length, total_input: leads.length, deduplicated_to: 0 };
  }
}

// ─────────────────────────────────────────────
// PRIORITY DETERMINATION
// (Moved to scoring.js)
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// LEGACY — Google Maps text parser (kept for backwards compat)
// ─────────────────────────────────────────────

function parseGoogleMapsText(rawText) {
  try {
    const leads = [];
    const lines = rawText.split('\n').filter(l => l.trim());

    for (const line of lines) {
      const phoneMatch = line.match(/(\+?966\d{9}|0\d{9}|5\d{8})/);
      if (phoneMatch) {
        const normalized = normalizePhone(phoneMatch[0]);
        if (normalized && isSaudiMobile(normalized)) {
          leads.push({
            phone: normalized,
            company_name: line.split(phoneMatch[0])[0].trim() || 'Unknown Business',
            source: 'google_maps_paste',
            rawText: line
          });
        }
      }
    }

    console.log(`[finder] parseGoogleMapsText: found ${leads.length} mobile leads`);
    return leads;
  } catch (err) {
    console.error('[finder] ❌ parseGoogleMapsText failed:', err.message);
    return [];
  }
}

// ─────────────────────────────────────────────
// STUBS — To be implemented in future steps
// ─────────────────────────────────────────────

async function scrapeGoogleMaps(query, city) {
  try {
    console.log(`[finder] scrapeGoogleMaps not yet implemented — query: "${query}", city: ${city}`);
    return [];
  } catch (err) {
    console.error('[finder] ❌ scrapeGoogleMaps failed:', err.message);
    return [];
  }
}

async function scrapeInstagram(hashtag, city) {
  try {
    console.log(`[finder] scrapeInstagram not yet implemented — hashtag: ${hashtag}, city: ${city}`);
    return [];
  } catch (err) {
    console.error('[finder] ❌ scrapeInstagram failed:', err.message);
    return [];
  }
}

// ─────────────────────────────────────────────
// LEGACY COMPAT — Old scoreLead function (deprecated)
// Use detectPainSignals() + 4D scoring instead.
// ─────────────────────────────────────────────

function scoreLead({ hasBadReviews, isHiring, hasNoWebsite, responseTimeHours }) {
  try {
    let score = 0;
    if (hasBadReviews)         score += 30;
    if (isHiring)              score += 35;
    if (hasNoWebsite)          score += 20;
    if (responseTimeHours > 4) score += 15;
    return Math.min(100, score);
  } catch (err) {
    console.error('[finder] ❌ scoreLead failed:', err.message);
    return 0;
  }
}

module.exports = {
  // Core v3
  detectPainSignals,
  deduplicateLeads,
  saveLeadToDB,
  batchSaveLeads,

  // Utilities
  normalizePhone,
  isSaudiMobile,
  parseGoogleMapsText,

  // Stubs
  scrapeGoogleMaps,
  scrapeInstagram,

  // Legacy (deprecated)
  scoreLead
};
