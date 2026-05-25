import { NextResponse } from "next/server";
import { scoreAd } from "@/lib/anthropic";
import { saveAd } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const out = await scoreAd(body);
    await saveAd({
      source_url: body.source_url,
      transcript: body.transcript,
      visual_description: body.visual_description,
      ...out,
    });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
