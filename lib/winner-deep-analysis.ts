// Multi-frame storyboard analysis of a winning competitor ad.
//
// Pipeline:
//   1. Pick the winner's video URL (HD > SD) or fall back to thumbnail.
//   2. Extract N frames via FAL ffmpeg.
//   3. Send ALL frames at once to Claude Opus vision with a strict-JSON system
//      prompt that asks for the full storyboard, characters, palette, motion,
//      product type, and a shot list.
//
// Output is meant to drop directly into:
//   - showcase.scene (hero compositor)
//   - ugc script + setting + demographic (Higgsfield pipeline)
//   - video sceneAnchor (i2v / t2v fallback)
//   - product matcher (productType is matched against the Shopify catalog)

import { anthropic } from "./anthropic";
import { extractWinnerFrames, type WinnerFrame } from "./winner-frames";
import type { ApifyAd } from "./apify";

export interface WinnerStoryboard {
  /** 2-3 sentence rich description of setting, lighting, palette, mood. */
  sceneDescription: string;
  /** Wardrobe + age + ethnicity + vibe + body language of the on-camera person. Empty if no person. */
  characterDescription: string;
  /** True when at least one frame contains a visible model/person. */
  hasPerson: boolean;
  /** Frame-by-frame shot list as "0-3s: …" lines, joined with newlines. */
  shotList: string;
  /** Crisp jewelry category — used to match against the Shopify catalog. e.g. "tennis bracelet, princess-cut, white gold". */
  productType: string;
  /** Camera motion notes — "slow push-in, then handheld pan to model's wrist". */
  cameraMotion: string;
  /** Approximate duration in seconds of the winner ad (0 when unknown). */
  approxDurationSec: number;
  /** Frame URLs that fed the analysis — for debugging / UI. */
  frameUrls: string[];
}

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
const ALLOWED: ImageMediaType[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

async function fetchAsImageBlock(url: string): Promise<
  | { type: "image"; source: { type: "base64"; media_type: ImageMediaType; data: string } }
  | null
> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim().toLowerCase();
    const media_type: ImageMediaType = ALLOWED.includes(ct as ImageMediaType)
      ? (ct as ImageMediaType)
      : "image/jpeg";
    return {
      type: "image",
      source: { type: "base64", media_type, data: buf.toString("base64") },
    };
  } catch {
    return null;
  }
}

const EMPTY: WinnerStoryboard = {
  sceneDescription: "",
  characterDescription: "",
  hasPerson: false,
  shotList: "",
  productType: "",
  cameraMotion: "",
  approxDurationSec: 0,
  frameUrls: [],
};

