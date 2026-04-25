-- Phase 2: Qudozen Empire Architecture Updates

-- 1. Add Industry tracking to support multiple verticals (Dental, Real Estate, Enterprise)
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS industry VARCHAR(50) DEFAULT 'dental';
ALTER TABLE growth_leads_v2 ADD COLUMN IF NOT EXISTS industry VARCHAR(50) DEFAULT 'dental';
ALTER TABLE gs_leads ADD COLUMN IF NOT EXISTS industry VARCHAR(50) DEFAULT 'dental';

-- 2. Create Explicit Lead Lifecycle Event Tracking
CREATE TABLE IF NOT EXISTS gs_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID REFERENCES gs_leads(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- 'SCOUTED', 'CONTACTED', 'REPLIED', 'QUALIFIED', 'HANDOFF', 'CLOSED'
    old_state VARCHAR(50),
    new_state VARCHAR(50),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast event lookups
CREATE INDEX IF NOT EXISTS idx_gs_events_lead_id ON gs_events(lead_id);
