import Replicate from "replicate";
import * as falLib from "./fal";

// Frontier video models. FAL-hosted models marked (FAL); rest run on Replicate.
export type VideoModel =
  | "sora-2-pro"        // (Replicate) OpenAI Sora 2 Pro — top realism
  | "veo-3.1"           // (FAL) Google Veo 3.1 — frontier, 8s
  | "veo-3.1-fast"      // (FAL) Veo 3.1 Fast — cheaper, 8s
  | "kling-3.0"         // (FAL) Kling 3 Pro — frontier UGC, up to 15s
  | "seedance-2.0"      // (FAL) Bytedance Seedance 2.0 — strong motion
  | "veo-3.1-i2v"       // (FAL) Veo 3.1 image-to-video
  | "veo-3.1-fast-i2v"  // (FAL) Veo 3.1 Fast image-to-video — UGC default
  | "kling-3.0-i2v"     // (FAL) Kling 3 Pro image-to-video
  | "veo-3"             // (Replicate) legacy Veo 3, 8s
  | "veo-3-fast"        // (Replicate) legacy Veo 3 Fast, 8s
  | "kling-2.1"         // (Replicate) Kling 2.1
  | "kling-1.6"         // (Replicate) Kling 1.6 standard
  | "hailuo-02"         // (Replicate) MiniMax Hailuo 02
  | "seedance-1.0"      // (Replicate) Seedance 1
  | "minimax";          // (Replicate) legacy minimax/video-01

export type VideoProvider = "fal" | "replicate";

interface ModelSpec {
  provider: VideoProvider;
  endpoint: string; // FAL endpoint slug OR Replicate model slug "owner/name"
  maxSeconds: number;
}

const REGISTRY: Record<VideoModel, ModelSpec> = {
  "sora-2-pro":        { provider: "replicate", endpoint: "openai/sora-2-pro",                            maxSeconds: 10 },
  "veo-3.1":           { provider: "fal",       endpoint: "fal-ai/veo3.1",                                maxSeconds: 8  },
  "veo-3.1-fast":      { provider: "fal",       endpoint: "fal-ai/veo3.1/fast",                           maxSeconds: 8  },
  "kling-3.0":         { provider: "fal",       endpoint: "fal-ai/kling-video/v3/pro/text-to-video",      maxSeconds: 15 },
  "seedance-2.0":      { provider: "fal",       endpoint: "fal-ai/bytedance/seedance-2.0/text-to-video",  maxSeconds: 10 },
  "veo-3.1-i2v":       { provider: "fal",       endpoint: "fal-ai/veo3.1/image-to-video",                 maxSeconds: 8  },
  "veo-3.1-fast-i2v":  { provider: "fal",       endpoint: "fal-ai/veo3.1/fast/image-to-video",            maxSeconds: 8  },
  "kling-3.0-i2v":     { provider: "fal",       endpoint: "fal-ai/kling-video/v3/pro/image-to-video",     maxSeconds: 10 },
  "veo-3":             { provider: "replicate", endpoint: "google/veo-3",                                 maxSeconds: 8  },
  "veo-3-fast":        { provider: "replicate", endpoint: "google/veo-3-fast",                            maxSeconds: 8  },
  "kling-2.1":         { provider: "replicate", endpoint: "kwaivgi/kling-v2.1-master",                    maxSeconds: 10 },
  "kling-1.6":         { provider: "replicate", endpoint: "kwaivgi/kling-v1.6-standard",                  maxSeconds: 10 },
  "hailuo-02":         { provider: "replicate", endpoint: "minimax/hailuo-02",                            maxSeconds: 10 },
  "seedance-1.0":      { provider: "replicate", endpoint: "bytedance/seedance-1-pro",                     maxSeconds: 10 },
  "minimax":           { provider: "replicate", endpoint: "minimax/video-01",                             maxSeconds: 6  },
};

export function getProvider(model: VideoModel): VideoProvider {
  return REGISTRY[model].provider;
}

export interface VideoJob {
  id: string;
  model: VideoModel;
  status: "pending" | "processing" | "succeeded" | "failed";
  videoUrl?: string;
  error?: string;
}

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