export async function analyzeWinnerDeep(ad: ApifyAd): Promise<WinnerStoryboard> {
  const videoUrl =
    ad.snapshot?.videos?.[0]?.videoHdUrl || ad.snapshot?.videos?.[0]?.videoSdUrl || "";
  const thumb =
    ad.snapshot?.videos?.[0]?.thumbnailUrl || ad.snapshot?.images?.[0]?.originalImageUrl || "";

  // Step 1: gather frames. Multi-frame when we have a video, else just the thumb.
  let frames: WinnerFrame[] = [];
  if (videoUrl) {
    frames = await extractWinnerFrames(videoUrl, 5);
  }
  if (frames.length === 0 && thumb) {
    frames = [{ url: thumb, position: "first" }];
  }
  if (frames.length === 0) return EMPTY;

  // Step 2: fetch + base64 each frame in parallel.
  const blocks = (await Promise.all(frames.map((f) => fetchAsImageBlock(f.url)))).filter(
    (b): b is NonNullable<typeof b> => b !== null
  );
  if (blocks.length === 0) return { ...EMPTY, frameUrls: frames.map((f) => f.url) };

  // Step 3: one Claude call with all frames + structured-JSON system prompt.
  const sys = `You are a senior creative director reverse-engineering a winning Meta video ad.
You will receive ${blocks.length} stills sampled across the ad's timeline (first frame to last frame, in order).
Read them as a storyboard: setting, characters, motion, palette, cuts.

Output STRICT JSON only — no prose, no markdown. Schema:
{
  "sceneDescription": "2-3 sentence rich description of the physical setting, lighting style, color palette, and mood. Mention surfaces, time of day, and any environmental cues (street, kitchen, club, beach, hotel room, etc.). Do not mention the brand or any text overlays.",
  "characterDescription": "Detailed description of the on-camera person/people: gender, ethnicity, age range, wardrobe (be specific — 'oversized white tank, gold cuban chain, slicked-back hair'), makeup, vibe. Empty string '' if no person is visible in any frame.",
  "hasPerson": true | false,
  "shotList": "Frame-by-frame cut list. One line per major cut. Format: '0-3s: …\\n3-6s: …\\n6-10s: …'. Use newlines (\\n) between lines.",
  "productType": "Crisp jewelry/product category that the ad is selling — be very specific so we can match it against a Shopify catalog. Examples: 'tennis bracelet, round-cut, 4mm stones, white gold' or 'cuban link chain, 12mm, iced out, two-tone' or 'engagement ring, princess-cut center, halo, yellow gold'. If no product is visible, return ''.",
  "cameraMotion": "Camera + motion notes — 'slow push-in then handheld pan to model's wrist', 'static macro hold with subtle rack focus', 'whip-pan cuts every 1.5s between shots'.",
  "approxDurationSec": <integer estimate of total ad duration based on the cut density>
}`;

  const userBlocks: Array<
    | { type: "image"; source: { type: "base64"; media_type: ImageMediaType; data: string } }
    | { type: "text"; text: string }
  > = [...blocks, { type: "text", text: "Analyze these frames as a storyboard. Return JSON now." }];

  try {
    const res = await anthropic().messages.create({
      model: "claude-opus-4-6",
      max_tokens: 1500,
      system: sys,
      messages: [{ role: "user", content: userBlocks }],
    });
    const textBlock = res.content.find((b) => b.type === "text");
    const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { ...EMPTY, frameUrls: frames.map((f) => f.url) };
    const parsed = JSON.parse(m[0]) as Partial<WinnerStoryboard>;
    return {
      sceneDescription: parsed.sceneDescription || "",
      characterDescription: parsed.characterDescription || "",
      hasPerson: Boolean(parsed.hasPerson),
      shotList: parsed.shotList || "",
      productType: parsed.productType || "",
      cameraMotion: parsed.cameraMotion || "",
      approxDurationSec:
        typeof parsed.approxDurationSec === "number" ? Math.round(parsed.approxDurationSec) : 0,
      frameUrls: frames.map((f) => f.url),
    };
  } catch {
    return { ...EMPTY, frameUrls: frames.map((f) => f.url) };
  }
}

/**
 * Pick the product from a Shopify catalog whose title best matches the
 * winner's `productType`. Uses Claude as a semantic matcher (cheap haiku call)
 * because raw substring matching can't distinguish "tennis bracelet" from
 * "cuban bracelet". Falls back to first product on failure.
 */
export async function matchProductToWinner(args: {
  productType: string;
  catalog: Array<{ id: string; title: string }>;
}): Promise<string | undefined> {
  if (!args.productType || args.catalog.length === 0) return undefined;
  if (args.catalog.length === 1) return args.catalog[0].id;
  const sys = `You match a desired jewelry product description to the single best item in a catalog.
Return STRICT JSON: {"id": "<catalog id>"}. Pick by semantic similarity — type, cut, metal, style — not just keyword overlap.`;
  const user = `Desired: ${args.productType}

Catalog (id — title):
${args.catalog.map((p) => `${p.id} — ${p.title}`).join("\n")}

Return the single best match.`;
  try {
    const res = await anthropic().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system: sys,
      messages: [{ role: "user", content: user }],
    });
    const textBlock = res.content.find((b) => b.type === "text");
    const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return undefined;
    const parsed = JSON.parse(m[0]) as { id?: string };
    if (parsed.id && args.catalog.some((p) => p.id === parsed.id)) return parsed.id;
    return undefined;
  } catch {
    return undefined;
  }
}
