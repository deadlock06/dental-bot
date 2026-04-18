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
const { runIndeedScout } = require('./scouts/indeed');
const { handoffLead } = require('./handoff');
const { sendFollowUps } = require('./sender');

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
    res.setHeader('WWW-Authenticate', 'Basic realm="Growth Swarm"');
    return res.status(401).send('Authentication required');
  }
  const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
  const user = auth[0];
  const pass = auth[1];
  
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASS || 'password123';

  if (user === adminUser && pass === adminPass) {
    next();
  } else {
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
      .or(`extracted_phone.eq.${phone},extracted_phone.eq.${normalizePhone(phone || '')}`)
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

// Ghost Room — personalized landing page for clinic owners
router.get('/room', (req, res) => {
  res.sendFile(path.join(__dirname, 'ghost-room.html'));
});

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
  const { limit = 5, min_confidence = 70 } = req.body;
  
  const { data: leads, error } = await supabase
    .from('growth_leads_v2')
    .select('*')
    .eq('status', 'verified_owner')
    .gte('confidence_score', min_confidence)
    .is('last_message_sent', null)
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
      business_name: lead.name,
      pain_signal: 'hiring_receptionist',
      city: lead.city,
      phone: lead.phone
    });
    
    const result = await sendWhatsApp(lead.phone, message);
    
    if (result.success) {
      await supabase.from('growth_leads_v2').update({
        status: 'messaged',
        message_sent: message,
        message_sent_at: new Date().toISOString(),
        message_count: 1
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

// ========== SCOUTING ==========

/**
 * POST /growth/scout/indeed
 */
router.post('/scout/indeed', basicAuth, async (req, res) => {
  const jobs = await runIndeedScout();
  
  const inserted = [];
  for (const job of jobs.slice(0, 10)) { 
    // Check if company already exists
    const { data: existing } = await supabase
      .from('growth_leads_v2')
      .select('id')
      .ilike('name', `%${job.company}%`)
      .limit(1);
    
    if (existing && existing.length > 0) continue;
    
    const { data: lead } = await supabase
      .from('growth_leads_v2')
      .insert({
        raw_input: `${job.company}, ${job.city}, from Indeed job: ${job.title}`,
        name: job.company,
        city: job.city,
        sources: ['indeed_scout'],
        pain_signal: job.painSignal,
        timing_score: job.timingScore,
        status: 'pending', 
        posted_at: job.postedAt
      })
      .select()
      .single();
    
    if (lead) {
      inserted.push({
        id: lead.id,
        company: job.company,
        city: job.city,
        daysAgo: job.daysAgo
      });
    }
  }
  
  res.json({
    success: true,
    jobsFound: jobs.length,
    newLeads: inserted.length,
    leads: inserted
  });
});

// ========== DASHBOARD & REVIEW ==========

/**
 * GET /growth/dashboard
 */
router.get('/dashboard', basicAuth, async (req, res) => {
  const { status, min_confidence } = req.query;
  
  let query = supabase.from('growth_leads_v2').select('*').order('created_at', { ascending: false });
  
  if (status) query = query.eq('status', status);
  if (min_confidence) query = query.gte('confidence_score', parseInt(min_confidence));
  
  const { data: leads } = await query.limit(100);
  
  const stats = {
    total: leads?.length || 0,
    byStatus: {}
  };
  
  (leads || []).forEach(l => {
    stats.byStatus[l.status] = (stats.byStatus[l.status] || 0) + 1;
  });
  
  const rows = (leads || []).map(l => `
    <tr style="${l.is_owner_verified ? 'background:rgba(72,219,251,0.1)' : ''}">
      <td>${l.name}</td>
      <td>${l.city}</td>
      <td><b>${l.status}</b></td>
      <td>${l.confidence_score}</td>
      <td>${l.is_owner_verified ? '✅' : '❌'}</td>
      <td>${l.phone_type || '-'}</td>
      <td>${new Date(l.created_at).toLocaleDateString()}</td>
      <td>
        ${l.status === 'needs_review' 
          ? `<button onclick="approveLead('${l.id}')">Approve</button>` 
          : ''}
      </td>
    </tr>
  `).join('');
  
  res.send(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>Growth Swarm Dashboard</title>
      <style>
        body { font-family: -apple-system, sans-serif; padding: 40px; background: #0f0c29; color: white; }
        h1 { color: #48dbfb; }
        .stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 15px; margin-bottom: 30px; }
        .stat { background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; text-align: center; }
        .stat-num { font-size: 28px; font-weight: bold; color: #48dbfb; }
        table { width: 100%; border-collapse: collapse; font-size: 14px; }
        th, td { padding: 12px; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.1); }
        th { color: #94a3b8; text-transform: uppercase; font-size: 12px; }
        button { background: #48dbfb; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; color:#0f0c29; font-weight:bold; }
      </style>
      <script>
        async function approveLead(id) {
          if (!confirm('Approve and send message to this lead?')) return;
          const res = await fetch('/growth/approve/' + id, { method: 'POST' });
          if (res.ok) window.location.reload();
          else alert('Approval failed');
        }
        async function sendBatch() {
          if (!confirm('Send messages to all verified_owner leads?')) return;
          const res = await fetch('/growth/send-batch', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({limit:10, min_confidence:0}) });
          const data = await res.json();
          alert('Sent: ' + data.sent + ' messages');
          window.location.reload();
        }
      </script>
    </head>
    <body>
      <h1>🚀 Growth Swarm — نظام التحقق التلقائي</h1>
      <button onclick="sendBatch()" style="margin-bottom:20px;padding:10px 20px;font-size:16px;">📤 Send Batch</button>
      <div class="stats">
        <div class="stat"><div class="stat-num">${stats.byStatus['messaged'] || 0}</div><div>تم الإرسال</div></div>
        <div class="stat"><div class="stat-num">${stats.byStatus['verified_owner'] || 0}</div><div>تم التحقق</div></div>
        <div class="stat"><div class="stat-num">${stats.byStatus['needs_review'] || 0}</div><div>يحتاج مراجعة</div></div>
        <div class="stat"><div class="stat-num">${stats.byStatus['dropped'] || 0}</div><div>مرفوض</div></div>
        <div class="stat"><div class="stat-num">${stats.byStatus['replied'] || 0}</div><div>تم الرد</div></div>
        <div class="stat"><div class="stat-num">${stats.byStatus['customer'] || 0}</div><div>عملاء</div></div>
      </div>
      <table>
        <tr>
          <th>العيادة</th>
          <th>المدينة</th>
          <th>الحالة</th>
          <th>النقاط</th>
          <th>المالك؟</th>
          <th>نوع الرقم</th>
          <th>التاريخ</th>
          <th>إجراء</th>
        </tr>
        ${rows}
      </table>
    </body>
    </html>
  `);
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
      message_sent: message,
      message_sent_at: new Date().toISOString(),
      manually_approved: true
    }).eq('id', id);
    
    res.json({ success: true });
  } else {
    res.status(500).json({ error: result.error });
  }
});

module.exports = router;
