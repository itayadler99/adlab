-- Variant performance ledger — one row per ad variant we've launched on Meta.
-- The daily learn cron writes rows here from Meta insights; the script
-- generator reads aggregate winners to bias future hooks.

create table if not exists variant_perf (
  id uuid primary key default gen_random_uuid(),
  variant_id text not null,
  hook_archetype text,         -- e.g. "curiosity", "social_proof", "fomo"
  actor_archetype text,        -- e.g. "rapper_male", "young_woman_excited"
  vertical text,               -- e.g. "jewelry", "sneakers", "saas"
  ctr numeric,
  roas numeric,
  spend numeric,
  impressions numeric,
  meta_ad_id text,
  is_winner boolean default false,
  manually_marked boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists variant_perf_vertical_idx on variant_perf(vertical);
create index if not exists variant_perf_archetype_idx on variant_perf(hook_archetype, actor_archetype);
create index if not exists variant_perf_winner_idx on variant_perf(is_winner) where is_winner = true;
