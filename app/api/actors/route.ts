// Actor library — arcads-style picker. GET /api/actors?vibe=luxury&region=TLV
// returns the filtered Israeli-first persona list for the UI.

import { NextRequest, NextResponse } from "next/server";
import { filterActors, type ActorFilter, type Vibe, type Region } from "@/lib/actor-library";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const f: ActorFilter = {
    vibe: (sp.get("vibe") as Vibe) ?? undefined,
    region: (sp.get("region") as Region) ?? undefined,
    gender: (sp.get("gender") as "m" | "f" | "nb") ?? undefined,
    language: (sp.get("language") as "he" | "en" | "ar" | "ru") ?? undefined,
    tag: sp.get("tag") ?? undefined,
  };
  return NextResponse.json({ actors: filterActors(f) });
}
