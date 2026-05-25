import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

// Attempts to resolve a video URL from a Facebook Ad Library ad ID.
// Strategy 1: Apify actor (if APIFY_TOKEN set)
// Strategy 2: Return null so the UI can ask user for direct video URL
async function tryApify(
  adId: string,
  originalUrl: string
): Promise<string | null> {
  const token = process.env.APIFY_TOKEN;
  if (!token) return null;

  try {
    const { runActor } = await import("@/lib/apify");
    // Use the facebook-ad-library actor if available
    const result = await runActor(
      "apify/facebook-ads-scraper",
      { startUrls: [{ url: originalUrl }], maxItems: 1 },
      token
    );
    if (result && Array.isArray(result) && result.length > 0) {
      const ad = result[0];
      return (
        ad?.videoUrl ||
        ad?.video_url ||
        ad?.media?.video_url ||
        ad?.snapshot?.videos?.[0]?.video_hd_url ||
        ad?.snapshot?.videos?.[0]?.video_sd_url ||
        null
      );
    }
  } catch (_) {}

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { adId, url } = await req.json();

    if (!adId) {
      return NextResponse.json({ error: "adId required" }, { status: 400 });
    }

    const videoUrl = await tryApify(adId, url || `https://www.facebook.com/ads/library/?id=${adId}`);

    return NextResponse.json({ adId, videoUrl });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "scrape error" },
      { status: 500 }
    );
  }
}
