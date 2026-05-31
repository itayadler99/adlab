// Hook library — niche+style filter for the picker UI.

import { NextRequest, NextResponse } from "next/server";
import { filterHooks, type HookFilter, type HookNiche, type HookStyle } from "@/lib/hook-templates";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const f: HookFilter = {
    niche: (sp.get("niche") as HookNiche) ?? undefined,
    style: (sp.get("style") as HookStyle) ?? undefined,
    language: (sp.get("language") as "he" | "en") ?? undefined,
  };
  return NextResponse.json({ hooks: filterHooks(f) });
}
