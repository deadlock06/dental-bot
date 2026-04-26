-- Step 1: Update dashboard_metrics_view with Honest Revenue Math
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
    SELECT SUM(CASE 
      WHEN a.treatment = 'Cleaning & Polishing' THEN 150
      WHEN a.treatment = 'Fillings' THEN 300
      WHEN a.treatment = 'Teeth Whitening' THEN 800
      WHEN a.treatment = 'Extraction' THEN 400
      WHEN a.treatment = 'Root Canal' THEN 1200
      WHEN a.treatment = 'Braces & Orthodontics' THEN 2000
      WHEN a.treatment = 'Dental Implants' THEN 5000
      ELSE 300 -- Fallback for "Other" or unknown
    END)
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

-- Step 2: Ensure index exists
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_status ON appointments(clinic_id, status);
