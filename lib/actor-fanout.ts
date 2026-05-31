// Actor fan-out — arcads-style "1 script × N actors" batch.
//
// Pair with variants.ts (hook fan-out): together they give a 2D grid
// (hooks × actors) the user can launch into Meta as siblings. The actor list
// comes from lib/actor-library.ts; we map each picked actor's preset blocks
// into a Nicola prompt + return a plan the caller can stream into the UGC
// pipeline.

import { buildNicolaPrompt, type NicolaBlocks } from "./nicola-prompt";
import { getActor, type Actor } from "./actor-library";

export interface ActorFanoutInput {
  /** Slugs from lib/actor-library.ts. */
  actorSlugs: string[];
  /** Shared blocks (lighting, atmosphere, dualTone, etc) — subject+wardrobe filled per-actor. */
  sharedBlocks: Omit<NicolaBlocks, "subject" | "wardrobe">;
  /** Shared script + hook the actors all deliver. */
  script: string;
  hook: string;
  language?: "he" | "en";
}

export interface ActorFanoutPlan {
  actor: Actor;
  prompt: string;
  script: string;
  hook: string;
}

export function planActorFanout(input: ActorFanoutInput): ActorFanoutPlan[] {
  const plans: ActorFanoutPlan[] = [];
  for (const slug of input.actorSlugs) {
    const actor = getActor(slug);
    if (!actor) throw new Error(`actor-fanout: unknown actor "${slug}"`);
    const blocks: NicolaBlocks = {
      ...input.sharedBlocks,
      subject: actor.subject,
      wardrobe: actor.wardrobe,
    };
    plans.push({
      actor,
      prompt: buildNicolaPrompt(blocks),
      script: input.script,
      hook: input.hook,
    });
  }
  return plans;
}
