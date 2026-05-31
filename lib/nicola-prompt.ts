// Nicola 14-block photoreal prompt builder.
//
// Built from the Nicola AI methodology (Instagram-mined recipe). The rule is:
// every premium AI image/video prompt is 14 stackable blocks in fixed order.
// Skip a block and the model fills the gap with "AI plastic" defaults. Use
// banned buzzwords ("8k", "masterpiece", "stunning") and the model regresses
// to stock-photo aesthetic.
//
// Use buildNicolaPrompt() for stills (NanoBanana/Flux/Seedream) and
// buildVeoJson() for VEO 3.1 video. Both pipe through assertNoBuzzwords()
// before returning to fail fast on a regressed prompt.

export type AspectRatio = "9:16" | "16:9" | "4:5" | "1:1";
export type ShotType =
  | "extreme macro close-up"
  | "cinematic close-up"
  | "medium close-up"
  | "medium shot"
  | "hero wide"
  | "full body";
export type Lens = "85mm f/1.4" | "50mm" | "35mm" | "24mm" | "macro 100mm";
export type LightingStyle =
  | "golden-hour sunlight cutting across"
  | "soft diffused key light"
  | "halo spotlight"
  | "soft volumetric"
  | "dramatic stadium lighting with warm sunset rim"
  | "bright rink reflections"
  | "cold blue arena"
  | "neon nightlife reflections";

export interface NicolaBlocks {
  /** Block 1 — quality opener. Defaults to canonical RAW opener. */
  qualityOpener?: string;
  /** Block 2 — aspect ratio. Required. */
  aspect: AspectRatio;
  /** Block 3 — shot type. Required. */
  shot: ShotType;
  /** Block 4 — concrete subject role. Required. NEVER "a person". */
  subject: string;
  /** Block 5 — wardrobe / gear. Specific items. */
  wardrobe: string;
  /** Block 6 — camera position. */
  cameraPosition?: string;
  /** Block 7 — what crops the frame edges. */
  frameEdges?: string;
  /** Block 8 — eye / focus directive. Defaults to "eyes razor sharp". */
  eyeFocus?: string;
  /** Block 9 — skin realism. Defaults to pores + asymmetry + micro-imperfections. */
  skinRealism?: string;
  /** Block 10 — atmosphere / particles. Min 5 nouns. */
  atmosphere: string;
  /** Block 11 — explicit lighting source. */
  lighting: LightingStyle | string;
  /** Block 12 — dual-tone color (warm + cool). */
  dualTone: string;
  /** Block 13 — depth of field. Defaults to "shallow depth of field, rich bokeh". */
  depthOfField?: string;
  /** Block 14 — genre tag + negative tail. Defaults to cinematic editorial + no text. */
  genreTag?: string;
  /** Optional lens override. */
  lens?: Lens;
}

// Words that collapse photoreal models into stock-photo plastic. Hard reject.
const BUZZWORD_PATTERN =
  /\b(8k|4k\s+resolution|masterpiece|best\s+quality|highly\s+detailed|beautiful|stunning|amazing|perfect|gorgeous|breathtaking)\b/i;

const GENERIC_SUBJECT_PATTERN = /^(a |an )?(person|woman|man|guy|girl)$/i;

const DEFAULTS = {
  qualityOpener: "Ultra-photorealistic RAW",
  eyeFocus: "eyes razor sharp",
  skinRealism: "realistic skin pores, natural asymmetry, micro-imperfections",
  depthOfField: "shallow depth of field, rich bokeh",
  genreTag: "cinematic editorial photography, no text.",
} as const;

export function assertNoBuzzwords(prompt: string): void {
  const m = BUZZWORD_PATTERN.exec(prompt);
  if (m) {
    throw new Error(
      `nicola: banned buzzword "${m[0]}" — use specific lens/grade/texture vocab instead`
    );
  }
}

export function buildNicolaPrompt(b: NicolaBlocks): string {
  if (GENERIC_SUBJECT_PATTERN.test(b.subject.trim())) {
    throw new Error(
      `nicola: subject "${b.subject}" too generic — use concrete role (e.g. "male cyclist", "Tel Aviv barista")`
    );
  }
  if (b.atmosphere.split(/[,;]/).length < 3) {
    throw new Error("nicola: atmosphere needs at least 3 nouns (sweat, dust, condensation, ice…)");
  }

  const parts = [
    b.qualityOpener ?? DEFAULTS.qualityOpener,
    `${b.aspect} ${b.shot}`,
    b.subject,
    b.wardrobe,
    b.cameraPosition,
    b.frameEdges,
    b.eyeFocus ?? DEFAULTS.eyeFocus,
    b.skinRealism ?? DEFAULTS.skinRealism,
    b.atmosphere,
    b.lighting,
    b.dualTone,
    b.lens,
    b.depthOfField ?? DEFAULTS.depthOfField,
    b.genreTag ?? DEFAULTS.genreTag,
  ]
    .filter((x): x is string => Boolean(x && x.trim()))
    .map((s) => s.trim().replace(/\.$/, ""));

  const prompt = parts.join(", ") + ".";
  assertNoBuzzwords(prompt);
  return prompt;
}

// --- VEO 3.1 JSON template ---

export interface VeoTemplate {
  brand: string;
  brandValues: [string, string, string];
  concept: string;
  description: string;
  colors: [string, string, string];
  materials: [string, string];
  environment: string;
  setting: string;
  subject: string;
  beats: [string, string, string];
  accentColor: string;
  motion: string;
  mood: string;
  niche: string;
  aspectRatio?: AspectRatio;
}

export function buildVeoJson(t: VeoTemplate): Record<string, unknown> {
  assertNoBuzzwords(`${t.description} ${t.concept} ${t.motion}`);
  return {
    role: "commercial_director",
    brand: { name: t.brand, values: t.brandValues },
    concept: t.concept,
    description: t.description,
    style: "photorealistic cinematic, hyper-detail",
    visual_style: {
      look_and_feel: ["cinematic", "photorealistic", "premium"],
      color_palette: t.colors,
      materials: t.materials,
      time_of_day: "studio_lighting",
      environment: t.environment,
    },
    scene: { setting: t.setting, subject: t.subject, beats: t.beats },
    camera: {
      framing: ["macro", "medium", "hero_wide"],
      movement: ["dolly_in", "orbit_slow", "crane_up_to_hold"],
      lenses: ["85mm_macro", "35mm"],
      fps: 24,
    },
    lighting: { style: ["halo_spotlight", "soft_volumetric"], accents: t.accentColor },
    motion: t.motion,
    ending: `completed scene glowing in ${t.mood} light`,
    audio: { type: "music_and_sfx", mood: t.mood, no_voiceover: true },
    text: "none",
    output: {
      duration_seconds: 8,
      aspect_ratio: t.aspectRatio ?? "9:16",
      safety: "brand_safe",
    },
    keywords: [t.aspectRatio ?? "9:16", t.brand, t.niche, "no text", "8s loop"],
  };
}
