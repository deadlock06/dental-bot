const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

router.get('/leads', async (req, res) => {
  try {
    const { data, error } = await supabase.from('gs_leads').select('*').order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/conversations', async (req, res) => {
  try {
    const { data, error } = await supabase.from('gs_conversations').select('*').order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/campaigns', async (req, res) => {
  try {
    const { data, error } = await supabase.from('gs_campaigns').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/analytics', async (req, res) => {
  try {
    const { data: leads } = await supabase.from('gs_leads').select('status, priority, total_score');
    
    const stats = {
      totalLeads: leads ? leads.length : 0,
      hot: leads ? leads.filter(l => l.priority === 'hot').length : 0,
      warm: leads ? leads.filter(l => l.priority === 'warm').length : 0,
      handedOff: leads ? leads.filter(l => l.status === 'handed_off').length : 0,
      optedOut: leads ? leads.filter(l => l.status === 'opted_out').length : 0,
    };
    
    res.json(stats);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/queue', async (req, res) => {
  try {
    const { data, error } = await supabase.from('gs_sequences').select('*').eq('is_paused', false).eq('is_completed', false);
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
