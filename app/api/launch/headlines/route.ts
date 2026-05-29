// Headline-variant generator — 3 per launch in Itay's Hebrew copy style.
// Delegates to writeHeadlines() and applies a defensive sanitize pass so a
// stray em-dash / specific date can never leak into a live ad.

import { NextResponse } from "next/server";
import { writeHeadlines } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

// Generic time-pressure phrases — used to detect (not inject) specific dates.
const SPECIFIC_DATE = /\b(\d{1,2}[./]\d{1,2}|\d{4})\b|ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר/;

/** Strip em/en dashes and collapse them to a comma; flag specific dates. */
export function sanitizeHeadline(h: string): string {
  return h
    .replace(/\s*[—–]\s*/g, ", ") // em/en dash → comma (Itay rule)
    .replace(/\s*-\s+/g, ", ") // hyphen used as a sentence dash → comma
    .replace(/\s{2,}/g, " ")
    .trim();
}

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
    const cleaned = (headlines || []).map(sanitizeHeadline).filter(Boolean).slice(0, 3);
    const warnings = cleaned
      .filter((h) => SPECIFIC_DATE.test(h))
      .map((h) => `headline may contain a specific date: "${h}"`);
    return NextResponse.json({ headlines: cleaned, warnings });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
