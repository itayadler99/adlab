import { createClient } from "@supabase/supabase-js";

export const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface GeneratedVideo {
  id: string;
  job_id: string;
  status: string;
  url?: string;
  script?: string;
  product_id?: string;
  created_at: string;
}

export interface ScrapedAd {
  id: string;
  platform: string;
  advertiser: string;
  url: string;
  script?: string;
  score?: number;
  created_at: string;
}

export interface Campaign {
  id: string;
  meta_campaign_id: string;
  name: string;
  status: string;
  budget?: number;
  created_at: string;
}

export interface Draft {
  id: string;
  title: string;
  product_id?: string;
  product_title?: string;
  script: string;
  video_url?: string;
  video_job_id?: string;
  video_status: string;
  ad_account_id?: string;
  campaign_name?: string;
  budget?: number;
  status: "draft" | "approved" | "rejected" | "launched";
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
}

export async function saveVideo(data: Partial<GeneratedVideo>) {
  const { data: row, error } = await db
    .from("generated_videos")
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return row as GeneratedVideo;
}

export async function updateVideo(id: string, data: Partial<GeneratedVideo>) {
  const { data: row, error } = await db
    .from("generated_videos")
    .update(data)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return row as GeneratedVideo;
}

export async function saveAd(data: Partial<ScrapedAd>) {
  const { data: row, error } = await db
    .from("scraped_ads")
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return row as ScrapedAd;
}

export async function saveCampaign(data: Partial<Campaign>) {
  const { data: row, error } = await db
    .from("campaigns")
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return row as Campaign;
}

export async function listAll<T>(table: string): Promise<T[]> {
  const { data, error } = await db
    .from(table)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as T[];
}

// Draft-specific helpers
export async function saveDraft(data: Partial<Draft>): Promise<Draft> {
  const { data: row, error } = await db
    .from("drafts")
    .insert({ ...data, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return row as Draft;
}

export async function updateDraft(id: string, data: Partial<Draft>): Promise<Draft> {
  const { data: row, error } = await db
    .from("drafts")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return row as Draft;
}

export async function getDraft(id: string): Promise<Draft | null> {
  const { data, error } = await db
    .from("drafts")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return null;
  return data as Draft;
}

export async function listDrafts(status?: string): Promise<Draft[]> {
  let query = db.from("drafts").select("*").order("created_at", { ascending: false });
  if (status) {
    query = query.eq("status", status);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Draft[];
}
