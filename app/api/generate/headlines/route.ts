import { NextResponse } from "next/server";
import { writeHeadlines } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.productTitle) {
      return NextResponse.json({ error: "productTitle required" }, { status: 400 });
    }
    const out = await writeHeadlines(body);
    return NextResponse.json(out);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
