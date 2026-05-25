// Video generation — Replicate REST (Higgsfield has no public REST yet)
const REPLICATE_BASE = "https://api.replicate.com/v1";

function token() {
  const t = process.env.REPLICATE_API_TOKEN;
  if (!t) throw new Error("REPLICATE_API_TOKEN not set");
  return t;
}

export type VideoModel = "kling-1.6" | "veo-3" | "seedance-1.0-pro";

const MODEL_MAP: Record<VideoModel, string> = {
  "kling-1.6": "kwaivgi/kling-v1.6-pro",
  "veo-3": "google/veo-3",
  "seedance-1.0-pro": "bytedance/seedance-1-pro",
};

export interface VideoJob {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[];
  error?: string;
  urls?: { get: string; cancel: string };
}

export async function startVideo(opts: {
  model: VideoModel;
  prompt: string;
  reference_image_url?: string;
  duration?: number;
  aspect_ratio?: "9:16" | "16:9" | "1:1";
}): Promise<VideoJob> {
  const input: Record<string, any> = {
    prompt: opts.prompt,
    duration: opts.duration || 10,
    aspect_ratio: opts.aspect_ratio || "9:16",
  };
  if (opts.reference_image_url) input.image = opts.reference_image_url;

  const res = await fetch(`${REPLICATE_BASE}/models/${MODEL_MAP[opts.model]}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      Prefer: "wait=0",
    },
    body: JSON.stringify({ input }),
  });
  return res.json();
}

export async function pollVideo(id: string): Promise<VideoJob> {
  const res = await fetch(`${REPLICATE_BASE}/predictions/${id}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  return res.json();
}
