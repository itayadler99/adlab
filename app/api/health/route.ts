import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHECKS = [
  { key: "ANTHROPIC_API_KEY", feature: "Script generation, ad scoring" },
  { key: "REPLICATE_API_TOKEN", feature: "Video generation" },
  { key: "META_ACCESS_TOKEN", feature: "Campaign launch + scan" },
  { key: "META_AD_ACCOUNT_ID", feature: "Meta ad account routing" },
  { key: "SHOPIFY_SHOP_DOMAIN", feature: "Product picker" },
  { key: "SHOPIFY_ACCESS_TOKEN", feature: "Product picker" },
  { key: "ADLAB_PASSWORD", feature: "Auth gate" },
  { key: "SUPABASE_URL", feature: "Library persistence", optional: true },
  { key: "SUPABASE_SERVICE_KEY", feature: "Library persistence", optional: true },
  { key: "OPENAI_API_KEY", feature: "Whisper transcription", optional: true },
];

export async function GET() {
  const status = CHECKS.map((c) => ({
    ...c,
    set: !!process.env[c.key],
  }));
  const ready = status.filter((s) => !s.optional).every((s) => s.set);
  return NextResponse.json({ ready, status, version: "0.2" });
}
