import { NextResponse } from "next/server";
import { stitchHealth } from "@/lib/stitch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const health = stitchHealth();
  // Reachable iff at least one tier is configured. ffmpeg-static + blob both
  // count as a tier even without the model APIs.
  const reachable =
    health.fal.configured ||
    health.replicate.configured ||
    (health.ffmpegStatic.available && health.blob.configured);
  return NextResponse.json({ reachable, health }, { status: reachable ? 200 : 503 });
}
