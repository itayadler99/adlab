import { NextRequest, NextResponse } from "next/server";
import { startShowcaseSequence, type ShowcaseSequenceInputs } from "@/lib/showcase";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<ShowcaseSequenceInputs>;
    if (!body.productTitle || !body.productImageUrl || !body.hook) {
      return NextResponse.json(
        { error: "missing required fields: productTitle, productImageUrl, hook" },
        { status: 400 }
      );
    }
    if (!/^https:\/\//i.test(body.productImageUrl)) {
      return NextResponse.json({ error: "productImageUrl must be https://" }, { status: 400 });
    }
    if (typeof body.totalSec !== "number" || body.totalSec <= 0) {
      return NextResponse.json({ error: "totalSec must be a positive number" }, { status: 400 });
    }
    if (body.totalSec > 60) {
      return NextResponse.json({ error: "totalSec capped at 60" }, { status: 400 });
    }
    const clean = (s: string, max: number) => s.replace(/[\x00-\x1f\x7f]/g, " ").slice(0, max);
    const inputs: ShowcaseSequenceInputs = {
      productTitle: clean(body.productTitle, 200),
      productImageUrl: body.productImageUrl,
      hook: clean(body.hook, 200),
      scene: body.scene ? clean(body.scene, 240) : undefined,
      totalSec: Math.min(60, Math.max(5, Math.round(body.totalSec))),
      clipSec: typeof body.clipSec === "number" ? Math.min(10, Math.max(5, Math.round(body.clipSec))) : undefined,
    };
    const state = await startShowcaseSequence(inputs);
    return NextResponse.json(state);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "showcase sequence start failed" },
      { status: 500 }
    );
  }
}
