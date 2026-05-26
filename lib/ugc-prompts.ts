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
  return [
    `Edit the first image so the person is holding the product from the second image up to the camera.`,
    `Product: ${ctx.productTitle}.`,
    `Keep the person's face, hair, skin tone, outfit, lighting, and background identical.`,
    `The product should look real, naturally lit by the same window light, proper scale, casual grip.`,
    `Match the exact texture and color of the product in the second image — do not invent details.`,
    `Photoreal. No added text, no overlays.`,
  ].join(" ");
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

/** Pick an ElevenLabs voice ID matching the archetype + language. */
export function pickVoiceId(archetype?: VoiceArchetype, language: "en" | "he" = "en"): string {
  // Hebrew: prefer explicit env override, else Rachel (multilingual handles Hebrew).
  if (language === "he") {
    return process.env.ELEVENLABS_VOICE_HE || VOICE_LIBRARY.narrator_neutral;
  }
  const arch = archetype || "narrator_neutral";
  // Env override per archetype: ELEVENLABS_VOICE_RAPPER_MALE etc.
  const envKey = `ELEVENLABS_VOICE_${arch.toUpperCase()}`;
  return process.env[envKey] || VOICE_LIBRARY[arch] || VOICE_LIBRARY.narrator_neutral;
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
