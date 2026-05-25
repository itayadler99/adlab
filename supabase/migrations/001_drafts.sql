-- Drafts table for approval workflow
CREATE TABLE IF NOT EXISTS drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  product_id TEXT,
  product_title TEXT,
  script TEXT NOT NULL,
  video_url TEXT,
  video_job_id TEXT,
  video_status TEXT DEFAULT 'pending',
  ad_account_id TEXT,
  campaign_name TEXT,
  budget NUMERIC,
  status TEXT NOT NULL DEFAULT 'draft',
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS drafts_status_idx ON drafts(status);
CREATE INDEX IF NOT EXISTS drafts_created_at_idx ON drafts(created_at DESC);
