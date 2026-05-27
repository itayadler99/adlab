// Higgsfield REST client — direct HTTP, no MCP from Vercel functions (the
// MCP server intermittently fails to reach Vercel edge). The MCP schema is
// still useful as a reference for which fields each endpoint expects.
//
// Two endpoints we use:
//   1. List/train "Souls" (character avatars). One Soul ID can be reused
//      across many UGC ads — Arcads-grade actor consistency.
//   2. virality_predictor — score a draft video before launch. <40 triggers
//      a hook regeneration upstream.
//
// All calls return null on failure so the caller can fall back.
//
// Supabase mirror: when Higgsfield is unreachable, we cache the latest Soul
// list in Supabase so the picker still renders something usable.

import { db } from "./db";

const BASE = process.env.HIGGSFIELD_API_URL || "";
const KEY = process.env.HIGGSFIELD_API_KEY || "";

function authHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}),
  };
}

export interface Soul {
  id: string;
  name: string;
  thumbnailUrl: string;
  gender?: string;
  style?: string;
  /** Whether the soul was trained from user photos (vs. preset). */
  trained?: boolean;
}

export interface ViralityPrediction {
  score: number; // 0-100
  hookStrength?: number;
  retentionRisk?: number;
  reasons: string[];
  /** Raw provider payload — kept for debugging. */
  raw?: unknown;
}

export async function listSouls(): Promise<Soul[]> {
  if (!BASE || !KEY) return readCachedSouls();
  try {
    const res = await fetch(`${BASE}/v1/souls`, {
      headers: authHeaders(),
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      console.warn(`[higgsfield] listSouls ${res.status}`);
      return readCachedSouls();
    }
    const json = (await res.json()) as { souls?: Array<Record<string, unknown>> };
    const souls: Soul[] = (json.souls ?? []).map((s) => ({
      id: String(s.id),
      name: String(s.name ?? s.id),
      thumbnailUrl: String(s.thumbnail_url ?? s.thumbnailUrl ?? ""),
      gender: typeof s.gender === "string" ? s.gender : undefined,
      style: typeof s.style === "string" ? s.style : undefined,
      trained: Boolean(s.trained),
    }));
    await cacheSouls(souls);
    return souls;
  } catch (e) {
    console.warn(`[higgsfield] listSouls error: ${e instanceof Error ? e.message : e}`);
    return readCachedSouls();
  }
}

export async function trainSoul(args: {
  name: string;
  photoUrls: string[];
  gender?: string;
}): Promise<Soul | null> {
  if (!BASE || !KEY) return null;
  try {
    const res = await fetch(`${BASE}/v1/souls/train`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        name: args.name,
        photos: args.photoUrls,
        gender: args.gender,
      }),
    });
    if (!res.ok) {
      console.warn(`[higgsfield] trainSoul ${res.status}`);
      return null;
    }
    const json = (await res.json()) as Record<string, unknown>;
    return {
      id: String(json.id),
      name: String(json.name ?? args.name),
      thumbnailUrl: String(json.thumbnail_url ?? ""),
      gender: args.gender,
      trained: true,
    };
  } catch {
    return null;
  }
}

/**
 * Render a UGC frame using a pre-trained Soul. Returns the rendered image
 * URL or null on failure (the caller falls back to flux-pro at the UGC
 * actor stage). Hot path — wrap in try/catch upstream.
 */
export async function renderSoulFrame(args: {
  soulId: string;
  prompt: string;
  aspectRatio?: "9:16" | "16:9" | "1:1";
}): Promise<string | null> {
  if (!BASE || !KEY) return null;
  try {
    const res = await fetch(`${BASE}/v1/souls/${encodeURIComponent(args.soulId)}/render`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        prompt: args.prompt,
        aspect_ratio: args.aspectRatio || "9:16",
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { image_url?: string; url?: string };
    return json.image_url || json.url || null;
  } catch {
    return null;
  }
}

/**
 * virality_predictor — score a draft video 0-100. Pre-launch gate: <40 ⇒
 * caller regenerates the hook and retries. Falls back to a neutral 50 if
 * the API is unreachable so we never block launches on a flaky upstream.
 */
export async function predictVirality(videoUrl: string): Promise<ViralityPrediction> {
  if (!BASE || !KEY) {
    return { score: 50, reasons: ["virality predictor not configured"], raw: null };
  }
  try {
    const res = await fetch(`${BASE}/v1/virality/predict`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ video_url: videoUrl }),
    });
    if (!res.ok) {
      return { score: 50, reasons: [`virality predictor ${res.status}`], raw: null };
    }
    const json = (await res.json()) as {
      score?: number;
      hook_strength?: number;
      retention_risk?: number;
      reasons?: string[];
    };
    const score = typeof json.score === "number" ? Math.max(0, Math.min(100, json.score)) : 50;
    return {
      score,
      hookStrength: json.hook_strength,
      retentionRisk: json.retention_risk,
      reasons: Array.isArray(json.reasons) ? json.reasons : [],
      raw: json,
    };
  } catch (e) {
    return {
      score: 50,
      reasons: [`virality predictor error: ${e instanceof Error ? e.message : e}`],
      raw: null,
    };
  }
}

// --- Supabase mirror cache (fallback for picker when Higgsfield down) -----

const SOUL_CACHE_TABLE = "soul_library_cache";

async function cacheSouls(souls: Soul[]): Promise<void> {
  if (!db) return;
  try {
    await db.from(SOUL_CACHE_TABLE).upsert(
      {
        id: "default",
        souls,
        cached_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
  } catch {
    /* cache is best-effort */
  }
}

async function readCachedSouls(): Promise<Soul[]> {
  if (!db) return [];
  try {
    const { data } = await db
      .from(SOUL_CACHE_TABLE)
      .select("souls")
      .eq("id", "default")
      .maybeSingle();
    if (data?.souls && Array.isArray(data.souls)) return data.souls as Soul[];
  } catch {
    /* ignore */
  }
  return [];
}
