-- ════════════════════════════════════════════════════
-- QUDOZEN AOS — FULL UNIFIED DATABASE SETUP
-- ════════════════════════════════════════════════════
-- Instructions: 
-- 1. Go to Supabase SQL Editor -> New Query
-- 2. Paste this entire file
-- 3. Click "Run" -> "Run without RLS"
-- ════════════════════════════════════════════════════

-- ── 1. Patients (dental bot) ────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
  phone         TEXT PRIMARY KEY,
  language      TEXT,
  current_flow  TEXT,
  flow_step     INT DEFAULT 0,
  flow_data     JSONB DEFAULT '{}',
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ── 2. Clinics ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinics (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  whatsapp_number  TEXT UNIQUE NOT NULL,
  name             TEXT,
  name_ar          TEXT,
  location         TEXT,
  maps_link        TEXT,
  review_link      TEXT,
  staff_phone      TEXT,
  plan             TEXT DEFAULT 'basic',
  vertical         TEXT DEFAULT 'dental',
  services         JSONB DEFAULT '[]',
  config           JSONB DEFAULT '{}',
  doctors          JSONB DEFAULT '[]',
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- ── 3. Appointments ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone               TEXT NOT NULL,
  clinic_id           UUID REFERENCES clinics(id),
  name                TEXT,
  treatment           TEXT,
  description         TEXT DEFAULT '',
  preferred_date      TEXT,
  preferred_date_iso  DATE,
  time_slot           TEXT,
  doctor_id           TEXT,
  doctor_name         TEXT,
  status              TEXT DEFAULT 'confirmed',
  reminder_sent_24h   BOOLEAN DEFAULT false,
  reminder_sent_1h    BOOLEAN DEFAULT false,
  follow_up_sent      BOOLEAN DEFAULT false,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointments_phone     ON appointments(phone);
CREATE INDEX IF NOT EXISTS idx_appointments_status    ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_date_iso  ON appointments(preferred_date_iso);
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_id ON appointments(clinic_id);

-- ── 4. Doctor Schedules ─────────────────────────────────
CREATE TABLE IF NOT EXISTS doctor_schedules (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id        UUID REFERENCES clinics(id),
  doctor_id        TEXT NOT NULL,
  doctor_name      TEXT,
  specialization   TEXT,
  specialization_ar TEXT,
  is_active        BOOLEAN DEFAULT true,
  working_days     JSONB DEFAULT '[]',
  time_slots       JSONB DEFAULT '[]',
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- ── 5. Doctor Slots ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS doctor_slots (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id      UUID REFERENCES clinics(id),
  doctor_id      TEXT NOT NULL,
  slot_date      DATE NOT NULL,
  slot_time      TEXT NOT NULL,
  capacity       INT DEFAULT 1,
  available      INT DEFAULT 1,
  booked         INT DEFAULT 0,
  status         TEXT DEFAULT 'available',
  patient_phone  TEXT,
  appointment_id UUID,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_slots_clinic_doctor_date
  ON doctor_slots(clinic_id, doctor_id, slot_date);

-- ── 6. Growth Leads V2 (Growth Swarm) ───────────────────
CREATE TABLE IF NOT EXISTS growth_leads_v2 (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Raw + parsed data
  raw_input             TEXT,
  phone                 TEXT UNIQUE NOT NULL,
  name                  TEXT,
  business_name         TEXT,
  city                  TEXT,
  vertical              TEXT DEFAULT 'dental',
  country               TEXT DEFAULT 'SA',
  sources               TEXT[] DEFAULT '{}',

  -- Verification
  website_found         BOOLEAN DEFAULT false,
  website_url           TEXT,
  website_owner_name    TEXT,
  phone_type            TEXT,
  confidence_score      INT DEFAULT 0,
  is_owner_verified     BOOLEAN DEFAULT false,

  -- Pain / Timing
  pain_signal           TEXT,
  pain_details          TEXT,
  timing_score          INT DEFAULT 0,
  posted_at             TIMESTAMPTZ,

  -- Outreach
  status                TEXT DEFAULT 'pending',
  last_message_sent     TEXT,
  last_contacted_at     TIMESTAMPTZ,
  whatsapp_provider     TEXT DEFAULT 'twilio',
  message_count         INT DEFAULT 0,
  manually_approved     BOOLEAN DEFAULT false,
  last_error            TEXT,

  -- Lifecycle timestamps
  first_contacted_at    TIMESTAMPTZ,
  replied_at            TIMESTAMPTZ,
  handed_off_at         TIMESTAMPTZ,
  opted_out_at          TIMESTAMPTZ,

  -- Stripe
  stripe_session_id     TEXT,
  stripe_customer_email TEXT,
  paid_at               TIMESTAMPTZ,

  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_growth_phone  ON growth_leads_v2(phone);
CREATE INDEX IF NOT EXISTS idx_growth_status ON growth_leads_v2(status);
CREATE INDEX IF NOT EXISTS idx_growth_score  ON growth_leads_v2(confidence_score DESC);

-- ── 7. Message Logs (delivery tracking) ─────────────────
CREATE TABLE IF NOT EXISTS message_logs (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_sid      TEXT UNIQUE NOT NULL,
  to_phone         TEXT NOT NULL,
  from_phone       TEXT,
  body             TEXT,
  direction        TEXT DEFAULT 'outbound',
  status           TEXT DEFAULT 'sent',
  error_code       TEXT,
  error_message    TEXT,
  source           TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_logs_to_phone    ON message_logs(to_phone);
CREATE INDEX IF NOT EXISTS idx_message_logs_status      ON message_logs(status);
CREATE INDEX IF NOT EXISTS idx_message_logs_message_sid ON message_logs(message_sid);

-- ── 8. GS Leads (4D-scored, pain-aware lead profiles) ───
CREATE TABLE IF NOT EXISTS gs_leads (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id           UUID,
  source                TEXT,

  -- Company identity
  company_name          TEXT NOT NULL,
  owner_name            TEXT,
  phone                 TEXT,
  phone_type            TEXT,
  whatsapp_detected     BOOLEAN DEFAULT false,
  email                 TEXT,
  website               TEXT,
  domain                TEXT,
  address               TEXT,
  city                  TEXT,
  state                 TEXT,
  country               TEXT DEFAULT 'SA',

  -- Google presence
  google_rating         DECIMAL,
  google_review_count   INT,

  -- Business profile
  industry              TEXT,
  employee_count        TEXT,

  -- Pain signal intelligence
  pain_signals          JSONB DEFAULT '[]',
  is_hiring             BOOLEAN DEFAULT false,
  hiring_roles          TEXT[],
  hiring_posted_days_ago INT,
  has_negative_reviews  BOOLEAN DEFAULT false,
  negative_review_themes TEXT[],
  has_booking_system    BOOLEAN DEFAULT false,
  website_last_updated  DATE,

  -- Social presence
  instagram_handle      TEXT,
  instagram_last_post_date DATE,
  facebook_page         TEXT,

  -- 4D scoring engine
  fit_score             INT DEFAULT 0,
  pain_score            INT DEFAULT 0,
  timing_score          INT DEFAULT 0,
  reachability_score    INT DEFAULT 0,
  total_score           INT DEFAULT 0,
  score_explanation     TEXT,

  -- Status & lifecycle
  priority              TEXT DEFAULT 'cold',
  status                TEXT DEFAULT 'new',
  approval_status       TEXT DEFAULT 'pending',
  conversation_state    TEXT DEFAULT 'INITIAL',
  qualification_step    INT DEFAULT 0,
  last_contacted_at     TIMESTAMPTZ,
  last_replied_at       TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gs_leads_phone       ON gs_leads(phone);
CREATE INDEX IF NOT EXISTS idx_gs_leads_domain      ON gs_leads(domain);
CREATE INDEX IF NOT EXISTS idx_gs_leads_total_score ON gs_leads(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_gs_leads_priority    ON gs_leads(priority);
CREATE INDEX IF NOT EXISTS idx_gs_leads_status      ON gs_leads(status);
CREATE INDEX IF NOT EXISTS idx_gs_leads_campaign    ON gs_leads(campaign_id);

-- ── 9. GS Conversations (multi-channel message log) ────
CREATE TABLE IF NOT EXISTS gs_conversations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           UUID REFERENCES gs_leads(id) ON DELETE CASCADE,
  campaign_id       UUID,
  channel           TEXT,
  direction         TEXT,
  message_text      TEXT,
  status            TEXT DEFAULT 'pending',
  twilio_sid        TEXT,
  ai_generated      BOOLEAN DEFAULT true,
  human_reviewed    BOOLEAN DEFAULT false,
  scheduled_for     TIMESTAMPTZ,
  sent_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gs_conv_lead     ON gs_conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_gs_conv_status   ON gs_conversations(status);
CREATE INDEX IF NOT EXISTS idx_gs_conv_campaign ON gs_conversations(campaign_id);

-- ── 10. GS Sequences (drip nurture automation) ──────────
CREATE TABLE IF NOT EXISTS gs_sequences (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           UUID REFERENCES gs_leads(id) ON DELETE CASCADE,
  sequence_type     TEXT,
  current_step      INT DEFAULT 0,
  total_steps       INT DEFAULT 0,
  next_send_at      TIMESTAMPTZ,
  is_paused         BOOLEAN DEFAULT false,
  is_completed      BOOLEAN DEFAULT false,
  whatsapp_sent     INT DEFAULT 0,
  replies           INT DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gs_seq_lead       ON gs_sequences(lead_id);
CREATE INDEX IF NOT EXISTS idx_gs_seq_next_send  ON gs_sequences(next_send_at);
CREATE INDEX IF NOT EXISTS idx_gs_seq_completed  ON gs_sequences(is_completed);

-- ── 11. GS Campaigns (outreach campaign management) ─────
CREATE TABLE IF NOT EXISTS gs_campaigns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  target_industry   TEXT,
  target_city       TEXT,
  target_state      TEXT,
  status            TEXT DEFAULT 'draft',
  max_leads         INT DEFAULT 500,
  leads_found       INT DEFAULT 0,
  leads_approved    INT DEFAULT 0,
  outreach_sent     INT DEFAULT 0,
  replies_received  INT DEFAULT 0,
  meetings_booked   INT DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gs_camp_status ON gs_campaigns(status);

-- ── 12. GS Feedback (AI improvement loop) ───────────────
CREATE TABLE IF NOT EXISTS gs_feedback (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id               UUID REFERENCES gs_leads(id) ON DELETE CASCADE,
  feedback_type         TEXT,
  ai_output             TEXT,
  rating                INT,
  correct               BOOLEAN,
  human_correction      TEXT,
  improvement_applied   BOOLEAN DEFAULT false,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gs_feedback_lead ON gs_feedback(lead_id);
CREATE INDEX IF NOT EXISTS idx_gs_feedback_type ON gs_feedback(feedback_type);

-- ── 13. Onboarding State Tracking ─────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES clinics(id),
  clinic_name TEXT NOT NULL,
  owner_name TEXT,
  owner_phone TEXT NOT NULL,
  current_state TEXT DEFAULT 'activation_requested',
  lang TEXT DEFAULT 'en',
  
  -- Day 0 checkpoints
  calendar_connected BOOLEAN DEFAULT false,
  calendar_id TEXT,
  dashboard_credentials_sent BOOLEAN DEFAULT false,
  dashboard_username TEXT,
  dashboard_password TEXT,
  leads_gifted INT DEFAULT 0,
  
  -- Sequence tracking
  last_sequence_sent TIMESTAMPTZ,
  sequence_day INT DEFAULT 0,
  
  -- Human handoff
  jake_notified BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_phone ON onboarding_states(owner_phone);
CREATE INDEX IF NOT EXISTS idx_onboarding_state ON onboarding_states(current_state);

-- ── 14. Onboarding Logs ───────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id UUID REFERENCES onboarding_states(id),
  day INT,
  message_type TEXT, 
  content TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered BOOLEAN DEFAULT false
);

-- ── 15. Cron Jobs ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cron_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id UUID REFERENCES onboarding_states(id),
  run_at TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL,
  executed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cron_jobs_run_at ON cron_jobs(run_at);
CREATE INDEX IF NOT EXISTS idx_cron_jobs_executed ON cron_jobs(executed);

-- ── 16. Growth Conversations (Phase 7) ────────────────────
CREATE TABLE IF NOT EXISTS growth_conversations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           UUID REFERENCES growth_leads_v2(id),
  business_id       UUID REFERENCES clinics(id),
  channel           TEXT DEFAULT 'whatsapp',
  direction         TEXT NOT NULL,
  content           TEXT NOT NULL,
  intent_classified TEXT,
  auto_replied      BOOLEAN DEFAULT false,
  human_escalated   BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_growth_inbound_unprocessed 
ON growth_conversations(lead_id, created_at) 
WHERE direction = 'inbound' AND auto_replied = false;

-- ── 17. GS Events (Phase 7 Fix) ───────────────────────────
CREATE TABLE IF NOT EXISTS gs_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID REFERENCES gs_leads(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  old_state   TEXT,
  new_state   TEXT,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gs_events_lead    ON gs_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_gs_events_type    ON gs_events(event_type);
CREATE INDEX IF NOT EXISTS idx_gs_events_created ON gs_events(created_at DESC);

-- ── 18. Atomic Appointment Booking (Phase 5) ──────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_appointment 
ON appointments (clinic_id, doctor_name, preferred_date_iso, time_slot) 
WHERE status != 'cancelled';

CREATE OR REPLACE FUNCTION book_slot_atomic(
  p_clinic_id UUID,
  p_doctor_name TEXT,
  p_preferred_date_iso DATE,
  p_time_slot TEXT,
  p_phone TEXT,
  p_name TEXT,
  p_treatment TEXT
) RETURNS json AS $$
DECLARE
  v_appointment_id UUID;
BEGIN
  BEGIN
    INSERT INTO appointments (
      clinic_id, phone, name, doctor_name, 
      preferred_date_iso, time_slot, treatment, status
    ) VALUES (
      p_clinic_id, p_phone, p_name, p_doctor_name,
      p_preferred_date_iso, p_time_slot, p_treatment, 'confirmed'
    )
    RETURNING id INTO v_appointment_id;

    RETURN json_build_object('success', true, 'appointment_id', v_appointment_id);
    
  EXCEPTION WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'message', 'Slot already taken');
  END;
END;
$$ LANGUAGE plpgsql;

-- ── 19. Dashboard Metrics View (Phase 6) ──────────────────
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
      WHEN a.treatment = 'Fillings'             THEN 300
      WHEN a.treatment = 'Teeth Whitening'      THEN 800
      WHEN a.treatment = 'Extraction'           THEN 400
      WHEN a.treatment = 'Root Canal'           THEN 1200
      WHEN a.treatment = 'Braces & Orthodontics' THEN 2000
      WHEN a.treatment = 'Dental Implants'      THEN 5000
      ELSE 300
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

CREATE INDEX IF NOT EXISTS idx_appointments_clinic_status 
ON appointments(clinic_id, status);

-- ════════════════════════════════════════════════════
-- END OF UNIFIED SCHEMA
-- ════════════════════════════════════════════════════
