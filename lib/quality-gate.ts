// Nicola pre-render quality gate.
//
// Programmatic version of the Nicola pre-deploy checklist. Every gate is
// pure-function + testable. Callers run runQualityGate() before paying
// Replicate/Higgsfield/VEO credits — a failed gate aborts before money burns.
//
// Rules (extracted from Nicola methodology):
//   1. real product → image-to-video mandatory (t2v invents fake SKUs)
//   2. prompt density ≥ 14 blocks AND ≥ 60 words
//   3. ≥ 5 atmosphere/texture nouns
//   4. dual-tone lighting (warm + cool both present)
//   5. lens explicitly named (85/50/35/24mm)
//   6. DoF clause present
//   7. negative tail ("no text") present
//   8. aspect matches platform (IG/TT 9:16, YT 16:9, grid 1:1)
//   9. subject is concrete role, not "a person"
//  10. no banned buzzwords
//  11. VEO duration ≤ 8s
//  12. no Hebrew/RTL inside the model prompt (burn captions in post)

export type GenMode = "t2i" | "t2v" | "i2v" | "veo";
export type Platform = "ig_reel" | "tt" | "ig_grid" | "yt" | "yt_short";

export interface GateInput {
  prompt: string;
  mode: GenMode;
  platform: Platform;
  /** True if the prompt depicts a real SKU the brand sells. */
  isRealProduct: boolean;
  /** Required when isRealProduct=true and mode is video. */
  productReferenceImageUrl?: string;
  /** Aspect ratio the caller plans to render. */
  aspect: "9:16" | "16:9" | "4:5" | "1:1";
  /** Render duration in seconds — only relevant for video modes. */
  durationSeconds?: number;
}

export interface GateResult {
  ok: boolean;
  failures: string[];
  warnings: string[];
}

const WARM_TONES = /\b(warm|golden|amber|orange|sunset|tungsten|rim|gold)\b/i;
const COOL_TONES = /\b(cool|blue|cyan|teal|moonlight|arena|rink|neon)\b/i;
const LENS_PATTERN = /\b(24mm|35mm|50mm|85mm|100mm|macro)\b/i;
const DOF_PATTERN = /\b(shallow depth of field|deep depth of field|bokeh|dof)\b/i;
const NEGATIVE_TAIL_PATTERN = /\bno text\b/i;
const HEBREW_PATTERN = /[\u0590-\u05FF]/;
const GENERIC_SUBJECT = /\b(a person|a man|a woman|a guy|a girl)\b/i;
const BANNED_BUZZWORDS =
  /\b(8k|4k\s+resolution|masterpiece|best\s+quality|highly\s+detailed|stunning|beautiful)\b/i;

const PLATFORM_ASPECT: Record<Platform, ReadonlyArray<GateInput["aspect"]>> = {
  ig_reel: ["9:16"],
  tt: ["9:16"],
  ig_grid: ["1:1", "4:5"],
  yt: ["16:9"],
  yt_short: ["9:16"],
};

export function runQualityGate(input: GateInput): GateResult {
  const failures: string[] = [];
  const warnings: string[] = [];
  const p = input.prompt;
  const words = p.split(/\s+/).filter(Boolean);

  if (BANNED_BUZZWORDS.test(p)) failures.push("banned buzzword in prompt (8k/masterpiece/stunning/…)");
  if (HEBREW_PATTERN.test(p))
    failures.push("Hebrew detected in prompt — model can't render RTL, burn captions in post");
  if (GENERIC_SUBJECT.test(p)) failures.push("subject too generic — use concrete role");
  if (words.length < 60) failures.push(`prompt density only ${words.length} words (need ≥60)`);

  // Atmosphere/texture density — count comma-separated clauses with sensory nouns.
  const SENSORY = /(sweat|dust|condensation|ice|smoke|fog|rain|spray|grain|pores|particles|reflections|shadows)/gi;
  const sensoryHits = (p.match(SENSORY) ?? []).length;
  if (sensoryHits < 5) warnings.push(`only ${sensoryHits} atmosphere nouns (target ≥5)`);

  if (!LENS_PATTERN.test(p)) failures.push("no lens named — add 85mm/50mm/35mm/macro");
  if (!DOF_PATTERN.test(p)) failures.push("no depth-of-field clause");
  if (!NEGATIVE_TAIL_PATTERN.test(p)) failures.push("missing 'no text' negative tail");

  if (!(WARM_TONES.test(p) && COOL_TONES.test(p)))
    warnings.push("dual-tone missing — add warm+cool lighting for cinematic look");

  // Aspect ↔ platform fit
  if (!PLATFORM_ASPECT[input.platform].includes(input.aspect))
    failures.push(`aspect ${input.aspect} not allowed on ${input.platform}`);

  // Real product → must use i2v (or veo with reference). t2v hallucinates SKUs.
  const isVideo = input.mode === "t2v" || input.mode === "i2v" || input.mode === "veo";
  if (input.isRealProduct && isVideo) {
    if (input.mode === "t2v") failures.push("real product on t2v — switch to i2v with reference image");
    if (!input.productReferenceImageUrl)
      failures.push("real product requires productReferenceImageUrl");
  }

  // VEO duration ceiling — coherence breaks beyond 8s.
  if (input.mode === "veo" && input.durationSeconds && input.durationSeconds > 8)
    failures.push(`VEO duration ${input.durationSeconds}s exceeds 8s ceiling`);

  return { ok: failures.length === 0, failures, warnings };
}

/** Throwing wrapper for callers that prefer fail-fast. */
export function assertQualityGate(input: GateInput): void {
  const r = runQualityGate(input);
  if (!r.ok) throw new Error(`quality gate failed:\n  - ${r.failures.join("\n  - ")}`);
}
