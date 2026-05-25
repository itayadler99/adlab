-- AdLab v0.2 schema. Run once in Supabase SQL editor.

create table if not exists generated_videos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  product_title text,
  style text,
  duration int,
  model text,
  script text,
  visual_prompt text,
  cta text,
  replicate_id text unique,
  video_url text,
  status text
);

create table if not exists scraped_ads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  source_url text,
  transcript text,
  visual_description text,
  hook_score int,
  retention_score int,
  cta_score int,
  overall int,
  reasons text[],
  steal_this text[]
);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  name text,
  meta_campaign_id text,
  meta_adset_id text,
  meta_creative_id text,
  meta_ad_id text,
  video_url text,
  daily_budget int,
  countries text[]
);

create index if not exists idx_videos_created on generated_videos(created_at desc);
create index if not exists idx_ads_overall on scraped_ads(overall desc);
create index if not exists idx_campaigns_created on campaigns(created_at desc);
