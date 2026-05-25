import { NextRequest, NextResponse } from "next/server";
import { startVideo, VideoModel } from "@/lib/video";
import { saveVideo } from "@/lib/db";

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

    const allowedModels: VideoModel[] = ["minimax", "kling-1.6", "sora-2"];
    if (!allowedModels.includes(model)) {
      return NextResponse.json(
        { error: `Invalid model. Allowed: ${allowedModels.join(", ")}` },
        { status: 400 }
      );
    }

    if (model === "sora-2") {
      return NextResponse.json(
        {
          error:
            "Sora-2 is not yet available via REST API. It is currently MCP-only. Please select minimax or kling-1.6.",
          comingSoon: true,
        },
        { status: 503 }
      );
    }

    const job = await startVideo(prompt, model);

    await saveVideo({
      id: job.id,
      prompt,
      model,
      status: job.status,
      videoUrl: job.videoUrl,
    });

    return NextResponse.json({ jobId: job.id, model, status: job.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
