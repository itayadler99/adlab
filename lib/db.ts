import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;
export function db(): SupabaseClient | null {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

export interface GeneratedVideo {
  id?: string;
  created_at?: string;
  product_title?: string;
  style?: string;
  duration?: number;
  model?: string;
  script?: string;
  visual_prompt?: string;
  cta?: string;
  replicate_id?: string;
  video_url?: string;
  status?: string;
}

export interface ScrapedAd {
  id?: string;
  created_at?: string;
  source_url?: string;
  transcript?: string;
  visual_description?: string;
  hook_score?: number;
  retention_score?: number;
  cta_score?: number;
  overall?: number;
  reasons?: string[];
  steal_this?: string[];
}

export interface Campaign {
  id?: string;
  created_at?: string;
  name?: string;
  meta_campaign_id?: string;
  meta_adset_id?: string;
  meta_creative_id?: string;
  meta_ad_id?: string;
  video_url?: string;
  daily_budget?: number;
  countries?: string[];
}

export async function saveVideo(v: GeneratedVideo) {
  const c = db(); if (!c) return null;
  const { data } = await c.from("generated_videos").insert(v).select().single();
  return data;
}

export async function updateVideo(replicate_id: string, patch: Partial<GeneratedVideo>) {
  const c = db(); if (!c) return null;
  const { data } = await c.from("generated_videos").update(patch).eq("replicate_id", replicate_id).select().single();
  return data;
}

export async function saveAd(a: ScrapedAd) {
  const c = db(); if (!c) return null;
  const { data } = await c.from("scraped_ads").insert(a).select().single();
  return data;
}

export async function saveCampaign(p: Campaign) {
  const c = db(); if (!c) return null;
  const { data } = await c.from("campaigns").insert(p).select().single();
  return data;
}

export async function listAll() {
  const c = db(); if (!c) return null;
  const [videos, ads, camps] = await Promise.all([
    c.from("generated_videos").select("*").order("created_at", { ascending: false }).limit(50),
    c.from("scraped_ads").select("*").order("created_at", { ascending: false }).limit(50),
    c.from("campaigns").select("*").order("created_at", { ascending: false }).limit(50),
  ]);
  return { videos: videos.data || [], ads: ads.data || [], campaigns: camps.data || [] };
}
