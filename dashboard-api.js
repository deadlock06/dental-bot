const express = require('express');
const router = express.Router();
const db = require('./db');

// Middleware for protected routes
function requireAuth(req, res, next) {
  if (!req.session.clinicId) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }
  next();
}

// POST /api/dashboard/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'USERNAME_AND_PASSWORD_REQUIRED' });
  }

  const clinic = await db.verifyDashboardCredentials(username, password);
  if (!clinic) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
  }

  // Set session
  req.session.clinicId = clinic.business_id;
  req.session.clinicName = clinic.clinic_name;
  
  res.json({ 
    success: true, 
    clinic: clinic.clinic_name,
    clinicId: clinic.business_id
  });
});

// GET /api/dashboard/logout
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// GET /api/dashboard/metrics
router.get('/metrics', requireAuth, async (req, res) => {
  const stats = await db.getDashboardMetrics(req.session.clinicId);
  res.json(stats || {
    appointments_this_week: 0,
    reminders_sent: 0,
    booking_value: 0,
    conversations_handled: 0
  });
});

// GET /api/dashboard/feed
router.get('/feed', requireAuth, async (req, res) => {
  const feed = await db.getDashboardFeed(req.session.clinicId);
  res.json(feed);
});

// GET /api/dashboard/calendar
router.get('/calendar', requireAuth, async (req, res) => {
  const calendar = await db.getDashboardCalendar(req.session.clinicId);
  res.json(calendar);
});

// Helper for frontend to check session
router.get('/me', (req, res) => {
  if (req.session.clinicId) {
    res.json({ authenticated: true, clinicName: req.session.clinicName });
  } else {
    res.json({ authenticated: false });
  }
});

module.exports = router;
