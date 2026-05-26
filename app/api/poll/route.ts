import { NextResponse } from "next/server";
import { pollVideo } from "@/lib/video";
import { db, updateVideo } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const job = await pollVideo(id);
    // Only persist to Supabase if configured. Autopilot flow doesn't require DB.
    if (db && (job.status === "succeeded" || job.status === "failed")) {
      try {
        await updateVideo(id, { status: job.status, video_url: job.videoUrl });
      } catch {
        // DB write failure shouldn't break the poll response
      }
    }
    return NextResponse.json(job);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
