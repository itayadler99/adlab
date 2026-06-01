// Debug-only endpoint: inject a synthetic winner ad and inspect the routing
// decision (mode, duration, clip math) WITHOUT firing video generation.
// Used to verify the autopilot mirrors competitor duration for long ads.
import { NextResponse } from "next/server";
import { analyzeWinner, pickProduct } from "@/lib/autopilot";
import { analyzeWinnerDeep } from "@/lib/winner-deep-analysis";
import { getVideoDurationSec } from "@/lib/video-meta";
import { shouldUseShowcase } from "@/lib/showcase";
import { maxClipSeconds, type VideoModel } from "@/lib/video";
import type { ApifyAd } from "@/lib/apify";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      videoUrl: string;
      thumbnailUrl?: string;
      adBody?: string;
      adTitle?: string;
    };
    if (!body.videoUrl) {
      return NextResponse.json({ error: "videoUrl required" }, { status: 400 });
    }
    const winner: ApifyAd = {
      adArchiveId: "debug-synthetic",
      pageName: "Debug Synthetic",
      isActive: true,
      snapshot: {
        title: body.adTitle || "Synthetic test ad",
        body: body.adBody || "Iced out cuban bracelet, lab-grown moissanite, lifetime warranty.",
        videos: [
          {
            videoHdUrl: body.videoUrl,
            videoSdUrl: body.videoUrl,
            thumbnailUrl: body.thumbnailUrl || "",
          },
        ],
      },
    };

    const [analysis, storyboard] = await Promise.all([
      analyzeWinner(winner),
      analyzeWinnerDeep(winner),
    ]);

    const product = await pickProduct(analysis.body_themes, {
      winnerProductType: storyboard.productType,
    });

    const probed = await getVideoDurationSec(body.videoUrl).catch(() => null);
    if (probed && probed > 0) storyboard.approxDurationSec = Math.round(probed);
    else if (storyboard.approxDurationSec === 0) storyboard.approxDurationSec = 20;

    const longWinner = storyboard.approxDurationSec > 10;
    const wantsShowcase = shouldUseShowcase({
      hasProductImage: Boolean(product.imageUrl),
      style: analysis.style,
      productTitle: product.title,
    });
    const mode =
      longWinner && product.imageUrl
        ? "video"
        : storyboard.hasPerson && product.imageUrl
          ? "ugc"
          : (analysis.style === "ugc_review" || analysis.style === "yapping") && product.imageUrl
            ? "ugc"
            : wantsShowcase
              ? "showcase"
              : "video";

    let chosenModel: VideoModel | undefined;
    let chosenDuration: number | undefined;
    let clipSeconds: number | undefined;
    let totalSeconds: number | undefined;
    let clips: number | undefined;
    if (mode === "video") {
      const d = Math.round(Math.min(60, Math.max(5, storyboard.approxDurationSec)));
      chosenDuration = d;
      chosenModel = product.imageUrl
        ? d <= 8
          ? "veo-3.1-fast-i2v"
          : "seedance-1.0"
        : d <= 8
          ? "veo-3.1-fast"
          : d <= 10
            ? "sora-2-pro"
            : "kling-3.0";
      const max = maxClipSeconds(chosenModel);
      clipSeconds = Math.min(max, d);
      clips = Math.max(1, Math.ceil(d / clipSeconds));
      totalSeconds = clipSeconds * clips;
    }

    return NextResponse.json({
      probedDuration: probed,
      storyboardDuration: storyboard.approxDurationSec,
      hasPerson: storyboard.hasPerson,
      productType: storyboard.productType,
      productMatched: { id: product.id, title: product.title, hasImage: !!product.imageUrl },
      style: analysis.style,
      mode,
      chosenModel,
      chosenDuration,
      clipSeconds,
      clips,
      totalSeconds,
      mirrorPass:
        mode === "video" && totalSeconds && Math.abs(totalSeconds - storyboard.approxDurationSec) <= 10,
    });
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
    console.error("[debug-route] failed:", msg);
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
