import { NextRequest, NextResponse } from "next/server";
import { applyRealism, burnCaptions, addMusicBed, type PostProcessLevel, type CaptionStyle } from "@/lib/postprocess";
import { buildCaptionsForVideo } from "@/lib/captions";
import { getBrandKit } from "@/lib/brand-kit";
import { pickMusicTrack, pickVertical, type Vertical } from "@/lib/music";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  url?: string;
  level?: PostProcessLevel;
  storeId?: string;
  brandKit?: boolean;
  captions?: CaptionStyle;
  music?: { enabled?: boolean; vertical?: Vertical; musicDb?: number };
  pipeline?: "legacy" | "v2026";
  goldenHour?: boolean;
  lighting?: "day" | "night";
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    if (!body.url || !/^https?:\/\//i.test(body.url)) {
      return NextResponse.json({ error: "valid http(s) url required" }, { status: 400 });
    }
    const brandKit =
      body.brandKit !== false && body.storeId ? await getBrandKit(body.storeId) : undefined;
    const result = await applyRealism(body.url, {
      level: body.level,
      brandKit,
      pipeline: body.pipeline,
      goldenHour: body.goldenHour,
      lighting: body.lighting,
    });

    // Optional caption burn-in (P4). Off by default. We burn AFTER realism so
    // we don't re-grade graded captions.
    let captionUrl: string | undefined;
    let captionsError: string | undefined;
    if (body.captions?.enabled) {
      try {
        const origin = req.nextUrl.origin;
        const built = await buildCaptionsForVideo({
          videoUrl: result.url,
          baseUrl: origin,
          language: req.nextUrl.searchParams.get("lang") === "he" ? "he" : "en",
          style: {
            highlightHex: body.captions.highlightHex ?? brandKit?.secondaryHex,
            fontFamily: body.captions.fontFamily ?? brandKit?.fontFamily,
            position: body.captions.position ?? "bottom",
          },
        });
        if (built) {
          captionUrl = await burnCaptions(result.url, built.assPath);
        } else {
          captionsError = "could not produce word timestamps";
        }
      } catch (e) {
        captionsError = e instanceof Error ? e.message : String(e);
      }
    }

    // Optional music bed (P5). Off by default. Run AFTER captions so the
    // sidechain key is the final VO mix.
    let workingUrl = captionUrl ?? result.url;
    let musicApplied = false;
    let musicError: string | undefined;
    if (body.music?.enabled) {
      try {
        const vertical = body.music.vertical ?? pickVertical(body.storeId);
        const track = await pickMusicTrack(vertical);
        if (!track) {
          musicError = `no music tracks installed under public/music/${vertical}/`;
        } else {
          workingUrl = await addMusicBed(workingUrl, track, { musicDb: body.music.musicDb });
          musicApplied = true;
        }
      } catch (e) {
        musicError = e instanceof Error ? e.message : String(e);
      }
    }

    return NextResponse.json({
      ...result,
      url: workingUrl,
      captionsApplied: Boolean(captionUrl),
      captionsError,
      musicApplied,
      musicError,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "postprocess failed" },
      { status: 500 }
    );
  }
}
