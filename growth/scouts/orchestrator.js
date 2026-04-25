/**
 * orchestrator.js — Scout Orchestrator
 * Runs all scouts → deduplicates → scores → inserts → optionally auto-sends
 *
 * Pipeline:
 *   scouts → dedup against DB → insert → processBatch (if autoSend)
 */

const { runJobPortalScout }    = require('./jobPortals');
const { runGooglePlacesScout } = require('./googlePlaces');
const { runIndeedScout }       = require('./indeed');

const AUTO_SEND_THRESHOLD = 75; // confidence_score minimum to auto-send

async function deduplicateAgainstDB(supabase, leads) {
  if (!leads.length) return leads;

  // Build phone + name lists for batch lookup
  const phones = leads.map(l => l.phone).filter(Boolean);
  const names  = leads.map(l => (l.business_name || '').toLowerCase().replace(/\s+/g, ''));

  let existingPhones = new Set();
  let existingNames  = new Set();

  if (phones.length) {
    const { data } = await supabase
      .from('growth_leads_v2')
      .select('phone, business_name')
      .in('phone', phones);
    (data || []).forEach(r => {
      if (r.phone) existingPhones.add(r.phone);
      if (r.business_name) existingNames.add(r.business_name.toLowerCase().replace(/\s+/g, ''));
    });
  }

  const fresh = leads.filter(l => {
    if (l.phone && existingPhones.has(l.phone)) return false;
    const nameKey = (l.business_name || '').toLowerCase().replace(/\s+/g, '');
    if (nameKey && existingNames.has(nameKey)) return false;
    return true;
  });

  const dupes = leads.length - fresh.length;
  if (dupes > 0) console.log(`[orchestrator.js] Filtered ${dupes} duplicates from DB`);
  return fresh;
}

async function insertLeads(supabase, leads) {
  if (!leads.length) return { inserted: 0, errors: 0 };

  let inserted = 0;
  let errors   = 0;

  // Insert in batches of 20
  const batches = [];
  for (let i = 0; i < leads.length; i += 20) batches.push(leads.slice(i, i + 20));

  for (const batch of batches) {
    const { error } = await supabase
      .from('growth_leads_v2')
      .insert(batch.map(l => ({
        ...l,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })));

    if (error) {
      console.error('[orchestrator.js] Insert error:', error.message);
      // Try one-by-one to salvage non-conflicting rows
      for (const lead of batch) {
        const { error: e2 } = await supabase.from('growth_leads_v2').insert(lead);
        if (e2) errors++;
        else inserted++;
      }
    } else {
      inserted += batch.length;
    }
  }

  console.log(`[orchestrator.js] Inserted ${inserted} leads (${errors} errors)`);
  return { inserted, errors };
}

async function autoSendBatch(supabase) {
  const { processBatch } = require('../sender');
  console.log('[orchestrator.js] Auto-sending to high-confidence new leads...');
  const results = await processBatch(5);
  const sent = results.filter(r => r.sent).length;
  console.log(`[orchestrator.js] Auto-send: ${sent} messages sent`);
  return results;
}

/**
 * Main entry point — run all scouts and pipeline
 * @param {Object} supabase — Supabase client
 * @param {Object} options
 *   - scouts: ['job_portals', 'google_places', 'indeed'] (default: all)
 *   - autoSend: bool — auto-send to qualified leads after insert (default: false)
 *   - cities: string[] — override city list for Google Places
 */
async function runAllScouts(supabase, options = {}) {
  const runScouts = options.scouts || ['job_portals', 'indeed', 'google_places'];
  const autoSend  = options.autoSend || false;
  const industry  = options.industry || 'dental';

  console.log(`\n[orchestrator.js] ====== SCOUT RUN STARTED ======`);
  console.log(`[orchestrator.js] Scouts: ${runScouts.join(', ')} | AutoSend: ${autoSend}`);

  const startTime = Date.now();
  const report = {
    startedAt:    new Date().toISOString(),
    scouts:       {},
    totalRaw:     0,
    afterDedup:   0,
    inserted:     0,
    errors:       0,
    autoSent:     0,
    durationMs:   0,
  };

  let allLeads = [];

  // ── Run each scout ──
  if (runScouts.includes('indeed')) {
    try {
      const leads = await runIndeedScout();
      report.scouts.indeed = leads.length;
      allLeads.push(...leads.map(job => ({
        business_name:   job.company,
        name:            job.company,
        city:            job.city || 'Saudi Arabia',
        pain_signal:     job.painSignal || 'hiring_receptionist',
        pain_details:    `Indeed job: ${job.title}`,
        source:          'indeed_scout',
        sources:         ['indeed_scout'],
        status:          'new',
        industry:        industry,
        country:         'SA',
        confidence_score: 55,
        timing_score:    job.timingScore || 60,
        posted_at:       job.postedAt || null,
        raw_input:       `${job.title} at ${job.company} — ${job.city}`,
      })));
    } catch (e) {
      console.error('[orchestrator.js] indeed scout error:', e.message);
      report.scouts.indeed = 0;
    }
  }

  if (runScouts.includes('job_portals')) {
    try {
      const leads = await runJobPortalScout();
      report.scouts.job_portals = leads.length;
      allLeads.push(...leads);
    } catch (e) {
      console.error('[orchestrator.js] job_portals error:', e.message);
      report.scouts.job_portals = 0;
    }
  }

  if (runScouts.includes('google_places')) {
    try {
      const leads = await runGooglePlacesScout({ cities: options.cities, industry: industry });
      report.scouts.google_places = leads.length;
      allLeads.push(...leads);
    } catch (e) {
      console.error('[orchestrator.js] google_places error:', e.message);
      report.scouts.google_places = 0;
    }
  }

  report.totalRaw = allLeads.length;
  console.log(`[orchestrator.js] Raw leads collected: ${report.totalRaw}`);

  if (!allLeads.length) {
    console.log('[orchestrator.js] No leads to process');
    report.durationMs = Date.now() - startTime;
    return report;
  }

  // ── Dedup within batch ──
  const seenKeys = new Set();
  allLeads = allLeads.filter(l => {
    const key = (l.phone || '') + '|' + (l.business_name || '').toLowerCase().replace(/\s+/g, '');
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  // ── Dedup against DB ──
  allLeads = await deduplicateAgainstDB(supabase, allLeads);
  report.afterDedup = allLeads.length;

  // ── Separate: auto-send candidates vs review queue ──
  const autoSendable = allLeads.filter(l =>
    l.phone &&
    l.confidence_score >= AUTO_SEND_THRESHOLD &&
    l.status === 'new'
  );
  const reviewQueue = allLeads.filter(l => !autoSendable.includes(l));

  console.log(`[orchestrator.js] After dedup: ${allLeads.length} | Auto-sendable: ${autoSendable.length} | Review queue: ${reviewQueue.length}`);

  // ── Insert all leads ──
  const insertResult = await insertLeads(supabase, allLeads);
  report.inserted = insertResult.inserted;
  report.errors   = insertResult.errors;

  // ── Auto-send if enabled ──
  if (autoSend && autoSendable.length > 0) {
    const sendResults = await autoSendBatch(supabase);
    report.autoSent = sendResults.filter(r => r.sent).length;
  }

  report.durationMs = Date.now() - startTime;

  console.log(`[orchestrator.js] ====== SCOUT COMPLETE ======`);
  console.log(`[orchestrator.js] ${report.inserted} inserted | ${report.autoSent} auto-sent | ${report.durationMs}ms`);

  return report;
}

module.exports = { runAllScouts };
