import { NextRequest, NextResponse } from "next/server";
import { advanceShowcaseSequence, type ShowcaseSequenceState } from "@/lib/showcase";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const state = (await req.json()) as ShowcaseSequenceState;
    if (!state || !state.stage || !state.inputs || !Array.isArray(state.clips)) {
      return NextResponse.json({ error: "invalid sequence state" }, { status: 400 });
    }
    const updated = await advanceShowcaseSequence(state);
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "showcase sequence advance failed" },
      { status: 500 }
    );
  }
}
