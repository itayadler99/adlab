import { NextRequest, NextResponse } from "next/server";
import {
  generateHookVariants,
  startVariants,
  advanceVariants,
  type VariantInputs,
  type VariantRun,
} from "@/lib/variants";

export const runtime = "nodejs";
export const maxDuration = 300;

interface StartBody {
  action: "start";
  inputs: VariantInputs;
}

interface AdvanceBody {
  action: "advance";
  runs: VariantRun[];
}

type Body = StartBody | AdvanceBody;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;

    if (body.action === "start") {
      const inputs = body.inputs;
      if (!inputs?.productImageUrl) {
        return NextResponse.json({ error: "productImageUrl required" }, { status: 400 });
      }
      const count = inputs.count ?? 5;
      const hookSet = await generateHookVariants({
        productTitle: inputs.productTitle,
        baseScript: inputs.baseScript,
        baseHook: inputs.baseHook,
        count,
        language: inputs.language,
      });
      const runs = await startVariants(inputs, hookSet);
      return NextResponse.json({ runs, hookSet });
    }

    if (body.action === "advance") {
      if (!Array.isArray(body.runs)) {
        return NextResponse.json({ error: "runs[] required" }, { status: 400 });
      }
      const next = await advanceVariants(body.runs);
      return NextResponse.json({ runs: next });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "variants failed" },
      { status: 500 }
    );
  }
}
