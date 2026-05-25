import { NextResponse } from "next/server";
import { startVideo } from "@/lib/video";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const job = await startVideo(body);
    return NextResponse.json(job);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
