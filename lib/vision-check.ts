// Claude Vision-based checks. Two flavors:
//   - checkCompositePreservesProduct(): does the composite still contain the
//     exact item from the product photo? Used as a gate before lipsync.
//   - rateVideoRealism(): full quality judge over a final video frame +
//     product photo + script. Used by the autopilot quality-reject loop.
//
// Both calls fail open — if anthropic is unreachable we return `pass`/score=10
// so the pipeline never blocks on the check itself.
import { anthropic } from "./anthropic";

const VISION_MODEL = "claude-opus-4-6";

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
const ALLOWED_MEDIA: ImageMediaType[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

interface FetchedImage {
  data: string; // base64
  media_type: ImageMediaType;
}

async function fetchAsBase64(url: string): Promise<FetchedImage | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const rawCt = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim().toLowerCase();
    const media_type: ImageMediaType = ALLOWED_MEDIA.includes(rawCt as ImageMediaType)
      ? (rawCt as ImageMediaType)
      : "image/jpeg";
    return { data: buf.toString("base64"), media_type };
  } catch {
    return null;
  }
}

export interface CompositeCheckResult {
  match: boolean;
  /** 0-10 confidence the product in the composite is the same item as the reference. */
  confidence: number;
  reasons: string[];
}

/** Compare the composite (actor wearing product) against the original product photo. */
export async function checkCompositePreservesProduct(
  compositeUrl: string,
  productUrl: string
): Promise<CompositeCheckResult> {
  const [composite, product] = await Promise.all([
    fetchAsBase64(compositeUrl),
    fetchAsBase64(productUrl),
  ]);
  if (!composite || !product) {
    // Fail open — we couldn't fetch one of the images, don't block the run.
    return { match: true, confidence: 10, reasons: ["could not fetch images for vision check"] };
  }

  const sys =
    "You are a jewelry product authenticator. You will see TWO images. " +
    "Image 1 is a UGC photo of a person wearing or holding a piece of jewelry. " +
    "Image 2 is the GROUND TRUTH product photograph from the brand's catalog. " +
    "Your job: decide whether the piece visible in image 1 is the exact same item as image 2. " +
    "Be strict about: stone shape and cut, stone color, metal color (rose vs yellow vs white gold), " +
    "chain pattern (cuban vs rope vs box vs figaro), pendant shape, ring band thickness, prong setting, clasp type. " +
    'Output strict JSON only: {"match": true|false, "confidence": 0-10 integer, "reasons": ["..."]}';

  try {
    const res = await anthropic().messages.create({
      model: VISION_MODEL,
      max_tokens: 600,
      system: sys,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Image 1 — UGC composite:" },
            { type: "image", source: { type: "base64", media_type: composite.media_type, data: composite.data } },
            { type: "text", text: "Image 2 — ground truth product:" },
            { type: "image", source: { type: "base64", media_type: product.media_type, data: product.data } },
            { type: "text", text: "Compare. Output the JSON only." },
          ],
        },
      ],
    });
    const text = res.content.find((b) => b.type === "text");
    const body = text && text.type === "text" ? text.text : "";
    const m = body.match(/\{[\s\S]*\}/);
    if (!m) return { match: true, confidence: 10, reasons: ["no JSON from vision check"] };
    const parsed = JSON.parse(m[0]) as { match?: boolean; confidence?: number; reasons?: string[] };
    return {
      match: parsed.match ?? true,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 10,
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
    };
  } catch (e) {
    console.warn("[vision-check] composite check failed open:", e instanceof Error ? e.message : e);
    return { match: true, confidence: 10, reasons: ["vision check errored"] };
  }
}

export interface VideoQualityResult {
  /** 0-10 overall realism score across 5 criteria. */
  score: number;
  reasons: string[];
  retry: boolean;
  details?: {
    skin_material_realism: number;
    motion_naturalness: number;
    framing: number;
    lighting: number;
    no_ai_tells: number;
    product_match: number;
  };
}

/** Rate a final video frame (passed as image URL — caller picks a thumbnail). */
export async function rateVideoRealism(opts: {
  frameUrl: string;
  productUrl: string;
  script?: string;
  threshold?: number; // default 7
}): Promise<VideoQualityResult> {
  const [frame, product] = await Promise.all([
    fetchAsBase64(opts.frameUrl),
    fetchAsBase64(opts.productUrl),
  ]);
  if (!frame || !product) {
    return { score: 10, reasons: ["could not fetch images for vision check"], retry: false };
  }
  const threshold = opts.threshold ?? 7;

  const sys =
    "You are a senior Meta Ads creative director judging whether an AI-generated UGC ad is " +
    "good enough to ship. You will see TWO images: a frame from the final ad video and the " +
    "brand's ground-truth product photo. Rate it strictly on a 0-10 scale on each criterion: " +
    "skin_material_realism, motion_naturalness, framing, lighting, no_ai_tells (smooth skin, " +
    "waxy textures, unnatural eyes/hands), product_match (is the actual product visible and " +
    "identical to the reference). Output strict JSON only: " +
    '{"score": N, "details": {"skin_material_realism":N, "motion_naturalness":N, "framing":N, ' +
    '"lighting":N, "no_ai_tells":N, "product_match":N}, "reasons": ["..."]}. score is the min ' +
    "of all six (the worst criterion drives the verdict).";

  try {
    const res = await anthropic().messages.create({
      model: VISION_MODEL,
      max_tokens: 800,
      system: sys,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Ad frame:" },
            { type: "image", source: { type: "base64", media_type: frame.media_type, data: frame.data } },
            { type: "text", text: "Ground truth product:" },
            { type: "image", source: { type: "base64", media_type: product.media_type, data: product.data } },
            { type: "text", text: opts.script ? `Script being spoken: "${opts.script.slice(0, 400)}". ` : "" },
            { type: "text", text: "Rate and output the JSON only." },
          ],
        },
      ],
    });
    const text = res.content.find((b) => b.type === "text");
    const body = text && text.type === "text" ? text.text : "";
    const m = body.match(/\{[\s\S]*\}/);
    if (!m) return { score: 10, reasons: ["no JSON from quality check"], retry: false };
    const parsed = JSON.parse(m[0]) as VideoQualityResult & { score?: number };
    const score = typeof parsed.score === "number" ? parsed.score : 10;
    return {
      score,
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
      retry: score < threshold,
      details: parsed.details,
    };
  } catch (e) {
    console.warn("[vision-check] video quality check failed open:", e instanceof Error ? e.message : e);
    return { score: 10, reasons: ["quality check errored"], retry: false };
  }
}
