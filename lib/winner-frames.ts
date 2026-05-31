// Extract first / middle / last frame stills from a remote video URL using
// FAL's ffmpeg API. Returned URLs are public CDN links good for Claude vision.
//
// FAL exposes only `frame_type: "first" | "middle" | "last"` on the
// `fal-ai/ffmpeg-api/extract-frame` endpoint, so we call it three times in
// parallel to get a coarse storyboard. That's enough to capture the opening
// hook, the mid-ad reveal, and the closing CTA shot.

import { fal } from "@fal-ai/client";

const KEY = process.env.FAL_KEY;
if (KEY) fal.config({ credentials: KEY });

const ENDPOINT = "fal-ai/ffmpeg-api/extract-frame";

export interface WinnerFrame {
  url: string;
  position: "first" | "middle" | "last";
}

async function extractOne(
  videoUrl: string,
  frameType: "first" | "middle" | "last"
): Promise<WinnerFrame | null> {
  try {
    const result = await fal.subscribe(ENDPOINT, {
      input: { video_url: videoUrl, frame_type: frameType },
      logs: false,
    });
    const data = (result as { data?: Record<string, unknown> }).data || {};
    const images = data["images"] as Array<{ url?: string }> | undefined;
    const url = images?.[0]?.url;
    if (url && /^https:\/\//i.test(url)) return { url, position: frameType };
    return null;
  } catch {
    return null;
  }
}

export async function extractWinnerFrames(
  videoUrl: string,
  _count = 3 // kept for API compatibility; FAL only supports first/middle/last
): Promise<WinnerFrame[]> {
  if (!KEY) return [];
  if (!videoUrl) return [];
  const [first, middle, last] = await Promise.all([
    extractOne(videoUrl, "first"),
    extractOne(videoUrl, "middle"),
    extractOne(videoUrl, "last"),
  ]);
  return [first, middle, last].filter((f): f is WinnerFrame => f !== null);
}