interface StartOpts {
  duration?: number; // seconds, model-dependent
  aspectRatio?: "16:9" | "9:16" | "1:1";
  resolution?: "720p" | "1080p";
  imageUrl?: string; // for image-to-video models
}

// When a frontier FAL endpoint returns auth/gating errors (account doesn't have
// access to gated Veo 3.1, Kling 3 Pro, etc.), silently fall back to the closest
// Replicate-hosted equivalent so the run still succeeds.
const FAL_FALLBACK: Partial<Record<VideoModel, VideoModel>> = {
  "veo-3.1-fast": "veo-3-fast",
  "veo-3.1": "veo-3",
  "kling-3.0": "kling-2.1",
  "seedance-2.0": "seedance-1.0",
};

function isFalAuthError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  // FAL returns "Unauthorized" or "Cannot access application ..." for gated models
  return /unauthorized|cannot access application|forbidden/i.test(msg);
}

function isRateLimitError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /429|too many requests|rate limit/i.test(msg);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Retry on 429 with exponential backoff: 2s, 5s, 12s.
async function withRateLimitRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  const delays = [2000, 5000, 12000];
  for (let i = 0; i <= delays.length; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === delays.length || !isRateLimitError(e)) throw e;
      console.warn(`[video] ${label} rate-limited (attempt ${i + 1}/${delays.length + 1}) — backing off ${delays[i]}ms`);
      await sleep(delays[i]);
    }
  }
  throw new Error(`${label}: unreachable`);
}

export async function startVideo(
  prompt: string,
  model: VideoModel = "veo-3.1-fast",
  opts: StartOpts = {}
): Promise<VideoJob> {
  const duration = opts.duration ?? 8;
  const aspectRatio = opts.aspectRatio ?? "9:16"; // Meta vertical default
  const resolution = opts.resolution ?? "1080p";
  const spec = REGISTRY[model];

  if (spec.provider === "fal") {
    const input = buildFalInput(model, prompt, { duration, aspectRatio, resolution, imageUrl: opts.imageUrl });
    try {
      const { request_id } = await withRateLimitRetry(
        () => falLib.submit(spec.endpoint, input),
        `FAL ${model}`
      );
      return { id: request_id, model, status: "pending" };
    } catch (e) {
      const fallback = FAL_FALLBACK[model];
      if (fallback && isFalAuthError(e)) {
        console.warn(`[video] FAL ${model} (${spec.endpoint}) unauthorized — falling back to ${fallback}`);
        return startVideo(prompt, fallback, opts);
      }
      throw e;
    }
  }

  // Replicate path
  let input: Record<string, unknown> = { prompt };
  switch (model) {
    case "veo-3":
    case "veo-3-fast":
      input = { prompt, aspect_ratio: aspectRatio, duration_seconds: duration };
      break;
    case "kling-2.1":
    case "kling-1.6":
      input = { prompt, duration: duration <= 5 ? 5 : 10, aspect_ratio: aspectRatio };
      break;
    case "hailuo-02":
      input = { prompt, duration: Math.min(10, Math.max(6, duration)), resolution };
      break;
    case "seedance-1.0":
      input = { prompt, duration: Math.min(10, duration), aspect_ratio: aspectRatio, resolution };
      break;
    case "sora-2-pro":
      input = { prompt, duration: Math.min(10, duration), aspect_ratio: aspectRatio };
      break;
    case "minimax":
    default:
      input = { prompt };
      break;
  }

  const prediction = await withRateLimitRetry(
    () =>
      (replicate.predictions.create as (args: {
        model: `${string}/${string}`;
        input: Record<string, unknown>;
      }) => Promise<{ id: string }>)({
        model: spec.endpoint as `${string}/${string}`,
        input,
      }),
    `Replicate ${model}`
  );

  return { id: prediction.id, model, status: "pending" };
}

