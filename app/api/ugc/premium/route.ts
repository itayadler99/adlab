import { NextRequest, NextResponse } from "next/server";
import { generateMiragePremium, isPremiumEnabled, type CaptionsMirageRequest } from "@/lib/captions-mirage";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(req: NextRequest) {
  if (!isPremiumEnabled()) {
    return NextResponse.json(
      { error: "premium mode disabled — set CAPTIONS_MIRAGE_API_KEY" },
      { status: 503 }
    );
  }
  try {
    const body = (await req.json()) as CaptionsMirageRequest;
    if (!body.script || !body.productTitle) {
      return NextResponse.json(
        { error: "productTitle and script required" },
        { status: 400 }
      );
    }
    const result = await generateMiragePremium(body);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "mirage failed" },
      { status: 500 }
    );
  }
}
