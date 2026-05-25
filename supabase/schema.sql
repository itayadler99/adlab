-- AdLab schema

create extension if not exists "uuid-ossp";

create table if not exists ads (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  user_id text,
  product_url text,
  product_name text,
  product_description text,
  script text,
  video_url text,
  thumbnail_url text,
  prediction_id text,
  status text default 'pending',
  platform text,
  launched_at timestamptz,
  meta_ad_id text,
  meta_campaign_id text,
  meta_adset_id text,
  spy_source text,
  spy_data jsonb
);

alter table ads add column if not exists thumbnail_url text;

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists ads_updated_at on ads;
create trigger ads_updated_at
  before update on ads
  for each row execute function update_updated_at();

create index if not exists ads_user_id_idx on ads(user_id);
create index if not exists ads_status_idx on ads(status);
create index if not exists ads_prediction_id_idx on ads(prediction_id);
