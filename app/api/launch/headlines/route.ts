// Headline-variant generator — 3 per launch in Itay's Hebrew copy style.
// Delegates to writeHeadlines() and applies a defensive sanitize pass so a
// stray em-dash / specific date can never leak into a live ad.

import { NextResponse } from "next/server";
import { writeHeadlines } from "@/lib/anthropic";
import { sanitizeHebrew, validateHebrew } from "@/lib/copy";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (!b.productTitle && !b.product_title) {
      return NextResponse.json({ error: "productTitle required" }, { status: 400 });
    }
    const { headlines } = await writeHeadlines({
      productTitle: b.productTitle || b.product_title,
      productDescription: b.productDescription || b.product_description,
      language: b.language || "he",
    });
    const cleaned = (headlines || []).map((h) => sanitizeHebrew(h)).filter(Boolean).slice(0, 3);
    const warnings = cleaned.flatMap((h) =>
      validateHebrew(h).warnings.map((w) => `"${h}": ${w}`)
    );
    return NextResponse.json({ headlines: cleaned, warnings });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
