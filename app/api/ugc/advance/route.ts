import { NextRequest, NextResponse } from "next/server";
import { advanceUgc, type UgcState } from "@/lib/ugc";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const state = (await req.json()) as UgcState;
    if (!state || !state.stage || !state.inputs) {
      return NextResponse.json({ error: "invalid state" }, { status: 400 });
    }
    const updated = await advanceUgc(state);
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ugc advance failed" },
      { status: 500 }
    );
  }
}
