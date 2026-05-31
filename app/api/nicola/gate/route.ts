// Standalone quality gate — POST any existing prompt + mode/platform/aspect,
// get back pass/fail + warnings. Useful for legacy callers we haven't migrated
// to buildNicolaPrompt() yet.

import { NextRequest, NextResponse } from "next/server";
import { runQualityGate, type GateInput } from "@/lib/quality-gate";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GateInput;
    if (!body.prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });
    const result = runQualityGate(body);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "gate failed" },
      { status: 500 }
    );
  }
}
