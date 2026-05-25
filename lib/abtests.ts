import { db } from "@/lib/db";

export interface AbTest {
  id: string;
  script: string;
  product_id: string;
  model_a: string;
  model_b: string;
  video_job_a?: string;
  video_job_b?: string;
  video_url_a?: string;
  video_url_b?: string;
  adset_id_a?: string;
  adset_id_b?: string;
  ad_id_a?: string;
  ad_id_b?: string;
  campaign_id?: string;
  status: string;
  roas_a?: number;
  roas_b?: number;
  winner?: string;
  started_at?: string;
  compare_after?: string;
  compared_at?: string;
  meta?: Record<string, unknown>;
  created_at?: string;
}

export async function saveAbTest(
  data: Omit<AbTest, "id" | "created_at">
): Promise<AbTest> {
  const { data: row, error } = await db
    .from("ab_tests")
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return row as AbTest;
}

export async function updateAbTest(
  id: string,
  patch: Partial<AbTest>
): Promise<AbTest> {
  const { data: row, error } = await db
    .from("ab_tests")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return row as AbTest;
}

export async function getAbTest(id: string): Promise<AbTest> {
  const { data: row, error } = await db
    .from("ab_tests")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return row as AbTest;
}

export async function listAbTests(): Promise<AbTest[]> {
  const { data, error } = await db
    .from("ab_tests")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AbTest[];
}

export async function listPendingComparisons(): Promise<AbTest[]> {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("ab_tests")
    .select("*")
    .eq("status", "running")
    .lte("compare_after", now)
    .is("compared_at", null);
  if (error) throw error;
  return (data ?? []) as AbTest[];
}
