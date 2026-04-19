/**
 * Growth Swarm API Router
 * All endpoints for lead management and outreach
 */

const express = require('express');
const router = express.Router();
const path = require('path');

// Auto-redirect from /growth to /growth/dashboard
router.get('/', (req, res) => {
  res.redirect('/growth/dashboard');
});
const { createClient } = require('@supabase/supabase-js');

const { parseRawInput } = require('./lib/smartParser');
const { autoVerify } = require('./lib/autoVerify');
const { checkDuplicate } = require('./lib/dedup');
const { sendWhatsApp } = require('./lib/whatsappProvider');
const { generateMessage } = require('./brain');
const { runIndeedScout }  = require('./scouts/indeed');
const { runAllScouts }    = require('./scouts/orchestrator');
const { handoffLead }     = require('./handoff');
const { sendFollowUps, processBatch } = require('./sender');

// Track last scout run in memory (survives restarts via DB query instead)
let lastScoutReport = null;

let _stripe;
function getStripe() {
  if (!_stripe) _stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// ========== SECURITY: BASIC AUTH ==========

const basicAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    console.log('[Auth] No auth header provided');
    res.setHeader('WWW-Authenticate', 'Basic realm="Growth Swarm"');
    return res.status(401).send('Authentication required');
  }
  const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
  const user = auth[0];
  const pass = auth[1];
  
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASS || 'password123';

  if (user === adminUser && pass === adminPass) {
    console.log(`[Auth] Success for user: ${user}`);
    next();
  } else {
    console.log(`[Auth] Failed attempt for user: ${user}`);
    res.setHeader('WWW-Authenticate', 'Basic realm="Growth Swarm"');
    return res.status(401).send('Invalid credentials');
  }
};

// ========== STRIPE WEBHOOK ==========

router.post('/stripe-webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = getStripe().webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error(`[Stripe Webhook] Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    // Extract metadata or email
    const customerEmail = session.customer_details?.email;
    const phone = session.metadata?.phone || session.customer_details?.phone;
    
    console.log(`[Stripe] Payment success for ${customerEmail} (Phone: ${phone})`);
    
    // Update lead in DB
    const { data: lead, error } = await supabase
      .from('growth_leads_v2')
      .update({ 
        status: 'customer',
        stripe_session_id: session.id,
        stripe_customer_email: customerEmail,
        paid_at: new Date().toISOString()
      })
      .or(`phone.eq.${phone},phone.eq.${normalizePhone(phone || '')}`)
      .select()
      .single();

    if (error) {
      console.error('[Stripe Webhook] DB Update Error:', error);
    } else if (lead) {
      // CRITICAL: Trigger automated handoff so the bot knows they are a customer now
      try {
        await handoffLead(lead, 'STRIPE_PAYMENT_COMPLETED');
        console.log(`[Stripe] Handoff successful for ${lead.phone}`);
      } catch (hErr) {
        console.error('[Stripe Webhook] Handoff Error:', hErr);
      }
    }
  }

  res.json({ received: true });
});

/**
 * Helper to normalize phone for DB lookup
 */
function normalizePhone(p) {
  if (!p) return '';
  let cleaned = p.replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = '966' + cleaned.slice(1);
  if (!cleaned.startsWith('+')) cleaned = '+' + cleaned;
  return cleaned;
}

router.get('/ghost-room', (req, res) => {
  res.sendFile(path.join(__dirname, 'ghost-room.html'));
});

// Alias for backwards compatibility if needed
router.get('/room', (req, res) => {
  res.sendFile(path.join(__dirname, 'ghost-room.html'));
});

router.post('/leads', async (req, res) => {
  const { data, error } = await supabase.from('growth_leads_v2').insert(req.body);
  res.json({ success: !error, data, error });
});

router.get('/leads', async (req, res) => {
  const { data, error } = await supabase.from('growth_leads_v2').select('*');
  res.json({ success: !error, data, error });
});

router.post('/send', async (req, res) => {
  const { id } = req.body;
  const { data: lead } = await supabase.from('growth_leads_v2').select('*').eq('id', id).single();
  if (lead) {
    const msg = await generateMessage(lead);
    const sent = await sendWhatsApp(lead.phone, msg);
    res.json({ success: sent.success, message: msg });
  } else {
    res.status(404).json({ error: 'lead not found' });
  }
});

router.post('/bump', async (req, res) => {
  const results = await sendFollowUps();
  res.json({ success: true, results });
});

