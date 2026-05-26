import { NextResponse } from "next/server";
import { pollVideo, type VideoModel } from "@/lib/video";
import { pollImage } from "@/lib/images";
import { db, updateVideo } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const kind = (searchParams.get("kind") || "video").toLowerCase();
  const model = (searchParams.get("model") || undefined) as VideoModel | undefined;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    if (kind === "image") {
      const img = await pollImage(id);
      return NextResponse.json({
        id: img.id,
        status: img.status,
        imageUrl: img.imageUrl,
        error: img.error,
      });
    }
    const job = await pollVideo(id, model);
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
    const msg = e?.message || String(e);
    // Transient upstream errors (404 from wrong-provider polling, momentary
    // unavailability, rate limit) shouldn't terminate the client's polling.
    // Surface as processing; client has its own retry cap.
    const terminal = /unauthorized|forbidden|invalid token|400|expired/i.test(msg);
    if (terminal) {
      return NextResponse.json({ status: "failed", error: msg }, { status: 200 });
    }
    console.warn("[poll] transient error:", msg);
    return NextResponse.json({ status: "processing", error: msg }, { status: 200 });
  }
}
