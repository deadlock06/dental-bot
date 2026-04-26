-- Step 1: Add dashboard_metrics_view
CREATE OR REPLACE VIEW dashboard_metrics_view AS
SELECT 
  c.id as clinic_id,
  (
    SELECT COUNT(*) 
    FROM appointments a 
    WHERE a.clinic_id = c.id 
      AND a.status IN ('confirmed', 'scheduled', 'completed') 
      AND a.created_at >= date_trunc('week', NOW())
  ) as appointments_this_week,
  
  (
    SELECT COUNT(*) 
    FROM appointments a 
    WHERE a.clinic_id = c.id 
      AND (a.reminder_sent_24h = true OR a.reminder_sent_1h = true OR a.follow_up_sent = true)
  ) as reminders_sent,
  
  (
    SELECT COUNT(*) * 500 
    FROM appointments a 
    WHERE a.clinic_id = c.id 
      AND a.status IN ('confirmed', 'scheduled', 'completed') 
      AND a.created_at >= date_trunc('month', NOW())
  ) as booking_value,
  
  (
    SELECT COUNT(DISTINCT a.phone) 
    FROM appointments a 
    WHERE a.clinic_id = c.id 
      AND a.created_at >= date_trunc('week', NOW())
  ) as conversations_handled
FROM clinics c;

-- Step 2: Add index on appointments(clinic_id, status)
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_status ON appointments(clinic_id, status);
