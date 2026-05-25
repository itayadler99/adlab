import { NextResponse } from "next/server";
import { pollVideo } from "@/lib/video";
import { updateVideo } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const job = await pollVideo(id);
    if (job.status === "succeeded" || job.status === "failed") {
      const url = Array.isArray(job.output) ? job.output[0] : job.output;
      await updateVideo(id, { status: job.status, video_url: url });
    }
    return NextResponse.json(job);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
