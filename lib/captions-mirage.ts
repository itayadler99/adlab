// Captions Mirage premium routing — when `mode: "premium"` is set on a UGC
// request, we bypass our 5-stage pipeline (actor → composite → animate →
// tts → lipsync) and submit the entire script + product image to the
// Captions Mirage API, which returns a single ready-to-launch MP4.
//
// Feature flag: requires CAPTIONS_MIRAGE_API_KEY. When unset, callers fall
// through to the standard pipeline.
//
// The Captions API surface mirrors their public docs; we keep field names
// stable so the request adapter is a one-liner if they version-bump.

export interface CaptionsMirageRequest {
  productTitle: string;
  productDescription?: string;
  productImageUrl?: string;
  script: string;
  hook: string;
  language?: "en" | "he";
  /** Soul/actor preference forwarded to Mirage's actor selector. */
  voiceArchetype?: string;
  /** Duration hint in seconds. Mirage picks the closest preset. */
  durationSec?: number;
}

export interface CaptionsMirageResult {
  videoUrl: string;
  jobId?: string;
  durationSec?: number;
  /** Raw response for debugging. */
  raw?: unknown;
}

const BASE = process.env.CAPTIONS_MIRAGE_API_URL || "https://api.captions.ai/v1";
const KEY = process.env.CAPTIONS_MIRAGE_API_KEY || "";

export function isPremiumEnabled(): boolean {
  return Boolean(KEY);
}

function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${KEY}`,
  };
}

/**
 * Submit a Mirage job and poll until completion. Mirage usually returns
 * within ~3 minutes; we cap at 8 minutes to stay under typical Vercel
 * function ceilings.
 */
export async function generateMiragePremium(
  req: CaptionsMirageRequest
): Promise<CaptionsMirageResult> {
  if (!isPremiumEnabled()) {
    throw new Error("CAPTIONS_MIRAGE_API_KEY not set");
  }

  const submitRes = await fetch(`${BASE}/mirage/jobs`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      product_title: req.productTitle,
      product_description: req.productDescription,
      product_image_url: req.productImageUrl,
      script: req.script,
      hook: req.hook,
      language: req.language || "en",
      voice_archetype: req.voiceArchetype,
      duration_seconds: req.durationSec ?? 15,
    }),
  });

  if (!submitRes.ok) {
    const body = await submitRes.text();
    throw new Error(`mirage submit failed ${submitRes.status}: ${body.slice(0, 300)}`);
  }
  const submitJson = (await submitRes.json()) as { id?: string; job_id?: string };
  const jobId = submitJson.id || submitJson.job_id;
  if (!jobId) throw new Error("mirage submit returned no job id");

  // Poll until ready. Cap at 8 minutes (96 ticks × 5s).
  const start = Date.now();
  while (Date.now() - start < 8 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 5000));
    const pollRes = await fetch(`${BASE}/mirage/jobs/${encodeURIComponent(jobId)}`, {
      headers: headers(),
    });
    if (!pollRes.ok) continue;
    const job = (await pollRes.json()) as {
      status?: string;
      video_url?: string;
      duration_seconds?: number;
      error?: string;
    };
    if (job.status === "succeeded" && job.video_url) {
      return {
        videoUrl: job.video_url,
        jobId,
        durationSec: job.duration_seconds,
        raw: job,
      };
    }
    if (job.status === "failed") {
      throw new Error(`mirage job failed: ${job.error || "unknown"}`);
    }
  }
  throw new Error("mirage poll timed out after 8 minutes");
}
