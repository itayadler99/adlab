import { NextRequest, NextResponse } from "next/server";
import { applyRealism, type PostProcessLevel, type CaptionStyle } from "@/lib/postprocess";
import { getBrandKit } from "@/lib/brand-kit";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  url?: string;
  level?: PostProcessLevel;
  storeId?: string;
  brandKit?: boolean;
  captions?: CaptionStyle;
  music?: { vertical?: string };
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
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "postprocess failed" },
      { status: 500 }
    );
  }
}
