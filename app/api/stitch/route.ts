import { NextRequest, NextResponse } from "next/server";
import { stitchVideosWithTrace } from "@/lib/stitch";
import { isPublicHttpsUrl } from "@/lib/url-guard";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { urls, clipSeconds } = body as { urls?: string[]; clipSeconds?: number };
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: "urls required" }, { status: 400 });
    }
    for (const u of urls) {
      if (!isPublicHttpsUrl(u)) {
        return NextResponse.json({ error: "all urls must be https and public" }, { status: 400 });
      }
    }
    const { url, trace } = await stitchVideosWithTrace({ urls, clipSeconds });
    return NextResponse.json({ url, trace });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "stitch failed" },
      { status: 500 }
    );
  }
}
