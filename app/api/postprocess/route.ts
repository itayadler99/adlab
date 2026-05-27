import { NextRequest, NextResponse } from "next/server";
import { applyRealism, type PostProcessLevel } from "@/lib/postprocess";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { url?: string; level?: PostProcessLevel };
    if (!body.url || !/^https?:\/\//i.test(body.url)) {
      return NextResponse.json({ error: "valid http(s) url required" }, { status: 400 });
    }
    const result = await applyRealism(body.url, { level: body.level });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "postprocess failed" },
      { status: 500 }
    );
  }
}
