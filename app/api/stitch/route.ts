import { NextRequest, NextResponse } from "next/server";
import { stitchVideos } from "@/lib/stitch";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { urls, clipSeconds } = body as { urls?: string[]; clipSeconds?: number };
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: "urls required" }, { status: 400 });
    }
    const stitchedUrl = await stitchVideos({ urls, clipSeconds });
    return NextResponse.json({ url: stitchedUrl });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "stitch failed" },
      { status: 500 }
    );
  }
}
