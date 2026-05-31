// Build a Nicola-grade prompt + run the quality gate before returning.
// Caller pipes the returned `prompt` straight into NanoBanana/Higgsfield/Flux.

import { NextRequest, NextResponse } from "next/server";
import { buildNicolaPrompt, buildVeoJson, type NicolaBlocks, type VeoTemplate } from "@/lib/nicola-prompt";
import { runQualityGate, type GateInput } from "@/lib/quality-gate";
import { getActor } from "@/lib/actor-library";

export const runtime = "nodejs";

interface Body {
  mode?: "still" | "veo";
  blocks?: Partial<NicolaBlocks>;
  veo?: VeoTemplate;
  actorSlug?: string;
  gate?: Omit<GateInput, "prompt">;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const mode = body.mode ?? "still";

    if (mode === "veo") {
      if (!body.veo) return NextResponse.json({ error: "veo template required" }, { status: 400 });
      const json = buildVeoJson(body.veo);
      return NextResponse.json({ veoJson: json });
    }

    // still mode — merge actor presets into blocks if slug provided
    const blocks = { ...(body.blocks ?? {}) } as NicolaBlocks;
    if (body.actorSlug) {
      const actor = getActor(body.actorSlug);
      if (!actor) return NextResponse.json({ error: `unknown actor: ${body.actorSlug}` }, { status: 400 });
      blocks.subject ??= actor.subject;
      blocks.wardrobe ??= actor.wardrobe;
    }

    // sanity check required fields exist before delegating to builder
    if (!blocks.aspect || !blocks.shot || !blocks.subject || !blocks.wardrobe || !blocks.atmosphere || !blocks.lighting || !blocks.dualTone) {
      return NextResponse.json(
        { error: "missing required blocks: aspect, shot, subject, wardrobe, atmosphere, lighting, dualTone" },
        { status: 400 }
      );
    }

    const prompt = buildNicolaPrompt(blocks);
    const gate = body.gate ? runQualityGate({ ...body.gate, prompt }) : undefined;

    return NextResponse.json({ prompt, gate });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "build failed" },
      { status: 500 }
    );
  }
}
