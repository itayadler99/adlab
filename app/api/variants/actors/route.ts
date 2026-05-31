// Plan a 1-script × N-actors batch. Returns one Nicola prompt per actor; the
// caller pipes each into /api/ugc/start (or its premium variant) to spawn the
// parallel runs.

import { NextRequest, NextResponse } from "next/server";
import { planActorFanout, type ActorFanoutInput } from "@/lib/actor-fanout";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ActorFanoutInput;
    if (!Array.isArray(body.actorSlugs) || body.actorSlugs.length === 0) {
      return NextResponse.json({ error: "actorSlugs[] required" }, { status: 400 });
    }
    if (!body.sharedBlocks) {
      return NextResponse.json({ error: "sharedBlocks required" }, { status: 400 });
    }
    if (!body.script || !body.hook) {
      return NextResponse.json({ error: "script + hook required" }, { status: 400 });
    }
    const plans = planActorFanout(body);
    return NextResponse.json({ count: plans.length, plans });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fanout failed" },
      { status: 500 }
    );
  }
}
