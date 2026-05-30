// Prompt builders for the UGC pipeline.
// Inputs come from autopilot's competitor analysis + chosen product.

export type VoiceArchetype =
  | "rapper_male"           // Hip-hop, street, deep confident
  | "rapper_female"         // Female rap / R&B, smooth
  | "young_woman_excited"   // Yapping selfie 20s
  | "young_woman_chill"     // Soft relatable mom-friend
  | "young_man_hype"        // Hype bro, energetic
  | "young_man_casual"      // Friendly Gen-Z guy
  | "founder_male"          // Confident polished male 30s
  | "founder_female"        // Confident polished female 30s
  | "mom_warm"              // Warm relatable mother
  | "british_male"          // Articulate British male
  | "british_female"        // Articulate British female
  | "narrator_neutral";     // Default fallback

export interface UgcPromptCtx {
  productTitle: string;
  productDescription?: string;
  hook: string;
  style: "ugc_review" | "yapping" | "founder_pov" | "demo";
  demographic?: string; // e.g. "young woman 25-30 USA"
  setting?: string; // e.g. "sunny apartment bedroom morning"
  language?: "en" | "he";
  voiceArchetype?: VoiceArchetype;
}

/** Realistic actor headshot/half-body matching the competitor's demographic + setting. */
export function buildActorPrompt(ctx: UgcPromptCtx): string {
  const demo = ctx.demographic || defaultDemoForArchetype(ctx.voiceArchetype) || defaultDemoForStyle(ctx.style);
  const setting = ctx.setting || defaultSettingForStyle(ctx.style);
  return [
    `Hyperrealistic vertical 9:16 selfie-style photograph.`,
    `Subject: ${demo}, candid relaxed expression, looking directly at the camera lens.`,
    `Framing: chest-up, slight high angle as if holding a phone, hand-held wobble feel.`,
    `Setting: ${setting}. Natural unstaged background, soft window light, real shadows.`,
    `Camera: iPhone front camera aesthetic, 35mm equivalent, mild lens distortion, slight ISO grain.`,
    `Skin: real pores, no airbrushing, no glamour retouch.`,
    `Outfit: casual everyday — t-shirt or hoodie, nothing branded.`,
    `No product visible yet. No text. No logos. No watermarks.`,
  ].join(" ");
}

/** Composite prompt — place actual product in actor's hand. */
export function buildCompositePrompt(ctx: UgcPromptCtx): string {
  const placement = pickPlacementForProduct(ctx.productTitle);
  return [
    `Insert the EXACT product from the second image into the scene of the first image — ${placement}.`,
    `Product: ${ctx.productTitle}.`,
    `STRICT PRESERVATION (must match the second image one-to-one):`,
    `every facet, every link, every prong, every gemstone, every clasp, every link weave, every metal finish, every shadow on the metal.`,
    `Do NOT stylize, do NOT simplify, do NOT redraw, do NOT swap stones, do NOT change the chain pattern, do NOT change the band thickness, do NOT change the cut of the diamond/moissanite.`,
    `Match the exact color temperature of the metal (rose vs yellow vs white gold) and the exact stone color from the second image.`,
    `Keep the person's face, hair, skin tone, outfit, scene background, and ambient lighting identical to the first image.`,
    `Proper real-world scale relative to the hand, neck, ear, or wrist. Natural physical contact, real shadow under the piece, real specular highlights catching the same window light.`,
    `Photoreal jewelry catalog quality. No added text, no overlays, no logos, no watermarks.`,
  ].join(" ");
}

/** Stricter retry prompt for when the first composite attempt failed vision check. */
export function buildCompositeRetryPrompt(ctx: UgcPromptCtx, reasons: string[]): string {
  const placement = pickPlacementForProduct(ctx.productTitle);
  const fixLine = reasons.length > 0
    ? `Previous attempt failed for these reasons: ${reasons.slice(0, 3).join("; ")}. Fix all of them.`
    : "";
  return [
    `Re-edit the first image so the person now ${placement}.`,
    `THE SECOND IMAGE IS THE GROUND TRUTH FOR THE PRODUCT. Replicate it pixel for pixel — every facet, link, prong, gemstone, clasp, metal tone, and surface highlight.`,
    `Do NOT invent jewelry. Do NOT substitute a similar-looking piece. Do NOT redraw — composite the reference piece directly.`,
    `Product name (for context only): ${ctx.productTitle}.`,
    fixLine,
    `Keep face, hair, skin, outfit, background, and lighting from the first image unchanged.`,
    `Photoreal, jewelry-catalog quality, natural shadow and reflection, no text, no overlays.`,
  ].filter(Boolean).join(" ");
}

