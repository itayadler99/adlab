-- Audit log for the daily campaign ROAS scan (lib/learn.ts -> persistScan()).
-- Optional: the scan degrades gracefully and skips logging when this table is
-- absent or Supabase is unconfigured.

create table if not exists roas_scan_log (
  id uuid primary key default gen_random_uuid(),
  scanned integer not null default 0,
  winners jsonb,
  promising jsonb,
  kill_candidates jsonb,
  config jsonb,
  created_at timestamptz not null default now()
);

create index if not exists roas_scan_log_created_at_idx on roas_scan_log (created_at desc);
