// Probe a remote video URL for duration via FAL ffmpeg metadata.
// Returns seconds (float) or null on failure.
import { fal } from "@fal-ai/client";

const KEY = process.env.FAL_KEY;
if (KEY) fal.config({ credentials: KEY });

const ENDPOINT = "fal-ai/ffmpeg-api/metadata";

export async function getVideoDurationSec(url: string): Promise<number | null> {
  if (!KEY) return null;
  try {
    const result = await fal.subscribe(ENDPOINT, {
      input: { media_url: url, extract_frames: false },
      logs: false,
    });
    const data = (result as { data?: Record<string, unknown> }).data || {};
    const dur =
      (data["duration"] as number | undefined) ??
      ((data["media"] as { duration?: number } | undefined)?.duration);
    return typeof dur === "number" && dur > 0 ? dur : null;
  } catch {
    return null;
  }
}
