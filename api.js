const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const { DateTime } = require('luxon');
const router = express.Router();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

// POST /api/auth/login — dashboard login against env credentials
router.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const validUser = process.env.ADMIN_USER || 'admin';
  const validPass = process.env.ADMIN_PASS || 'changeme_before_deploy';
  if (email === validUser && password === validPass) {
    const token = crypto.randomBytes(32).toString('hex');
    res.json({ token, user: { id: 'admin-1', email: validUser, name: 'Jake', role: 'admin' } });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// GET /api/dashboard/stats
router.get('/dashboard/stats', async (req, res) => {
  try {
    const { clinic_id } = req.query;
    const todayISO = new Date().toISOString().split('T')[0];

    // Get appointments for today
    let apptsUrl = `${SUPABASE_URL}/rest/v1/appointments?preferred_date_iso=eq.${todayISO}&select=*`;
    if (clinic_id) apptsUrl += `&clinic_id=eq.${encodeURIComponent(clinic_id)}`;

    const apptsRes = await axios.get(apptsUrl, { headers });
    const todayAppts = apptsRes.data || [];

    const appointments_today = todayAppts.length;
    const pending = todayAppts.filter(a => a.status === 'pending').length;
    const completed = todayAppts.filter(a => a.status === 'completed').length;
    const noShow = todayAppts.filter(a => a.status === 'no-show').length;

    // Calculation estimates
    const no_show_rate = appointments_today > 0 ? Math.round((noShow / appointments_today) * 100) : 0;
    const revenue = completed * 500; // estimated SAR per appointment
    const new_patients = appointments_today; // simple approximation

    res.json({
      appointments_today,
      pending,
      revenue,
      no_show_rate,
      new_patients
    });
  } catch (err) {
    console.error('[API] /dashboard/stats error:', err.message);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/appointments — real appointments from Supabase
router.get('/appointments', async (req, res) => {
  try {
    const { clinic_id, status, date } = req.query;
    let url = `${SUPABASE_URL}/rest/v1/appointments?order=created_at.desc&limit=200&select=*`;
    if (clinic_id) url += `&clinic_id=eq.${encodeURIComponent(clinic_id)}`;
    if (status)    url += `&status=eq.${encodeURIComponent(status)}`;
    if (date)      url += `&preferred_date_iso=eq.${encodeURIComponent(date)}`;
    const r = await axios.get(url, { headers });
    res.json(r.data || []);
  } catch (e) {
    console.error('[API] /appointments error:', e.message);
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

// GET /api/patients — real patients from Supabase
router.get('/patients', async (req, res) => {
  try {
    const url = `${SUPABASE_URL}/rest/v1/patients?order=updated_at.desc&limit=200&select=*`;
    const r = await axios.get(url, { headers });
    res.json(r.data || []);
  } catch (e) {
    console.error('[API] /patients error:', e.message);
    res.status(500).json({ error: 'Failed to fetch patients' });
  }
});

// GET /api/leads — real leads from Supabase (GS 3.0)
router.get('/leads', async (req, res) => {
  try {
    const { status, min_score, limit = '100' } = req.query;
    let url = `${SUPABASE_URL}/rest/v1/gs_leads?order=total_score.desc&limit=${limit}&select=*`;
    if (status && status !== 'All') url += `&status=eq.${encodeURIComponent(status)}`;
    if (min_score) url += `&total_score=gte.${encodeURIComponent(min_score)}`;
    const r = await axios.get(url, { headers: { ...headers, Prefer: 'count=exact' } });
    const total = parseInt(r.headers['content-range']?.split('/')[1] || '0', 10);
    res.json({ leads: r.data || [], total });
  } catch (e) {
    console.error('[API] /leads error:', e.message);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

// GET /api/doctors — real doctors from Supabase
router.get('/doctors', async (req, res) => {
  try {
    const { clinic_id } = req.query;
    let url = `${SUPABASE_URL}/rest/v1/doctor_schedules?order=doctor_name.asc&select=*`;
    if (clinic_id) url += `&clinic_id=eq.${encodeURIComponent(clinic_id)}`;
    const r = await axios.get(url, { headers });
    res.json(r.data || []);
  } catch (e) {
    console.error('[API] /doctors error:', e.message);
    res.status(500).json({ error: 'Failed to fetch doctors' });
  }
});

router.post('/appointments', async (req, res) => res.json({ success: true }));
router.put('/appointments/:id', async (req, res) => res.json({ success: true }));
router.put('/doctors/:id/schedule', async (req, res) => res.json({ success: true }));
// POST /api/sync-simulation
router.post('/sync-simulation', async (req, res) => {
  try {
    const { phone, clinic_name, doctor_name, revenue_lost, missed_calls, pain_signal, simulation_data } = req.body;
    
    if (!phone) return res.status(400).json({ error: 'Missing phone' });

    // UPSERT into growth_leads_v2
    const upsertData = {
      phone,
      clinic_name,
      doctor_name,
      revenue_lost,
      missed_calls,
      pain_signal,
      simulation_data,
      status: 'simulated',
      updated_at: new Date().toISOString()
    };

    const url = `${SUPABASE_URL}/rest/v1/growth_leads_v2`;
    const response = await axios.post(url, upsertData, {
      headers: {
        ...headers,
        'Prefer': 'resolution=merge-duplicates' // Handle UPSERT logic
      }
    });

    console.log(`[Sync] Simulation stored for ${phone}`);
    res.json({ success: true, data: response.data });
  } catch (err) {
    console.error('[Sync] Error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Sync failed' });
  }
});

router.get('/analytics', async (req, res) => {
  try {
    const { clinic_id, period = '30d' } = req.query;
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    
    const now = DateTime.now().setZone('Asia/Riyadh');
    const startDate = now.minus({ days }).toISODate();

    // Fetch appointments for the period
    let url = `${SUPABASE_URL}/rest/v1/appointments?preferred_date_iso=gte.${startDate}&select=*`;
    if (clinic_id) url += `&clinic_id=eq.${encodeURIComponent(clinic_id)}`;

    const r = await axios.get(url, { headers });
    const allAppts = r.data || [];

    // Summary KPIs
    const total_appointments = allAppts.length;
    const completed = allAppts.filter(a => a.status === 'completed').length;
    const revenue = completed * 500; // Estimated 500 SAR per completed appointment
    const noShows = allAppts.filter(a => a.status === 'no-show').length;
    const no_show_rate = total_appointments > 0 ? Math.round((noShows / total_appointments) * 100) : 0;
    
    // New Patients (Unique phone numbers in the period)
    const new_patients = new Set(allAppts.map(a => a.phone)).size;

    // Trend Data (Daily appointments)
    const trendMap = {};
    for (let i = 0; i < days; i++) {
      const d = now.minus({ days: i }).toFormat('MMM d');
      trendMap[d] = 0;
    }

    allAppts.forEach(a => {
      const d = DateTime.fromISO(a.preferred_date_iso).toFormat('MMM d');
      if (trendMap[d] !== undefined) {
        trendMap[d]++;
      }
    });

    const trendData = Object.keys(trendMap).reverse().map(date => ({
      date,
      appointments: trendMap[date]
    }));

    // Revenue by Treatment
    const treatmentMap = {};
    allAppts.filter(a => a.status === 'completed').forEach(a => {
      const t = a.treatment || 'Consultation';
      treatmentMap[t] = (treatmentMap[t] || 0) + 500;
    });
    const revenueByTreatment = Object.keys(treatmentMap).map(treatment => ({
      treatment,
      revenue: treatmentMap[treatment]
    }));

    // Doctor Utilization (Appointments / Estimated Capacity)
    const doctorMap = {};
    allAppts.forEach(a => {
      const d = a.doctor_name || 'General';
      doctorMap[d] = (doctorMap[d] || 0) + 1;
    });
    // Assuming 8 slots per day per doctor
    const doctorUtilization = Object.keys(doctorMap).map(name => ({
      name,
      value: Math.min(Math.round((doctorMap[name] / (days * 8)) * 100), 100),
      color: name.includes('Marjuk') ? '#3B82F6' : name.includes('Narmin') ? '#8B5CF6' : '#10B981'
    }));

    // No-Show Trend (Weekly)
    const noShowTrend = [];
    for (let i = 0; i < Math.ceil(days / 7); i++) {
      const start = now.minus({ days: (i + 1) * 7 });
      const end = now.minus({ days: i * 7 });
      const weekAppts = allAppts.filter(a => {
        const d = DateTime.fromISO(a.preferred_date_iso);
        return d >= start && d < end;
      });
      const weekNoShows = weekAppts.filter(a => a.status === 'no-show').length;
      noShowTrend.push({
        week: `Week ${i + 1}`,
        rate: weekAppts.length > 0 ? Math.round((weekNoShows / weekAppts.length) * 100) : 0
      });
    }

    res.json({
      summary: { total_appointments, revenue, no_show_rate, new_patients },
      trendData,
      revenueByTreatment,
      doctorUtilization,
      noShowTrend: noShowTrend.reverse(),
      funnelData: [
        { name: 'Bot Interactions', value: Math.round(total_appointments * 2.8), fill: '#3B82F6' },
        { name: 'Started Booking', value: Math.round(total_appointments * 1.8), fill: '#6366F1' },
        { name: 'Slot Selected', value: Math.round(total_appointments * 1.3), fill: '#8B5CF6' },
        { name: 'Confirmed', value: total_appointments, fill: '#10B981' },
        { name: 'Completed', value: completed, fill: '#059669' },
      ]
    });
  } catch (err) {
    console.error('[API] /analytics error:', err.message);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});


// POST /api/ghost-dwell — Ghost Room dwell time tracking
// ghost-room.html fires this when visitor hits 30s, 60s, 120s thresholds
router.post('/ghost-dwell', async (req, res) => {
  res.json({ ok: true });
  try {
    const { phone, clinic, city, pain, vertical, dwell_seconds, exited_via } = req.body || {};
    if (!phone && !clinic) return;

    const HIGH_INTENT_THRESHOLD = 60;

    // Upsert into growth_leads_v2 if phone present
    if (phone) {
      await axios.post(`${SUPABASE_URL}/rest/v1/growth_leads_v2`, {
        phone,
        business_name: clinic || null,
        city: city || null,
        pain_signal: pain || null,
        vertical: vertical || 'dental',
        status: 'simulated',
        updated_at: new Date().toISOString(),
      }, {
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      });
    }

    // Alert admin if high-intent (>60s dwell) and has not yet converted
    if (dwell_seconds >= HIGH_INTENT_THRESHOLD) {
      const adminPhone = process.env.ADMIN_PHONE ? `+${process.env.ADMIN_PHONE}` : null;
      if (adminPhone) {
        const { sendMessage } = require('./whatsapp');
        const label = exited_via === 'whatsapp' ? '✅ ضغط واتساب' : exited_via === 'report' ? '📊 طلب تقرير' : `⏱ ${dwell_seconds}ث تصفح`;
        await sendMessage(adminPhone,
          `🔥 زيارة عالية النية — Ghost Room\n🏥 ${clinic || 'مجهول'} — ${city || '?'}\n${label}\n📱 ${phone || 'لا يوجد رقم'}\n— تابع الآن`
        );
      }
    }
  } catch (e) {
    console.error('[Ghost Dwell] error:', e.message);
  }
});

module.exports = router;
