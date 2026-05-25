import { NextRequest, NextResponse } from "next/server";
import { proxy } from "@/proxy";
import Replicate from "replicate";
import { supabase } from "@/lib/db";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

export async function POST(req: NextRequest) {
  const authResult = await proxy(req);
  if (authResult) return authResult;

  try {
    const body = await req.json();
    const { script, imageUrl, adId } = body as {
      script: string;
      imageUrl?: string;
      adId?: string;
    };

    if (!script) {
      return NextResponse.json({ error: "Missing script" }, { status: 400 });
    }

    const prediction = await replicate.predictions.create({
      model: "minimax/video-01",
      input: {
        prompt: script,
        ...(imageUrl ? { first_frame_image: imageUrl } : {}),
      },
    });

    if (adId) {
      await supabase
        .from("ads")
        .update({ prediction_id: prediction.id, status: "generating" })
        .eq("id", adId);
    }

    return NextResponse.json({
      predictionId: prediction.id,
      status: prediction.status,
    });
  } catch (error) {
    console.error("Video generation error:", error);
    return NextResponse.json(
      { error: "Failed to start video generation" },
      { status: 500 }
    );
  }
}
