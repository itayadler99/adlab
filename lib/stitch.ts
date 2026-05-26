// Stitch multiple MP4 URLs into a single MP4 via fal-ai/ffmpeg-api/compose.
// Returns the stitched MP4 URL once ready (synchronously polls).
import { fal } from "@fal-ai/client";

const KEY = process.env.FAL_KEY;
if (KEY) fal.config({ credentials: KEY });

const ENDPOINT = "fal-ai/ffmpeg-api/compose";

/**
 * Build a single timeline track that plays each clip back-to-back.
 * FAL ffmpeg-api/compose expects `tracks` with keyframes at timestamps in ms.
 * For a concat, each clip becomes its own keyframe whose start time = sum of
 * previous clip durations. The compose API trims each input to its full length.
 */
export interface StitchInput {
  urls: string[];
  /** Optional per-clip duration override (seconds). Defaults to letting FAL pull metadata. */
  clipSeconds?: number;
}

export async function stitchVideos(input: StitchInput): Promise<string> {
  if (!KEY) throw new Error("FAL_KEY not set");
  if (!input.urls || input.urls.length === 0) throw new Error("no urls to stitch");
  if (input.urls.length === 1) return input.urls[0];

  const clip = input.clipSeconds ?? 8;
  const clipMs = clip * 1000;

  const keyframes = input.urls.map((url, i) => ({
    timestamp: i * clipMs,
    url,
    duration: clipMs,
  }));

  const tracks = [
    {
      id: "main",
      type: "video",
      keyframes,
    },
  ];

  const result = await fal.subscribe(ENDPOINT, {
    input: { tracks },
    logs: false,
  });

  const data = (result as { data?: Record<string, unknown> }).data || {};
  const video = data.video as { url?: string } | undefined;
  const url = video?.url || (data.url as string | undefined);
  if (!url) throw new Error("stitch: no video URL in response");
  return url;
}
