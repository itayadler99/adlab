import { NextRequest, NextResponse } from "next/server";
import { startScrape, pollScrape, scrapeAdLibrary, ApifyRunInput } from "@/lib/apify";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ApifyRunInput & { async?: boolean };
    const { async: asyncMode, ...input } = body;

    if (asyncMode) {
      const runId = await startScrape(input);
      return NextResponse.json({ runId, status: "RUNNING" });
    }

    const ads = await scrapeAdLibrary(input, 55_000);
    return NextResponse.json({ ads });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });
  try {
    const result = await pollScrape(runId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