function pickPlacementForProduct(title: string): string {
  const t = title.toLowerCase();
  if (/earring|stud|hoop/.test(t)) return "is now wearing the earrings, ears visible, hair tucked back";
  if (/ring|band/.test(t)) return "is now wearing the ring on the ring finger, hand raised to camera level";
  if (/chain|necklace|pendant/.test(t)) return "is now wearing the chain at the neckline, fully visible against the collarbone";
  if (/bracelet|cuff/.test(t)) return "is now wearing the bracelet on the wrist, raised loosely toward the camera";
  if (/watch/.test(t)) return "is now wearing the watch on the wrist, raised so the face of the watch is visible";
  return "is holding the product up to the camera at chest height, between thumb and index finger";
}

/** Animation prompt for image-to-video — gentle motion + speaking gestures. */
export function buildAnimationPrompt(ctx: UgcPromptCtx, script: string): string {
  const trimmed = script.slice(0, 240).replace(/\s+/g, " ").trim();
  return [
    `Animate the still image into a candid 8-second selfie video.`,
    `Subject talks directly to camera with natural mouth movement and microexpressions while showing the product.`,
    `Slight handheld camera wobble, ambient room light shifts, eye contact maintained.`,
    `Subtle gestures with the free hand. No cuts.`,
    `Script being spoken (for mouth shape reference): "${trimmed}"`,
    `Style: raw UGC, iPhone front camera, unscripted vibe.`,
  ].join(" ");
}

function defaultDemoForArchetype(arch?: VoiceArchetype): string | null {
  switch (arch) {
    case "rapper_male":         return "a confident Black man in his late 20s, fitted cap or durag, chain visible, tattoos on arms, street style, hip-hop attitude";
    case "rapper_female":       return "a confident Black woman in her mid 20s, long lashes, hoop earrings, fitted top, R&B vibe";
    case "young_woman_excited": return "a relatable American woman age 22-26, natural makeup, expressive eyes, friendly Gen-Z look";
    case "young_woman_chill":   return "a soft-spoken woman in her late 20s, casual hair, warm friendly face, mom-friend energy";
    case "young_man_hype":      return "an energetic 20-something guy, athletic build, big grin, frat-bro energy";
    case "young_man_casual":    return "a relaxed 22-year-old guy, hoodie, slight grin, low-key Gen-Z";
    case "founder_male":        return "a polished founder-type man in his early 30s, clean t-shirt, focused intelligent gaze";
    case "founder_female":      return "a polished founder-type woman in her early 30s, clean blouse, focused intelligent gaze";
    case "mom_warm":            return "a warm relatable woman in her mid 30s, natural look, kind eyes, approachable mother vibe";
    case "british_male":        return "an articulate British man in his late 20s, clean style, expressive face";
    case "british_female":      return "an articulate British woman in her late 20s, clean style, expressive face";
    default:                    return null;
  }
}

function defaultDemoForStyle(style: UgcPromptCtx["style"]): string {
  switch (style) {
    case "ugc_review": return "a relatable woman in her late 20s, natural makeup, friendly approachable face";
    case "yapping":    return "a fast-talking 22-year-old, expressive eyes, slight grin, energetic vibe";
    case "founder_pov":return "a calm confident founder-type in their 30s, focused gaze";
    case "demo":       return "a young adult, neutral expression";
    default:           return "a relatable young adult";
  }
}

function defaultSettingForStyle(style: UgcPromptCtx["style"]): string {
  switch (style) {
    case "ugc_review": return "cozy modern bedroom, unmade bed in background, morning light from window";
    case "yapping":    return "passenger seat of a parked car, daylight through windshield, casual ambient";
    case "founder_pov":return "minimal workspace, neutral wall behind, soft directional light";
    case "demo":       return "clean neutral studio, soft seamless backdrop";
    default:           return "casual bedroom or living room, natural daylight";
  }
}

/**
 * ElevenLabs voice IDs by archetype. Public voice library — these are well-known IDs.
 * Override any of them via env vars (ELEVENLABS_VOICE_<ARCHETYPE>).
 */
