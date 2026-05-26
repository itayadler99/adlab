import { NextRequest, NextResponse } from "next/server";
import { checkVideoQuality } from "@/lib/quality-check";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      videoUrl?: string;
      productImageUrl?: string;
      script?: string;
      threshold?: number;
      attempt?: number;
      maxAttempts?: number;
    };
    if (!body.videoUrl || !/^https?:\/\//i.test(body.videoUrl)) {
      return NextResponse.json({ error: "valid videoUrl required" }, { status: 400 });
    }
    if (!body.productImageUrl || !/^https?:\/\//i.test(body.productImageUrl)) {
      return NextResponse.json({ error: "valid productImageUrl required" }, { status: 400 });
    }
    const result = await checkVideoQuality({
      videoUrl: body.videoUrl,
      productImageUrl: body.productImageUrl,
      script: body.script,
      threshold: body.threshold,
      attempt: body.attempt,
      maxAttempts: body.maxAttempts,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "quality check failed" },
      { status: 500 }
    );
  }
}
