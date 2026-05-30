// Soul ID library — canonical surface for character avatars used by the UGC
// actor stage. Merges two sources:
//
//   1. Live Higgsfield "Souls" (trained characters) via lib/higgsfield.ts.
//   2. Built-in presets shipped with AdLab — most importantly the "Malik"
//      preset, plus a small Higgsfield-style cast — so the picker is never
//      empty and the actor stage has a usable character even before any Soul
//      is trained or when Higgsfield is unreachable.
//
// Each preset carries a `promptSeed`: a character description used to rebuild
// the actor with flux-pro when Higgsfield can't render the Soul directly. This
// keeps a chosen character recognizable across runs without depending on
// Higgsfield availability.

import {
  listSouls as listHiggsfieldSouls,
  renderSoulFrame,
} from "./higgsfield";

export interface Soul {
  id: string;
  name: string;
  thumbnailUrl: string;
  gender?: string;
  style?: string;
  /** Trained from user photos (vs. a built-in preset). */
  trained?: boolean;
  /** Built-in AdLab preset (not a live Higgsfield-trained Soul). */
  preset?: boolean;
  /** Character description for the flux-pro fallback at the actor stage. */
  promptSeed?: string;
}

// Built-in presets. `Malik` is the flagship street/UGC creator preset.
export const PRESET_SOULS: Soul[] = [
  {
    id: "malik",
    name: "Malik",
    thumbnailUrl: "/souls/malik.png",
    gender: "male",
    style: "street",
    preset: true,
    promptSeed:
      "a confident man in his late 20s, warm brown skin, short fade haircut, light stubble, expressive eyes, " +
      "a subtle gold chain, urban streetwear hoodie, relaxed charismatic presence",
  },
  {
    id: "nadia",
    name: "Nadia",
    thumbnailUrl: "/souls/nadia.png",
    gender: "female",
    style: "lifestyle",
    preset: true,
    promptSeed:
      "a relatable woman in her mid 20s, natural makeup, soft wavy hair, friendly approachable face, " +
      "casual neutral top, warm everyday lifestyle vibe",
  },
  {
    id: "yossi",
    name: "Yossi",
    thumbnailUrl: "/souls/yossi.png",
    gender: "male",
    style: "founder",
    preset: true,
    promptSeed:
      "a polished founder-type man in his early 30s, short dark hair, clean stubble, intelligent focused gaze, " +
      "plain crewneck, calm confident presence",
  },
  {
    id: "tamar",
    name: "Tamar",
    thumbnailUrl: "/souls/tamar.png",
    gender: "female",
    style: "energetic",
    preset: true,
    promptSeed:
      "an energetic woman in her early 20s, expressive eyes, big natural smile, hair in a loose ponytail, " +
      "bright casual outfit, fast-talking creator energy",
  },
];

const PRESET_BY_ID = new Map(PRESET_SOULS.map((s) => [s.id, s] as const));

/**
 * Full Soul library: live Higgsfield Souls overlaid on the built-in presets,
 * deduped by id. Presets always appear (so the picker is never empty); a live
 * Soul with the same id wins on display metadata but keeps any preset
 * `promptSeed` so the flux-pro fallback still has a character description.
 */
export async function listSouls(): Promise<Soul[]> {
  let live: Soul[] = [];
  try {
    live = (await listHiggsfieldSouls()).map((s) => ({ ...s, preset: false }));
  } catch {
    live = [];
  }
  const byId = new Map<string, Soul>();
  for (const p of PRESET_SOULS) byId.set(p.id, { ...p });
  for (const s of live) {
    const existing = byId.get(s.id);
    byId.set(s.id, { ...existing, ...s, promptSeed: existing?.promptSeed ?? s.promptSeed });
  }
  return Array.from(byId.values());
}

/** Look up a built-in preset by id (sync — no network). */
export function getPresetSoul(id: string): Soul | undefined {
  return PRESET_BY_ID.get(id);
}

/** Whether an id refers to a built-in preset. */
export function isPresetSoul(id: string): boolean {
  return PRESET_BY_ID.has(id);
}

/**
 * Resolve a single Soul by id across both sources (live Higgsfield + presets).
 * Returns undefined when the id is neither a preset nor a live Soul. Async
 * because the live lookup may hit Higgsfield; the preset is used as the
 * fallback when no live Soul matches.
 */
export async function resolveSoul(id: string): Promise<Soul | undefined> {
  if (!id) return undefined;
  const preset = PRESET_BY_ID.get(id);
  const all = await listSouls();
  const live = all.find((s) => s.id === id);
  return live ?? preset;
}

/**
 * Render an actor frame for a Soul via Higgsfield. Returns the rendered image
 * URL, or null when Higgsfield is unconfigured / unreachable / the id is a
 * preset with no live Soul — in which case the caller should fall back to
 * flux-pro (augmenting the prompt with `getPresetSoul(id)?.promptSeed`).
 */
export async function renderSoulActorFrame(args: {
  soulId: string;
  prompt: string;
  aspectRatio?: "9:16" | "16:9" | "1:1";
}): Promise<string | null> {
  return renderSoulFrame(args);
}
