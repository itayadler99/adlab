// Prompt builders for the UGC pipeline.
// Inputs come from autopilot's competitor analysis + chosen product.

export interface UgcPromptCtx {
  productTitle: string;
  productDescription?: string;
  hook: string;
  style: "ugc_review" | "yapping" | "founder_pov" | "demo";
  demographic?: string; // e.g. "young woman 25-30 USA"
  setting?: string; // e.g. "sunny apartment bedroom morning"
  language?: "en" | "he";
}

/** Realistic actor headshot/half-body matching the competitor's demographic + setting. */
export function buildActorPrompt(ctx: UgcPromptCtx): string {
  const demo = ctx.demographic || defaultDemoForStyle(ctx.style);
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

/** ElevenLabs voice ids per language. Override via env vars. */
export function pickVoiceId(language: "en" | "he" = "en"): string {
  if (language === "he") {
    return process.env.ELEVENLABS_VOICE_HE || "21m00Tcm4TlvDq8ikWAM"; // Rachel multilingual fallback
  }
  return process.env.ELEVENLABS_VOICE_EN || "21m00Tcm4TlvDq8ikWAM"; // Rachel
}