function buildFalInput(
  model: VideoModel,
  prompt: string,
  opts: { duration: number; aspectRatio: string; resolution: string; imageUrl?: string }
): Record<string, unknown> {
  const { duration, aspectRatio, resolution, imageUrl } = opts;
  switch (model) {
    case "veo-3.1":
    case "veo-3.1-fast":
      return {
        prompt,
        aspect_ratio: aspectRatio,
        resolution: resolution === "1080p" ? "1080p" : "720p",
        duration: `${Math.min(8, Math.max(5, duration))}s`,
        generate_audio: true,
      };
    case "veo-3.1-i2v":
    case "veo-3.1-fast-i2v":
      if (!imageUrl) throw new Error(`${model} requires imageUrl`);
      return {
        prompt,
        image_url: imageUrl,
        aspect_ratio: aspectRatio,
        resolution: resolution === "1080p" ? "1080p" : "720p",
        duration: `${Math.min(8, Math.max(5, duration))}s`,
        generate_audio: false, // we add TTS separately for lipsync control
      };
    case "kling-3.0":
      return {
        prompt,
        duration: Math.min(15, Math.max(3, duration)),
        aspect_ratio: aspectRatio,
        audio: true,
      };
    case "kling-3.0-i2v":
      if (!imageUrl) throw new Error(`${model} requires imageUrl`);
      return {
        prompt,
        image_url: imageUrl,
        duration: Math.min(10, Math.max(3, duration)),
        aspect_ratio: aspectRatio,
        audio: false,
      };
    case "seedance-2.0":
      return {
        prompt,
        aspect_ratio: aspectRatio,
        resolution,
        duration: Math.min(10, Math.max(3, duration)),
      };
    default:
      return { prompt };
  }
}

/** Native max-seconds per clip on each model. Anything longer requires sequencing. */
export function maxClipSeconds(model: VideoModel): number {
  return REGISTRY[model].maxSeconds;
}

export interface VideoSequence {
  jobs: VideoJob[];
  clipSeconds: number;
  totalSeconds: number;
  model: VideoModel;
}

/**
 * Generate one or more video clips that, played back-to-back, total `totalSeconds`.
 * Each clip carries continuity hints in its prompt so the visual is coherent.
 */
export async function startVideoSequence(
  basePrompt: string,
  model: VideoModel,
  totalSeconds: number,
  opts: Omit<StartOpts, "duration"> = {}
): Promise<VideoSequence> {
  const max = maxClipSeconds(model);
  const requested = Math.max(1, totalSeconds);
  const clipSeconds = Math.min(max, requested);
  const clips = Math.max(1, Math.ceil(requested / clipSeconds));
  const jobs: VideoJob[] = [];
  for (let i = 0; i < clips; i++) {
    const part =
      clips === 1
        ? basePrompt
        : `${basePrompt}\n\n(Scene ${i + 1} of ${clips}: ${
            i === 0
              ? "opening shot — establish subject, outfit, location, lighting."
              : "direct continuation of previous scene — keep the same subject, same outfit, same location, same lighting, natural cut. Push the story forward."
          })`;
    // Space submissions to stay under per-second rate caps (Replicate is strict).
    if (i > 0) await sleep(1800);
    const j = await startVideo(part, model, { ...opts, duration: clipSeconds });
    jobs.push(j);
  }
  // Report the EFFECTIVE model (post-fallback) so the client polls the right
  // provider. If FAL was gated and we fell back to Replicate, jobs[0].model
  // already reflects the swap.
  const effectiveModel = jobs[0]?.model ?? model;
  return { jobs, clipSeconds, totalSeconds: clipSeconds * clips, model: effectiveModel };
}

export async function pollVideo(jobId: string, model: VideoModel = "veo-3.1-fast"): Promise<VideoJob> {
  const spec = REGISTRY[model];

  if (spec.provider === "fal") {
    const out = await falLib.poll(spec.endpoint, jobId);
    return {
      id: jobId,
      model,
      status: out.status,
      videoUrl: out.videoUrl,
      error: out.error,
    };
  }

  const prediction = await replicate.predictions.get(jobId);
  const status = prediction.status as string;

  let mappedStatus: VideoJob["status"] = "processing";
  if (status === "succeeded") mappedStatus = "succeeded";
  else if (status === "failed" || status === "canceled") mappedStatus = "failed";

  const output = prediction.output as string | string[] | null;
  const videoUrl = typeof output === "string" ? output : Array.isArray(output) ? output[0] : undefined;

  return {
    id: jobId,
    model,
    status: mappedStatus,
    videoUrl,
    error: prediction.error ? String(prediction.error) : undefined,
  };
}
