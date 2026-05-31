// Daily learn cron — pulls last 30d Meta insights into the variant_perf
// table so the script generator can bias future hooks toward winners.
//
// Schedule via vercel.json:
//   { "path": "/api/cron/learn", "schedule": "0 6 * * *" }
//
// Secure with a shared `CRON_SECRET` query param.

import { NextRequest, NextResponse } from "next/server";
import { runLearnCron, markWinner } from "@/lib/performance-bias";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  const query = req.nextUrl.searchParams.get("secret");
  const xheader = req.headers.get("x-cron-secret");
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically.
  const bearer = req.headers.get("authorization");
  return query === cronSecret || xheader === cronSecret || bearer === `Bearer ${cronSecret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runLearnCron();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "learn cron failed" },
      { status: 500 }
    );
  }
}

// POST: manual "mark as winner" toggle from the /abtest UI.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { variantId?: string; isWinner?: boolean };
  if (!body.variantId) {
    return NextResponse.json({ error: "variantId required" }, { status: 400 });
  }
  try {
    await markWinner(body.variantId, Boolean(body.isWinner));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "mark winner failed" },
      { status: 500 }
    );
  }
}