router.post('/handoff', async (req, res) => {
  const { lead, message } = req.body;
  const result = await handoffLead(lead, message);
  res.json(result);
});

router.get('/stats', async (req, res) => {
  const { data, error } = await supabase.from('growth_leads_v2').select('status, confidence_score');
  res.json({ success: !error, total: data?.length || 0, data });
});

/* replaced inline html route */

// inline HTML route was replaced

// ========== ZERO-FRICTION: PASTE → VERIFY → MESSAGE ==========

/**
 * POST /growth/add-and-fire
 * One endpoint: paste raw data, system does everything
 */
router.post('/add-and-fire', async (req, res) => {
  const { raw_input, force_verify = false, skip_if_duplicate = true } = req.body;
  
  if (!raw_input || typeof raw_input !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'raw_input is required (string)'
    });
  }
  
  try {
    // 1. PARSE
    const parsed = parseRawInput(raw_input);
    if (!parsed || !parsed.phone) {
      return res.status(400).json({
        success: false,
        error: 'Could not extract valid Saudi phone number',
        input: raw_input.substring(0, 100)
      });
    }
    
    // 2. CHECK DUPLICATE
    if (skip_if_duplicate) {
      const duplicate = await checkDuplicate(supabase, parsed.phone, parsed.name, parsed.city);
      
      if (duplicate.isDuplicate && !force_verify) {
        return res.json({
          success: false,
          action: 'duplicate_detected',
          duplicateReason: duplicate.reason,
          existingId: duplicate.existingId,
          existingStatus: duplicate.existingStatus,
          confidence: duplicate.confidence,
          message: 'Lead already exists. Use force_verify=true to re-verify or skip_if_duplicate=false to process anyway.'
        });
      }
    }
    
    // 3. INSERT PENDING
    const { data: lead, error: insertError } = await supabase
      .from('growth_leads_v2')
      .insert({
        raw_input,
        phone: parsed.phone,
        name: parsed.name,
        city: parsed.city,
        sources: ['manual_paste'],
        status: 'verifying'
      })
      .select()
      .single();
    
    if (insertError) throw insertError;
    
    // 4. AUTO-VERIFY
    const verification = await autoVerify(parsed, supabase);
    
    // 5. UPDATE WITH VERIFICATION
    const updateData = {
      website_found: verification.website?.found || false,
      website_url: verification.website?.url || null,
      website_owner_name: verification.website?.ownerName || null,
      phone_type: verification.phone?.type || 'unknown',
      confidence_score: verification.confidenceScore,
      is_owner_verified: verification.isOwnerVerified,
      status: verification.decision === 'MESSAGE' ? 'verified_owner' : 
              verification.decision === 'REVIEW' ? 'needs_review' : 'dropped',
      updated_at: new Date().toISOString()
    };
    
    await supabase.from('growth_leads_v2').update(updateData).eq('id', lead.id);
    
    // 6. AUTO-MESSAGE IF QUALIFIED
    if (verification.decision === 'MESSAGE' || (verification.decision === 'REVIEW' && force_verify)) {
      const message = await generateMessage({
        name: verification.website?.ownerName || parsed.name,
        business_name: parsed.name,
        pain_signal: parsed.painHints?.[0] || 'hiring_receptionist',
        pain_details: 'Auto-detected from verification system',
        city: parsed.city,
        phone: parsed.phone
      });
      
      const sendResult = await sendWhatsApp(parsed.phone, message, {
        whatsapp_provider: 'twilio' // Default for now
      });
      
      if (sendResult.success) {
        await supabase.from('growth_leads_v2').update({
          status: 'messaged',
          last_message_sent: message,
          last_contacted_at: new Date().toISOString(),
          whatsapp_provider: sendResult.provider,
          message_count: 1
        }).eq('id', lead.id);
        
        return res.json({
          success: true,
          action: 'messaged_owner',
          leadId: lead.id,
          phone: parsed.phone,
          name: parsed.name,
          confidence: verification.confidenceScore,
          scoringBreakdown: verification.scoringBreakdown,
          provider: sendResult.provider,
          messagePreview: message.substring(0, 100) + '...',
          verification: {
            websiteFound: verification.website?.found,
            ownerName: verification.website?.ownerName,
            phoneType: verification.phone?.type,
            isPersonal: verification.phone?.isPersonal
          }
        });
      } else {
        // Send failed, keep as verified but not messaged
        await supabase.from('growth_leads_v2').update({
          status: 'verified_owner', 
          last_error: sendResult.error
        }).eq('id', lead.id);
        
        return res.json({
          success: false,
          action: 'send_failed',
          leadId: lead.id,
          error: sendResult.error,
          willRetry: true
        });
      }
    }
    
    // 7. NOT QUALIFIED
    return res.json({
      success: false,
      action: verification.decision === 'REVIEW' ? 'needs_manual_review' : 'dropped_low_confidence',
      leadId: lead.id,
      phone: parsed.phone,
      confidence: verification.confidenceScore,
      scoringBreakdown: verification.scoringBreakdown,
      reasons: verification.decision,
      canForce: verification.decision === 'REVIEW',
      forceHint: 'Add force_verify=true to message anyway'
    });
    
  } catch (error) {
    console.error('[add-and-fire] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========== BATCH OPERATIONS ==========

/**
 * POST /growth/send-batch
 */
router.post('/send-batch', basicAuth, async (req, res) => {
  const { limit = 5, min_confidence = 0 } = req.body;

  const { data: leads, error } = await supabase
    .from('growth_leads_v2')
    .select('*')
    .in('status', ['new', 'verified_owner'])
    .gte('confidence_score', min_confidence)
    .order('confidence_score', { ascending: false })
    .limit(limit);
  
  if (error || !leads || leads.length === 0) {
    return res.json({
      success: true,
      sent: 0,
      message: 'No qualified leads ready for messaging'
    });
  }
  
  const results = [];
  for (const lead of leads) {
    const message = await generateMessage({
      name: lead.website_owner_name || lead.name,
      business_name: lead.business_name || lead.name,
      pain_signal: lead.pain_signal || 'hiring_receptionist',
      pain_details: lead.pain_details || '',
      city: lead.city,
      phone: lead.phone
    });

    const result = await sendWhatsApp(lead.phone, message);

    if (result.success) {
      await supabase.from('growth_leads_v2').update({
        status: 'messaged',
        last_message_sent: message,
        last_contacted_at: new Date().toISOString(),
        first_contacted_at: lead.first_contacted_at || new Date().toISOString(),
        message_count: (lead.message_count || 0) + 1
      }).eq('id', lead.id);
    }
    
    results.push({
      leadId: lead.id,
      name: lead.name,
      success: result.success,
      provider: result.provider
    });
  }
  
  res.json({
    success: true,
    sent: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results
  });
});

// ========== FOLLOW-UPS ==========

/**
 * POST /growth/send-followups
 * Called by daily cron at 9 AM Saudi time
 */
router.post('/send-followups', async (req, res) => {
  res.sendStatus(200);
  try {
    const results = await sendFollowUps();
    console.log(`[FollowUps] Processed ${results.length} follow-up(s)`);
  } catch (e) {
    console.error('[FollowUps] Error:', e.message);
  }
});

// ========== SCOUTING (ORCHESTRATED) ==========

// POST /growth/scout/run — Run all scouts (or specific ones)
router.post('/scout/run', basicAuth, async (req, res) => {
  const { scouts, autoSend = false, cities } = req.body;
  console.log('[index.js] Scout run triggered via API');
  try {
    const report = await runAllScouts(supabase, { scouts, autoSend, cities });
    lastScoutReport = report;
    res.json({ success: true, ...report });
  } catch (err) {
    console.error('[index.js] Scout run error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /growth/scout/indeed — Legacy compat: runs just Indeed via orchestrator
router.post('/scout/indeed', basicAuth, async (req, res) => {
  console.log('[index.js] Indeed scout triggered');
  try {
    const report = await runAllScouts(supabase, { scouts: ['indeed', 'job_portals'] });
    lastScoutReport = report;
    res.json({ success: true, newLeads: report.inserted, ...report });
  } catch (err) {
    console.error('[index.js] Indeed scout error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /growth/scout/places — Google Places only
router.post('/scout/places', basicAuth, async (req, res) => {
  const { cities, autoSend = false } = req.body;
  console.log('[index.js] Google Places scout triggered');
  try {
    const report = await runAllScouts(supabase, { scouts: ['google_places'], cities, autoSend });
    lastScoutReport = report;
    res.json({ success: true, newLeads: report.inserted, ...report });
  } catch (err) {
    console.error('[index.js] Places scout error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /growth/scout/status — Last scout report
router.get('/scout/status', basicAuth, (req, res) => {
  res.json({ success: true, lastRun: lastScoutReport });
});

// ========== DASHBOARD & REVIEW ==========

/**
 * GET /growth/dashboard — V2.5 Dark Mode
 */
router.get('/dashboard', basicAuth, async (req, res) => {
  const filterStatus = req.query.status || '';
  const filterConf   = parseInt(req.query.min_confidence || '0');

  let query = supabase.from('growth_leads_v2').select('*').order('created_at', { ascending: false }).limit(200);
  if (filterStatus) query = query.eq('status', filterStatus);
  if (filterConf)   query = query.gte('confidence_score', filterConf);

  const { data: leads } = await query;
  const all = leads || [];

  const s = {
    total:      all.length,
    new:        all.filter(l => l.status === 'new').length,
    messaged:   all.filter(l => l.status === 'messaged').length,
    bumped1:    all.filter(l => l.status === 'bumped_1').length,
    bumped2:    all.filter(l => l.status === 'bumped_2').length,
    handedOff:  all.filter(l => l.status === 'handed_off').length,
    paid:       all.filter(l => l.status === 'paid' || l.status === 'customer').length,
    optedOut:   all.filter(l => l.status === 'opted_out').length,
    review:     all.filter(l => l.status === 'needs_review').length,
    today:      all.filter(l => l.last_contacted_at && new Date(l.last_contacted_at).toDateString() === new Date().toDateString()).length,
  };

  const STATUS_COLORS = {
    new: '#3498db', messaged: '#f39c12', bumped_1: '#e67e22', bumped_2: '#d35400',
    handed_off: '#2ecc71', paid: '#ffd700', customer: '#ffd700',
    opted_out: '#95a5a6', needs_review: '#9b59b6', dropped: '#e74c3c',
  };

  function hotness(score) {
    if (score >= 80) return '🔥';
    if (score < 50)  return '❄️';
    return '';
  }

  const rows = all.map(l => {
    const color = STATUS_COLORS[l.status] || '#666';
    const isOptOut = l.status === 'opted_out';
    return `<tr class="lead-row">
      <td>${hotness(l.confidence_score || 0)} ${l.name || '-'}</td>
      <td>${l.business_name || '-'}</td>
      <td>${l.city || '-'}</td>
      <td><span class="badge" style="background:${color}22;color:${color};border:1px solid ${color}44;${isOptOut ? 'text-decoration:line-through' : ''}">${l.status}</span></td>
      <td class="score" style="color:${(l.confidence_score||0)>=70?'#2ecc71':(l.confidence_score||0)>=50?'#f39c12':'#e74c3c'}">${l.confidence_score || 0}</td>
      <td>${l.pain_signal || '-'}</td>
      <td>${l.last_contacted_at ? new Date(l.last_contacted_at).toLocaleDateString('en-GB') : '-'}</td>
      <td>
        ${l.status === 'needs_review' ? `<button class="btn-sm btn-approve" onclick="approveLead('${l.id}')">Approve</button>` : ''}
        ${['new','needs_review'].includes(l.status) ? `<button class="btn-sm btn-send" onclick="sendOne('${l.id}')">Send</button>` : ''}
      </td>
    </tr>`;
  }).join('');

  console.log('[dashboard] Loaded — ' + all.length + ' leads');

  const needsReviewTitle = s.review > 0 ? `<div class="section-title">⚠️ Needs Review (${s.review})</div>` : '';
  const actionsHtml = `
    ${s.new > 0 || s.review > 0 ? '<button class="btn btn-primary" onclick="sendBatch()">📤 Send Batch (5)</button>' : '<button class="btn btn-secondary" disabled>📤 No New Leads</button>'}
    ${s.messaged > 0 || s.bumped1 > 0 ? '<button class="btn btn-warning" onclick="runFollowUps()">🔁 Run Follow-ups</button>' : ''}
    <button class="btn btn-success" onclick="scoutIndeed()">🔍 Scout Indeed</button>
    <button class="btn btn-secondary" onclick="window.location.reload()">↺ Refresh</button>
  `;
  const tableContent = rows || '<tr><td colspan="8" style="text-align:center;padding:40px;color:#8b949e">No leads yet</td></tr>';
  const displayDate = new Date().toLocaleDateString('en-GB');

  res.send(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Anti-Gravity Dashboard</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;600;700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Tajawal',system-ui,sans-serif;background:#0d1117;color:#e6edf3;min-height:100vh}
    .topbar{background:#161b22;border-bottom:1px solid #30363d;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10}
    .topbar h1{font-size:18px;font-weight:700;color:#f0f6fc}
    .topbar .sub{font-size:12px;color:#8b949e;margin-top:2px}
    .container{max-width:1400px;margin:0 auto;padding:24px}
    .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:12px;margin-bottom:24px}
    .stat{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:16px 12px;text-align:center;cursor:pointer;transition:border-color .2s}
    .stat:hover{border-color:#58a6ff}
    .stat h3{font-size:28px;font-weight:700;margin-bottom:4px}
    .stat p{font-size:11px;color:#8b949e;text-transform:uppercase;letter-spacing:.5px}
    .s-total h3{color:#58a6ff} .s-new h3{color:#3498db} .s-msg h3{color:#f39c12}
    .s-bump h3{color:#e67e22} .s-off h3{color:#2ecc71} .s-paid h3{color:#ffd700}
    .s-out h3{color:#95a5a6} .s-rev h3{color:#9b59b6} .s-today h3{color:#79c0ff}
    .actions{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px}
    .btn{padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;border:none;cursor:pointer;font-family:inherit;transition:opacity .15s}
    .btn:hover{opacity:.85}
    .btn-primary{background:#1f6feb;color:#fff}
    .btn-secondary{background:#30363d;color:#e6edf3}
    .btn-success{background:#238636;color:#fff}
    .btn-warning{background:#9e6a03;color:#fff}
    .btn-sm{padding:4px 10px;font-size:12px;border-radius:6px;border:none;cursor:pointer;font-family:inherit;margin-right:4px}
    .btn-approve{background:#238636;color:#fff}
    .btn-send{background:#1f6feb;color:#fff}
    .section-title{font-size:15px;font-weight:600;color:#f0f6fc;margin-bottom:12px}
    .table-wrap{background:#161b22;border:1px solid #30363d;border-radius:12px;overflow:auto;margin-bottom:24px}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th,td{padding:10px 14px;text-align:right;border-bottom:1px solid #21262d;white-space:nowrap}
    th{background:#0d1117;color:#8b949e;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
    .lead-row:hover td{background:#1c2128}
    .badge{padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600}
    .score{font-weight:700}
    .toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#238636;color:#fff;padding:12px 24px;border-radius:8px;font-size:14px;z-index:100;display:none}
    @media(max-width:768px){
      .stats{grid-template-columns:repeat(3,1fr)}
      table{font-size:12px}
      th,td{padding:8px 10px}
      .actions{flex-direction:column}
      .btn{width:100%}
    }
    .filter-bar{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}
    .filter-bar select,.filter-bar input{background:#21262d;border:1px solid #30363d;color:#e6edf3;padding:6px 12px;border-radius:6px;font-size:13px;font-family:inherit}
  </style>
</head>
<body>
<div class="topbar">
  <div>
    <h1>🚀 Anti-Gravity Dashboard</h1>
    <div class="sub">Growth Swarm V2.5 — ${displayDate}</div>
  </div>
  <div style="display:flex;gap:8px">
    <a href="/growth/room?clinic=Demo&city=Riyadh" target="_blank" class="btn btn-secondary" style="text-decoration:none;font-size:12px">Ghost Room</a>
  </div>
</div>

<div class="container">
  <div class="stats">
    <div class="stat s-total"><h3 data-target="${s.total}">0</h3><p>Total</p></div>
    <div class="stat s-new"><h3 data-target="${s.new}">0</h3><p>New</p></div>
    <div class="stat s-msg"><h3 data-target="${s.messaged}">0</h3><p>Messaged</p></div>
    <div class="stat s-bump"><h3 data-target="${s.bumped1 + s.bumped2}">0</h3><p>Bumped</p></div>
    <div class="stat s-off"><h3 data-target="${s.handedOff}">0</h3><p>Handed Off</p></div>
    <div class="stat s-paid"><h3 data-target="${s.paid}">0</h3><p>Paid</p></div>
    <div class="stat s-out"><h3 data-target="${s.optedOut}">0</h3><p>Opted Out</p></div>
    <div class="stat s-rev"><h3 data-target="${s.review}">0</h3><p>Review</p></div>
    <div class="stat s-today"><h3 data-target="${s.today}">0</h3><p>Today</p></div>
  </div>

  <div class="actions">
    ${actionsHtml}
  </div>

  ${needsReviewTitle}

  <div class="filter-bar">
    <select onchange="filterByStatus(this.value)">
      <option value="">All Statuses</option>
      <option value="new">New</option>
      <option value="messaged">Messaged</option>
      <option value="bumped_1">Bumped 1</option>
      <option value="bumped_2">Bumped 2</option>
      <option value="needs_review">Needs Review</option>
      <option value="handed_off">Handed Off</option>
      <option value="opted_out">Opted Out</option>
    </select>
    <input type="number" placeholder="Min Score" min="0" max="100" onchange="filterByScore(this.value)" style="width:110px">
  </div>

  <div class="table-wrap">
    <table>
      <thead><tr>
        <th>العيادة</th><th>Business</th><th>City</th><th>Status</th>
        <th>Score</th><th>Pain</th><th>Last Contact</th><th>Actions</th>
      </tr></thead>
      <tbody>${tableContent}</tbody>
    </table>
  </div>
  <div style="margin-top:40px; text-align:center; color:#4b5563; font-size:11px;">
    System Status: <span style="color:#2ecc71">Secured</span> • Version: 2.1-Verified
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
  // Count-up animation
  document.querySelectorAll('[data-target]').forEach(el => {
    const target = parseInt(el.dataset.target);
    if (!target) return;
    let start = null;
    const step = ts => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / 800, 1);
      el.textContent = Math.round(p * target);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  function toast(msg, color='#238636') {
    const t = document.getElementById('toast');
    t.textContent = msg; t.style.background = color; t.style.display = 'block';
    setTimeout(() => t.style.display = 'none', 3000);
  }

  async function sendBatch() {
    toast('Sending...', '#1f6feb');
    const r = await fetch('/growth/send-batch', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({limit:5,min_confidence:0}) });
    const d = await r.json();
    toast('Sent: ' + d.sent + ' messages ✅');
    setTimeout(() => window.location.reload(), 1500);
  }

  async function runFollowUps() {
    toast('Running follow-ups...', '#9e6a03');
    await fetch('/growth/send-followups', { method:'POST' });
    toast('Follow-ups sent ✅');
    setTimeout(() => window.location.reload(), 1500);
  }

  async function scoutIndeed() {
    toast('🔍 Scouting all portals + Google Places...', '#238636');
    const r = await fetch('/growth/scout/run', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ scouts: ['indeed', 'job_portals', 'google_places'], autoSend: false })
    });
    const d = await r.json();
    toast('Found ' + (d.inserted || 0) + ' new leads across all sources ✅');
    setTimeout(() => window.location.reload(), 2500);
  }

  async function approveLead(id) {
    if (!confirm('Approve and send message to this lead?')) return;
    const r = await fetch('/growth/approve/' + id, { method:'POST' });
    if (r.ok) { toast('Approved ✅'); setTimeout(() => window.location.reload(), 1000); }
    else toast('Failed ❌', '#da3633');
  }

  async function sendOne(id) {
    toast('Sending...', '#1f6feb');
    const r = await fetch('/growth/approve/' + id, { method:'POST' });
    if (r.ok) { toast('Sent ✅'); setTimeout(() => window.location.reload(), 1000); }
    else toast('Failed ❌', '#da3633');
  }

  function filterByStatus(val) {
    window.location.href = '/growth/dashboard' + (val ? '?status=' + val : '');
  }
  function filterByScore(val) {
    const url = new URL(window.location.href);
    url.searchParams.set('min_confidence', val);
    window.location.href = url.toString();
  }
</script>
</body>
</html>`);
});

/**
 * POST /growth/approve/:id
 */
router.post('/approve/:id', basicAuth, async (req, res) => {
  const { id } = req.params;
  
  const { data: lead } = await supabase
    .from('growth_leads_v2')
    .select('*')
    .eq('id', id)
    .single();
  
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  
  const message = await generateMessage({
    name: lead.website_owner_name || lead.name,
    business_name: lead.name,
    city: lead.city,
    phone: lead.phone
  });
  
  const result = await sendWhatsApp(lead.phone, message);
  
  if (result.success) {
    await supabase.from('growth_leads_v2').update({
      status: 'messaged',
      last_message_sent: message,
      last_contacted_at: new Date().toISOString(),
      first_contacted_at: lead.first_contacted_at || new Date().toISOString(),
      manually_approved: true,
      message_count: (lead.message_count || 0) + 1,
    }).eq('id', id);
    
    res.json({ success: true });
  } else {
    res.status(500).json({ error: result.error });
  }
});

module.exports = router;
