-- ════════════════════════════════════════════════════
-- DENTAL BOT + GROWTH SWARM — SUPABASE SCHEMA
-- Run this in Supabase SQL Editor before first deploy
-- ════════════════════════════════════════════════════

-- ── Patients (dental bot) ────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
  phone         TEXT PRIMARY KEY,
  language      TEXT,
  current_flow  TEXT,
  flow_step     INT DEFAULT 0,
  flow_data     JSONB DEFAULT '{}',
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ── Clinics ──────────────────────────────────────────
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
  config           JSONB DEFAULT '{}',
  doctors          JSONB DEFAULT '[]',
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- ── Appointments ─────────────────────────────────────
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

-- ── Doctor Schedules ─────────────────────────────────
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

-- ── Doctor Slots ─────────────────────────────────────
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

-- ── Growth Leads V2 (Growth Swarm) ───────────────────
CREATE TABLE IF NOT EXISTS growth_leads_v2 (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Raw + extracted data
  raw_input             TEXT,
  extracted_phone       TEXT UNIQUE NOT NULL,
  extracted_name        TEXT,
  extracted_city        TEXT,
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
  message_sent          TEXT,
  message_sent_at       TIMESTAMPTZ,
  whatsapp_provider     TEXT DEFAULT 'twilio',
  message_count         INT DEFAULT 0,
  manually_approved     BOOLEAN DEFAULT false,
  last_error            TEXT,

  -- Lifecycle timestamps
  first_contacted_at    TIMESTAMPTZ,
  last_contacted_at     TIMESTAMPTZ,
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

CREATE INDEX IF NOT EXISTS idx_growth_phone  ON growth_leads_v2(extracted_phone);
CREATE INDEX IF NOT EXISTS idx_growth_status ON growth_leads_v2(status);
CREATE INDEX IF NOT EXISTS idx_growth_score  ON growth_leads_v2(confidence_score DESC);
