-- Brand kit per store: logo, palette, font, default voice.
-- One row per store_id. Soft constraint — code falls back to hard-coded
-- defaults in lib/stores.ts if Supabase is unreachable.

create table if not exists brand_kits (
  store_id text primary key,
  logo_url text,
  primary_hex text,
  secondary_hex text,
  font_family text,
  font_url text,
  voice_id text,
  is_active boolean not null default true,
  updated_at timestamptz default now()
);

create index if not exists brand_kits_active_idx on brand_kits(is_active);
