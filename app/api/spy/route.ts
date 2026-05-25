import { NextRequest, NextResponse } from "next/server";
import { writeAdScript, scoreAd } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

async function extractVideoUrl(adLibraryUrl: string): Promise<string | null> {
  // Extract ad ID from URL patterns like:
  // https://www.facebook.com/ads/library/?id=123456789
  // https://facebook.com/ads/library/?id=123456789&...
  const idMatch = adLibraryUrl.match(/[?&]id=(\d+)/);
  if (!idMatch) return null;

  const adId = idMatch[1];

  // Try Meta Ad Library API (public, no auth required for basic info)
  // Falls back to scrape route
  try {
    const scrapeRes = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/spy/scrape`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adId, url: adLibraryUrl }),
      }
    );
    if (scrapeRes.ok) {
      const data = await scrapeRes.json();
      if (data.videoUrl) return data.videoUrl;
    }
  } catch (_) {}

  return null;
}

async function transcribeVideo(videoUrl: string): Promise<string> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/transcribe`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrl }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Transcribe failed: ${err}`);
  }
  const data = await res.json();
  return data.transcript || "";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, videoUrl: providedVideoUrl } = body;

    if (!url && !providedVideoUrl) {
      return NextResponse.json(
        { error: "url or videoUrl is required" },
        { status: 400 }
      );
    }

    const steps: Record<string, unknown> = {};

    // Step 1: resolve video URL
    let videoUrl = providedVideoUrl || null;
    if (!videoUrl && url) {
      videoUrl = await extractVideoUrl(url);
      steps.videoUrl = videoUrl;
      if (!videoUrl) {
        return NextResponse.json(
          {
            error:
              "Could not extract video URL from the Ad Library link. Try pasting the direct video URL instead.",
            steps,
          },
          { status: 422 }
        );
      }
    } else {
      steps.videoUrl = videoUrl;
    }

    // Step 2: transcribe
    let transcript = "";
    try {
      transcript = await transcribeVideo(videoUrl);
      steps.transcript = transcript;
    } catch (e: unknown) {
      return NextResponse.json(
        {
          error: `Transcription failed: ${
            e instanceof Error ? e.message : String(e)
          }`,
          steps,
        },
        { status: 500 }
      );
    }

    // Step 3: score
    let score: Awaited<ReturnType<typeof scoreAd>> | null = null;
    try {
      score = await scoreAd(transcript);
      steps.score = score;
    } catch (e: unknown) {
      return NextResponse.json(
        {
          error: `Scoring failed: ${
            e instanceof Error ? e.message : String(e)
          }`,
          steps,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, videoUrl, transcript, score, steps });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
