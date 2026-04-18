const express = require('express');
const router = express.Router();
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { processBatch, sendFollowUps } = require('./sender');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Ghost Room — personalized landing page for clinic owners
router.get('/room', (req, res) => {
  res.sendFile(path.join(__dirname, 'ghost-room.html'));
});

// Dashboard HTML
router.get('/dashboard', async (req, res) => {
  const { data: leads } = await supabase
    .from('growth_leads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  const total = leads?.length || 0;
  const messaged = leads?.filter(l => l.status === 'messaged').length || 0;
  const replied = leads?.filter(l => l.status === 'handed_off' || l.status === 'replied').length || 0;
  const customers = leads?.filter(l => l.status === 'customer').length || 0;

  const rows = (leads || []).map(l => `
    <tr>
      <td>${l.name || '-'}</td>
      <td>${l.business_name || '-'}</td>
      <td>${l.status}</td>
      <td>${l.pain_signal}</td>
      <td>${new Date(l.created_at).toLocaleDateString()}</td>
    </tr>
  `).join('');

  res.send(`
    <html>
      <head><title>Growth Swarm</title></head>
      <body style="font-family:Arial;padding:40px">
        <h1>🚀 Growth Swarm Dashboard</h1>
        <div style="display:flex;gap:20px;margin:20px 0">
          <div style="background:#f0f0f0;padding:20px;border-radius:8px"><b>Total</b><br>${total}</div>
          <div style="background:#e3f2fd;padding:20px;border-radius:8px"><b>Messaged</b><br>${messaged}</div>
          <div style="background:#e8f5e9;padding:20px;border-radius:8px"><b>Replied</b><br>${replied}</div>
          <div style="background:#fff3e0;padding:20px;border-radius:8px"><b>Customers</b><br>${customers}</div>
        </div>
        <table border="1" cellpadding="8" style="border-collapse:collapse;width:100%">
          <tr><th>Name</th><th>Business</th><th>Status</th><th>Pain</th><th>Date</th></tr>
          ${rows}
        </table>
      </body>
    </html>
  `);
});

// Trigger batch send (first outreach to 'new' leads)
router.post('/send-batch', async (req, res) => {
  const results = await processBatch(5);
  res.json({ sent: results.length, results });
});

// Trigger follow-up sequence (Day 3 + Day 7 bumps to 'messaged' leads)
router.post('/send-followups', async (req, res) => {
  const results = await sendFollowUps();
  res.json({ sent: results.length, results });
});

// Add single lead manually
router.post('/add-lead', async (req, res) => {
  const { phone, name, business_name, pain_signal, pain_details, city } = req.body;
  const { data, error } = await supabase.from('growth_leads').insert({
    phone, name, business_name, pain_signal, pain_details, city, country: 'SA'
  }).select().single();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true, id: data.id });
});

// Get all leads as JSON
router.get('/leads', async (req, res) => {
  const { data } = await supabase.from('growth_leads').select('*').order('created_at', { ascending: false });
  res.json(data || []);
});

module.exports = router;
