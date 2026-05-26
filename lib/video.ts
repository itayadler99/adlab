import Replicate from "replicate";

// Cinematic, top-quality video models on Replicate
export type VideoModel =
  | "veo-3"          // Google Veo 3 — best cinematic, 8s, $$$
  | "veo-3-fast"     // Google Veo 3 Fast — cheaper Veo, 8s
  | "kling-2.1"      // Kling 2.1 — great for UGC/product, 5/10s
  | "kling-1.6"      // Kling 1.6 standard — solid baseline
  | "hailuo-02"      // MiniMax Hailuo 02 — much better than video-01
  | "seedance-1.0"   // Bytedance Seedance — fast + good motion
  | "minimax";       // legacy minimax/video-01 (kept for back-compat)

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
}

export async function startVideo(
  prompt: string,
  model: VideoModel = "veo-3-fast",
  opts: StartOpts = {}
): Promise<VideoJob> {
  const duration = opts.duration ?? 8;
  const aspectRatio = opts.aspectRatio ?? "9:16"; // Meta vertical default
  const resolution = opts.resolution ?? "1080p";

  // Map our friendly model name -> Replicate model slug + input shape
  let replicateModel: `${string}/${string}`;
  let input: Record<string, unknown> = { prompt };

  switch (model) {
    case "veo-3":
      replicateModel = "google/veo-3";
      input = { prompt, aspect_ratio: aspectRatio, duration_seconds: duration };
      break;
    case "veo-3-fast":
      replicateModel = "google/veo-3-fast";
      input = { prompt, aspect_ratio: aspectRatio, duration_seconds: duration };
      break;
    case "kling-2.1":
      replicateModel = "kwaivgi/kling-v2.1-master";
      input = { prompt, duration: duration <= 5 ? 5 : 10, aspect_ratio: aspectRatio };
      break;
    case "kling-1.6":
      replicateModel = "kwaivgi/kling-v1.6-standard";
      input = { prompt, duration: duration <= 5 ? 5 : 10, aspect_ratio: aspectRatio };
      break;
    case "hailuo-02":
      replicateModel = "minimax/hailuo-02";
      input = { prompt, duration: Math.min(10, Math.max(6, duration)), resolution };
      break;
    case "seedance-1.0":
      replicateModel = "bytedance/seedance-1-pro";
      input = { prompt, duration: Math.min(10, duration), aspect_ratio: aspectRatio, resolution };
      break;
    case "minimax":
    default:
      replicateModel = "minimax/video-01";
      input = { prompt };
      break;
  }

  const prediction = await (replicate.predictions.create as (args: {
    model: `${string}/${string}`;
    input: Record<string, unknown>;
  }) => Promise<{ id: string }>)({
    model: replicateModel,
    input,
  });

  return {
    id: prediction.id,
    model,
    status: "pending",
  };
}

export async function pollVideo(jobId: string, model: VideoModel = "veo-3-fast"): Promise<VideoJob> {
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
