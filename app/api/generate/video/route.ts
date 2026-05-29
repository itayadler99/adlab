import { NextRequest, NextResponse } from "next/server";
import { startVideo, VideoModel } from "@/lib/video";
import { db, saveVideo } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, model = "minimax" } = body as {
      prompt: string;
      model?: VideoModel;
    };

    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const allowedModels: VideoModel[] = [
      "minimax",
      "kling-1.6",
      "kling-2.1",
      "hailuo-02",
      "seedance-1.0",
      "veo-3",
      "veo-3-fast",
    ];
    if (!allowedModels.includes(model)) {
      return NextResponse.json(
        { error: `Invalid model. Allowed: ${allowedModels.join(", ")}` },
        { status: 400 }
      );
    }

    const job = await startVideo(prompt, model);

    // Supabase is optional — when not configured, return the job id so the
    // caller can poll the provider directly. Persistence is a nice-to-have.
    if (db) {
      try {
        await saveVideo({
          id: job.id,
          prompt,
          model,
          status: job.status,
          videoUrl: job.videoUrl,
        });
      } catch (e) {
        console.warn("[generate/video] saveVideo failed (non-fatal):", e instanceof Error ? e.message : e);
      }
    }

    return NextResponse.json({ jobId: job.id, model, status: job.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
