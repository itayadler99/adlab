import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
    client = new Anthropic({ apiKey });
  }
  return client;
}

const MODEL = "claude-opus-4-6";

export async function writeAdScript(opts: {
  productTitle: string;
  productDescription?: string;
  productImageUrl?: string;
  style: "yapping" | "founder_pov" | "ugc_review" | "demo";
  duration: 15 | 30 | 45;
  targetAudience?: string;
}): Promise<{ script: string; visual_prompt: string; cta: string }> {
  const sys = `You are an elite Meta Ads UGC scriptwriter. Output strict JSON only:
{"script": "...", "visual_prompt": "...", "cta": "..."}

Rules:
- Script = raw spoken lines, ≤8 words per line, fast cadence
- Visual_prompt = scene/wardrobe/camera for Higgsfield or Sora
- CTA = one-line direct response
- No emojis, no Hebrew, no markdown`;

  const user = `Product: ${opts.productTitle}
${opts.productDescription ? `Description: ${opts.productDescription}` : ""}
${opts.productImageUrl ? `Image: ${opts.productImageUrl}` : ""}
Style: ${opts.style}
Duration: ${opts.duration}s
${opts.targetAudience ? `Audience: ${opts.targetAudience}` : "Audience: US, 18-45, urban, hip-hop/streetwear adjacent"}

Write the ad.`;

  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: sys,
    messages: [{ role: "user", content: user }],
  });
  const text = res.content.find((b) => b.type === "text")?.type === "text"
    ? (res.content[0] as { type: "text"; text: string }).text
    : "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("No JSON in Claude output");
  return JSON.parse(m[0]);
}

export async function writeHeadlines(opts: {
  productTitle: string;
  productDescription?: string;
  language?: "he" | "en";
}): Promise<{ headlines: string[] }> {
  const lang = opts.language || "he";
  const sys = `You are Itay's senior Hebrew copywriter. Output strict JSON only:
{"headlines": ["...", "...", "..."]}

Itay style rules (HARD):
- ${lang === "he" ? "Hebrew only, proper spelling (no slang)" : "English only"}
- NO em-dashes (—), NO dashes (-) inside sentences
- Generic time pressure phrases ("רק היום", "מלאי אחרון") — NEVER specific dates
- Each headline ≤ 7 words
- 3 distinct angles: benefit / urgency / curiosity`;

  const user = `Product: ${opts.productTitle}
${opts.productDescription ? `Description: ${opts.productDescription}` : ""}

Write 3 headline variants.`;

  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 512,
    system: sys,
    messages: [{ role: "user", content: user }],
  });
  const text = (res.content[0] as { type: "text"; text: string }).text;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("No JSON in Claude output");
  return JSON.parse(m[0]);
}

/**
 * Hook-variant generator — N distinct opening hooks for the same script.
 * Implementation lives in `lib/variants.ts` to keep the variant-runtime
 * concerns together; this re-export is here so callers that already depend
 * on `lib/anthropic.ts` can pull it without an extra import.
 */
export { generateHookVariants } from "./variants";

export async function scoreAd(opts: {
  transcript: string;
  visual_description?: string;
}): Promise<{
  hook_score: number;
  retention_score: number;
  cta_score: number;
  overall: number;
  reasons: string[];
  steal_this: string[];
}> {
  const sys = `You are a Meta Ads performance analyst. Score this ad 1-10 on hook (first 3s grab), retention (mid-roll watchability), cta (clarity). Output strict JSON only:
{"hook_score": N, "retention_score": N, "cta_score": N, "overall": N, "reasons": ["..."], "steal_this": ["..."]}`;

  const user = `Transcript:
${opts.transcript}

${opts.visual_description ? `Visual: ${opts.visual_description}` : ""}`;

  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: sys,
    messages: [{ role: "user", content: user }],
  });
  const text = (res.content[0] as { type: "text"; text: string }).text;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("No JSON in Claude output");
  return JSON.parse(m[0]);
}
