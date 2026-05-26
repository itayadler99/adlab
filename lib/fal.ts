// FAL.ai client wrapper. Mirrors the lifecycle we use for Replicate so the
// autopilot orchestrator can stay provider-agnostic.
import { fal } from "@fal-ai/client";

const KEY = process.env.FAL_KEY;
if (KEY) {
  fal.config({ credentials: KEY });
}

export function hasFal(): boolean {
  return Boolean(KEY);
}

export interface FalJob {
  id: string; // request_id
  endpoint: string; // FAL endpoint slug, needed for polling
  status: "pending" | "processing" | "succeeded" | "failed";
  videoUrl?: string;
  imageUrl?: string;
  audioUrl?: string;
  error?: string;
}

/** Submit a queued FAL job and return the request_id. Caller must store endpoint. */
export async function submit(endpoint: string, input: Record<string, unknown>): Promise<{ request_id: string }> {
  if (!KEY) throw new Error("FAL_KEY not set");
  const res = await fal.queue.submit(endpoint, { input });
  return { request_id: res.request_id };
}

/** Poll a FAL request. Returns the normalized status + first output URL. */
export async function poll(endpoint: string, requestId: string): Promise<FalJob> {
  if (!KEY) throw new Error("FAL_KEY not set");
  const status = await fal.queue.status(endpoint, { requestId, logs: false });
  const s = (status as { status?: string }).status;
  let mapped: FalJob["status"] = "processing";
  if (s === "COMPLETED") mapped = "succeeded";
  else if (s === "FAILED" || s === "CANCELED") mapped = "failed";

  let videoUrl: string | undefined;
  let imageUrl: string | undefined;
  let audioUrl: string | undefined;
  let error: string | undefined;

  if (mapped === "succeeded") {
    const result = await fal.queue.result(endpoint, { requestId });
    const data = (result as { data?: Record<string, unknown> }).data || {};
    videoUrl = extractUrl(data, "video");
    imageUrl = extractUrl(data, "image");
    audioUrl = extractUrl(data, "audio");
  } else if (mapped === "failed") {
    error = JSON.stringify(status);
  }

  return { id: requestId, endpoint, status: mapped, videoUrl, imageUrl, audioUrl, error };
}

function extractUrl(data: Record<string, unknown>, kind: "video" | "image" | "audio"): string | undefined {
  // FAL response shapes:
  //   { video: { url } } | { image: { url } } | { audio: { url } }
  //   { videos: [{ url }] } | { images: [{ url }] }
  //   { url } (rare)
  const single = data[kind];
  if (single && typeof single === "object" && "url" in single && typeof (single as { url: string }).url === "string") {
    return (single as { url: string }).url;
  }
  const plural = data[`${kind}s`];
  if (Array.isArray(plural) && plural[0] && typeof plural[0] === "object" && "url" in plural[0]) {
    return (plural[0] as { url: string }).url;
  }
  if (kind === "video" && typeof data.url === "string") return data.url as string;
  return undefined;
}
