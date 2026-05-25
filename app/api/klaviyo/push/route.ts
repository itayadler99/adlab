import { NextResponse } from "next/server";
import { createTemplate, renderAdEmail } from "@/lib/klaviyo";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, headline, copy, videoUrl, thumbnailUrl, ctaText, ctaUrl } = body;

    if (!name || !headline || !ctaUrl) {
      return NextResponse.json(
        { error: "name, headline, ctaUrl required" },
        { status: 400 }
      );
    }

    const html = renderAdEmail({
      headline,
      body: copy || "",
      videoUrl,
      thumbnailUrl,
      ctaText,
      ctaUrl,
    });

    const template = await createTemplate({ name, html });
    return NextResponse.json({ template });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
