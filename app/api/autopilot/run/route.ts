import { NextResponse } from "next/server";
import { runAutopilot } from "@/lib/autopilot";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { competitorInput?: string; dailyBudget?: number };
    if (!body.competitorInput || !body.competitorInput.trim()) {
      return NextResponse.json({ error: "competitorInput required" }, { status: 400 });
    }
    const result = await runAutopilot({
      competitorInput: body.competitorInput,
      dailyBudget: body.dailyBudget,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Autopilot failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
