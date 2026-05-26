import { NextResponse } from "next/server";
import { runAutopilot, type AutopilotMode } from "@/lib/autopilot";
import type { VideoModel } from "@/lib/video";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      competitorInput?: string;
      dailyBudget?: number;
      videoModel?: VideoModel;
      videoDuration?: number;
      mode?: "auto" | AutopilotMode;
      language?: "en" | "he";
    };
    if (!body.competitorInput || !body.competitorInput.trim()) {
      return NextResponse.json({ error: "competitorInput required" }, { status: 400 });
    }
    const result = await runAutopilot({
      competitorInput: body.competitorInput,
      dailyBudget: body.dailyBudget,
      videoModel: body.videoModel,
      videoDuration: body.videoDuration,
      mode: body.mode,
      language: body.language,
    });
    return NextResponse.json(result);
  } catch (e) {
    // Log full stack server-side so we can see the real root cause in vercel logs.
    const stack = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
    console.error("[autopilot/run] failed:", stack);
    const msg = e instanceof Error ? e.message : "Autopilot failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
