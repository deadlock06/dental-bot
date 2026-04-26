-- ═══════════════════════════════════════════════════════════════
-- CRITICAL FIX: gs_events table
-- Called by handoff.js:112 on every hot lead escalation.
-- Without this table, all hot lead escalations throw a 404 silently.
-- Run this in Supabase SQL Editor immediately.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gs_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID REFERENCES gs_leads(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,  -- HANDOFF | OPT_OUT | REPLY | SEQUENCE_STEP | PAYMENT
  old_state   TEXT,
  new_state   TEXT,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gs_events_lead     ON gs_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_gs_events_type     ON gs_events(event_type);
CREATE INDEX IF NOT EXISTS idx_gs_events_created  ON gs_events(created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- VERIFY all Phase 5, 6, 7 scripts ran
-- Run each SELECT. If it errors, the SQL script was never applied.
-- ═══════════════════════════════════════════════════════════════

-- Verify Phase 5: atomic lock RPC exists
SELECT routine_name FROM information_schema.routines 
WHERE routine_name = 'book_slot_atomic';
-- Expected: 1 row. If 0 rows → run scripts/atomic_lock.sql NOW.

-- Verify Phase 6: dashboard metrics view exists
SELECT viewname FROM pg_views WHERE viewname = 'dashboard_metrics_view';
-- Expected: 1 row. If 0 rows → run scripts/phase6_dashboard.sql NOW.

-- Verify Phase 7: growth_conversations table exists
SELECT tablename FROM pg_tables WHERE tablename = 'growth_conversations';
-- Expected: 1 row. If 0 rows → run scripts/phase7_swarm.sql NOW.

-- Verify this fix: gs_events table just created
SELECT tablename FROM pg_tables WHERE tablename = 'gs_events';
-- Expected: 1 row.

-- Verify partial unique index for atomic booking (Phase 5)
SELECT indexname FROM pg_indexes 
WHERE tablename = 'appointments' 
AND indexname = 'idx_active_appointment_slot';
-- Expected: 1 row. If 0 rows → run scripts/atomic_lock.sql NOW.