const VOICE_LIBRARY: Record<VoiceArchetype, string> = {
  rapper_male:         "nPczCjzI2devNBz1zQrb", // Brian — deep American male
  rapper_female:       "cgSgspJ2msm6clMCkdW9", // Jessica — expressive American female (closest pre-made; can be customized)
  young_woman_excited: "cgSgspJ2msm6clMCkdW9", // Jessica
  young_woman_chill:   "EXAVITQu4vr4xnSDxMaL", // Sarah — soft young American female
  young_man_hype:      "bIHbv24MWmeRgasZH58o", // Will — confident young American male
  young_man_casual:    "TX3LPaxmHKxFdv7VOQHJ", // Liam — articulate young male
  founder_male:        "cjVigY5qzO86Huf0OWal", // Eric — mature American male, narrator
  founder_female:      "9BWtsMINqrJLrRacOk9x", // Aria — expressive American female
  mom_warm:            "XrExE9yKIg1WjnnlVkGX", // Matilda — friendly American female
  british_male:        "JBFqnCBsd6RMkjVDRZzb", // George — warm British male
  british_female:      "Xb7hH8MSUJpSbSDYk0k2", // Alice — confident British female
  narrator_neutral:    "21m00Tcm4TlvDq8ikWAM", // Rachel — multilingual default
};

/**
 * Hebrew voice library for the Israeli market. eleven-v3 is multilingual, so
 * these default to the same well-known multilingual voice IDs as the English
 * library, but they are split out so the owner can drop native Hebrew-speaker
 * voice IDs per archetype via env without disturbing the English mapping.
 *
 * Override precedence (highest first):
 *   1. ELEVENLABS_VOICE_HE_<ARCHETYPE>   e.g. ELEVENLABS_VOICE_HE_FOUNDER_MALE
 *   2. ELEVENLABS_VOICE_HE               (single global Hebrew voice)
 *   3. HEBREW_VOICE_LIBRARY[archetype]   (built-in multilingual default)
 */
const HEBREW_VOICE_LIBRARY: Record<VoiceArchetype, string> = {
  rapper_male:         "nPczCjzI2devNBz1zQrb", // Brian — deep, carries Hebrew well
  rapper_female:       "cgSgspJ2msm6clMCkdW9", // Jessica
  young_woman_excited: "cgSgspJ2msm6clMCkdW9", // Jessica
  young_woman_chill:   "EXAVITQu4vr4xnSDxMaL", // Sarah
  young_man_hype:      "bIHbv24MWmeRgasZH58o", // Will
  young_man_casual:    "TX3LPaxmHKxFdv7VOQHJ", // Liam
  founder_male:        "cjVigY5qzO86Huf0OWal", // Eric
  founder_female:      "9BWtsMINqrJLrRacOk9x", // Aria
  mom_warm:            "XrExE9yKIg1WjnnlVkGX", // Matilda
  british_male:        "JBFqnCBsd6RMkjVDRZzb", // George
  british_female:      "Xb7hH8MSUJpSbSDYk0k2", // Alice
  narrator_neutral:    "21m00Tcm4TlvDq8ikWAM", // Rachel — multilingual default
};

/** Pick an ElevenLabs voice ID matching the archetype + language. */
export function pickVoiceId(archetype?: VoiceArchetype, language: "en" | "he" = "en"): string {
  const arch = archetype || "narrator_neutral";
  if (language === "he") {
    // Per-archetype Hebrew override, then global Hebrew override, then the
    // built-in multilingual default for that archetype.
    const perArch = process.env[`ELEVENLABS_VOICE_HE_${arch.toUpperCase()}`];
    return perArch || process.env.ELEVENLABS_VOICE_HE || HEBREW_VOICE_LIBRARY[arch] || HEBREW_VOICE_LIBRARY.narrator_neutral;
  }
  // Env override per archetype: ELEVENLABS_VOICE_RAPPER_MALE etc.
  const envKey = `ELEVENLABS_VOICE_${arch.toUpperCase()}`;
  return process.env[envKey] || VOICE_LIBRARY[arch] || VOICE_LIBRARY.narrator_neutral;
}

/**
 * ElevenLabs v3 voice_settings, tuned per archetype and language.
 *
 * eleven-v3 reads four knobs:
 *   - stability       lower = more emotional range / prosody variation,
 *                     higher = steadier delivery. v3 sweet spots are
 *                     ~0.3 (creative), ~0.5 (natural), ~0.7 (robust).
 *   - similarity_boost how tightly to cling to the reference timbre.
 *   - style           expressiveness / emphasis.
 *   - speed           playback rate (0.7–1.2). Hebrew reads a touch slower
 *                     than English at the same setting, so we nudge it down.
 *
 * Israeli-market Hebrew tuning: native Hebrew ad reads are warm and
 * conversational rather than over-acted, so for Hebrew we lower stability a
 * notch for natural cadence, trim style slightly to avoid a sing-song
 * accent, and slow speed to ~0.95 so phonemes land cleanly (which also helps
 * the downstream lipsync — see step 2).
 */
export interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
  speed: number;
}

function baseVoiceSettings(arch: VoiceArchetype): VoiceSettings {
  switch (arch) {
    // High-energy reads: looser stability, more style, a hair faster.
    case "rapper_male":
    case "rapper_female":
    case "young_man_hype":
    case "young_woman_excited":
      return { stability: 0.35, similarity_boost: 0.8, style: 0.6, use_speaker_boost: true, speed: 1.04 };
    // Calm, authoritative reads: steadier, less style.
    case "founder_male":
    case "founder_female":
    case "narrator_neutral":
      return { stability: 0.6, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true, speed: 1.0 };
    // Warm, relatable reads.
    case "mom_warm":
    case "young_woman_chill":
    case "young_man_casual":
      return { stability: 0.5, similarity_boost: 0.78, style: 0.4, use_speaker_boost: true, speed: 1.0 };
    default:
      return { stability: 0.5, similarity_boost: 0.75, style: 0.4, use_speaker_boost: true, speed: 1.0 };
  }
}

export function buildVoiceSettings(archetype?: VoiceArchetype, language: "en" | "he" = "en"): VoiceSettings {
  const base = baseVoiceSettings(archetype || "narrator_neutral");
  if (language !== "he") return base;
  // Hebrew adjustments for the Israeli market.
  return {
    stability: Math.max(0.3, base.stability - 0.05),
    similarity_boost: base.similarity_boost,
    style: Math.max(0.2, base.style - 0.1),
    use_speaker_boost: true,
    speed: Math.min(base.speed, 0.96),
  };
}

/**
 * Clean a script before sending it to TTS.
 *
 * For Hebrew we strip Latin letters so eleven-v3 does not code-switch into an
 * English accent mid-sentence (the owner's #1 Hebrew-copy complaint), drop
 * em-dashes (owner preference), collapse the bidi mess of mixed digits, and
 * normalize whitespace/quotes. English is only lightly normalized.
 */
export function sanitizeScriptForTts(script: string, language: "en" | "he" = "en"): string {
  let s = (script || "")
    // URLs and emoji read as gibberish in TTS — strip them in both languages.
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu, " ")
    .replace(/[–—]/g, language === "he" ? "," : "-") // em/en dash → comma (he) / hyphen (en)
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'");
  if (language === "he") {
    // Remove Latin letters and any standalone English words; keep Hebrew,
    // digits, punctuation and whitespace. Then squeeze the gaps that leaves.
    s = s
      .replace(/[A-Za-z]+/g, " ")
      .replace(/\s+([,.!?:;])/g, "$1");
  }
  return s.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

/** Heuristic: map a free-text archetype label from the LLM to our enum. */
export function normalizeArchetype(raw: string | undefined): VoiceArchetype {
  if (!raw) return "narrator_neutral";
  const s = raw.toLowerCase();
  if (/(rapper|hip[- ]?hop|trap|street).*(female|woman|girl)/.test(s)) return "rapper_female";
  if (/(rapper|hip[- ]?hop|trap|street)/.test(s)) return "rapper_male";
  if (/(mom|mother|warm.*woman|relatable mother)/.test(s)) return "mom_warm";
  if (/british.*(woman|female|girl)/.test(s)) return "british_female";
  if (/british.*(man|male|guy)/.test(s)) return "british_male";
  if (/(founder|ceo|entrepreneur).*(female|woman)/.test(s)) return "founder_female";
  if (/(founder|ceo|entrepreneur)/.test(s)) return "founder_male";
  if (/(hype|energetic|frat|bro).*(man|male|guy)/.test(s) || /young man hype/.test(s)) return "young_man_hype";
  if (/young.*(man|male|guy)|gen[- ]?z.*guy/.test(s)) return "young_man_casual";
  if (/(excited|yap|fast.*talk|hyper).*(woman|female|girl)/.test(s) || /young woman excited/.test(s)) return "young_woman_excited";
  if (/(chill|soft|calm).*(woman|female|girl)/.test(s) || /young woman chill/.test(s)) return "young_woman_chill";
  if (/(woman|female|girl)/.test(s)) return "young_woman_chill";
  if (/(man|male|guy)/.test(s)) return "young_man_casual";
  return "narrator_neutral";
}
