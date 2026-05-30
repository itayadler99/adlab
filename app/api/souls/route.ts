import { NextResponse } from "next/server";
import { listSouls } from "@/lib/souls";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// GET /api/souls
// ---------------------------------------------------------------------------
// Returns the Soul ID library: built-in presets (Malik + cast) merged with any
// live Higgsfield-trained Souls. Always returns at least the presets so the
// picker is never empty. Kept alongside /api/souls/library for backwards
// compatibility — both now resolve through lib/souls.
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const souls = await listSouls();
    const apiReady = Boolean(process.env.HIGGSFIELD_API_URL && process.env.HIGGSFIELD_API_KEY);
    return NextResponse.json({ souls, apiReady });
  } catch (err) {
    console.error("[souls] unexpected error", err);
    return NextResponse.json({ souls: [], apiReady: false }, { status: 200 });
  }
}
