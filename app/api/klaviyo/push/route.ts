import { NextResponse } from "next/server";
import { createTemplate, renderAdEmail, getOrCreateList } from "@/lib/klaviyo";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, headline, copy, videoUrl, thumbnailUrl, ctaText, ctaUrl, language, listName } = body;

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
      language: language || "he",
    });

    const template = await createTemplate({ name, html });
    // Optionally resolve/create the target audience list so the owner can
    // schedule a send from this template against a known list id.
    const list = listName ? await getOrCreateList(listName) : undefined;
    return NextResponse.json({ template, list });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
