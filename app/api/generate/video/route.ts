import { NextResponse } from "next/server";
import { startVideo } from "@/lib/video";
import { saveVideo } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const job = await startVideo(body);
    await saveVideo({
      product_title: body.product_title,
      style: body.style,
      duration: body.duration,
      model: body.model,
      script: body.script,
      visual_prompt: body.prompt,
      cta: body.cta,
      replicate_id: job.id,
      status: job.status,
    });
    return NextResponse.json(job);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
