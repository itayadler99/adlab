import { NextResponse } from "next/server";
import { scoreAd } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const out = await scoreAd(body);
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
