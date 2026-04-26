-- Phase 7: Autonomous Growth Swarm

-- Track outbound growth conversations
CREATE TABLE IF NOT EXISTS growth_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES growth_leads_v2(id),
  business_id UUID REFERENCES clinics(id),
  channel TEXT DEFAULT 'whatsapp', -- whatsapp | email | linkedin
  direction TEXT NOT NULL, -- outbound | inbound
  content TEXT NOT NULL,
  intent_classified TEXT, -- not_interested | pricing | simulator | objection | hot_lead | unclear
  auto_replied BOOLEAN DEFAULT false,
  human_escalated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast retrieval of unprocessed replies
CREATE INDEX IF NOT EXISTS idx_growth_inbound_unprocessed 
ON growth_conversations(lead_id, created_at) 
WHERE direction = 'inbound' AND auto_replied = false;
