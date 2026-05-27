import Replicate from "replicate";
import * as falLib from "./fal";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

export interface ImageJob {
  id: string;
  status: "pending" | "processing" | "succeeded" | "failed";
  imageUrl?: string;
  error?: string;
}

export interface SalesImageInput {
  productTitle: string;
  productDescription: string;
  hook: string;
  bullets: string[]; // 3-5 short bullets — benefits/USPs
  brand?: string;
  /**
   * Real Shopify product image — when present, text-bearing images use
   * nano-banana/edit so the product itself is preserved beneath the overlay.
   */
  productImageUrl?: string;
  /**
   * Whether these images bear rendered English text (headlines, badges, CTA).
   * Defaults to true for sales images. When true, we route to text-accurate
   * models (nano-banana → recraft → flux-pro) instead of Ideogram/flux, which
   * hallucinate gibberish letters.
   */
  hasText?: boolean;
}

// Text-accurate FAL endpoints, ordered by preference. Gemini-powered
// nano-banana renders English text correctly; recraft v3 is the next-best
// fallback; flux-pro/v1.1-ultra is the last resort (text-blind — used only
// when the upstream chain rejects the request entirely).
const FAL_NANO_BANANA_EDIT = "fal-ai/nano-banana/edit";
const FAL_NANO_BANANA = "fal-ai/nano-banana";
const FAL_RECRAFT_V3 = "fal-ai/recraft/v3";
const FAL_FLUX_ULTRA = "fal-ai/flux-pro/v1.1-ultra";

// We encode FAL jobs as `fal:<endpoint>:<requestId>` so a single image-poll
// route can dispatch to either provider without an out-of-band endpoint param.
function encodeFalId(endpoint: string, requestId: string): string {
  return `fal:${endpoint}:${requestId}`;
}

function decodeId(id: string): { provider: "fal"; endpoint: string; requestId: string } | { provider: "replicate"; requestId: string } {
  if (id.startsWith("fal:")) {
    const rest = id.slice(4);
    const lastColon = rest.lastIndexOf(":");
    if (lastColon > 0) {
      return { provider: "fal", endpoint: rest.slice(0, lastColon), requestId: rest.slice(lastColon + 1) };
    }
  }
  return { provider: "replicate", requestId: id };
}

/**
 * Generate `count` sales-style static images with rendered text + bullet points.
 * For text-bearing images (default), routes through nano-banana with a
 * recraft → flux-pro fallback chain. Ideogram (Replicate) is the
 * ultimate fallback when FAL is unavailable.
 */
export async function startSalesImages(
  input: SalesImageInput,
  count = 3
): Promise<ImageJob[]> {
  const prompts = buildSalesPrompts(input, count);
  const hasText = input.hasText !== false; // sales images default to text
  const jobs: ImageJob[] = [];
  for (const prompt of prompts) {
    jobs.push(await submitTextImage(prompt, input.productImageUrl, hasText));
  }
  return jobs;
}

async function submitTextImage(
  prompt: string,
  productImageUrl: string | undefined,
  hasText: boolean
): Promise<ImageJob> {
  if (hasText && falLib.hasFal()) {
    // Tier 1: nano-banana. Prefer /edit when we have the real product photo
    // so the overlay is composited onto the actual item rather than a
    // hallucinated one.
    try {
      if (productImageUrl) {
        const { request_id } = await falLib.submit(FAL_NANO_BANANA_EDIT, {
          prompt,
          image_urls: [productImageUrl],
          num_images: 1,
          output_format: "jpeg",
        });
        return { id: encodeFalId(FAL_NANO_BANANA_EDIT, request_id), status: "pending" };
      }
      const { request_id } = await falLib.submit(FAL_NANO_BANANA, {
        prompt,
        num_images: 1,
        output_format: "jpeg",
      });
      return { id: encodeFalId(FAL_NANO_BANANA, request_id), status: "pending" };
    } catch (e) {
      console.warn("[images] nano-banana submit failed, falling back to recraft v3:", e instanceof Error ? e.message : e);
    }

    // Tier 2: recraft v3 — also accurate at rendering text.
    try {
      const { request_id } = await falLib.submit(FAL_RECRAFT_V3, {
        prompt,
        image_size: "portrait_16_9",
        style: "realistic_image",
      });
      return { id: encodeFalId(FAL_RECRAFT_V3, request_id), status: "pending" };
    } catch (e) {
      console.warn("[images] recraft submit failed, falling back to flux-pro ultra:", e instanceof Error ? e.message : e);
    }

    // Tier 3: flux-pro ultra — text-blind, last resort.
    try {
      const { request_id } = await falLib.submit(FAL_FLUX_ULTRA, {
        prompt,
        aspect_ratio: "9:16",
        num_images: 1,
        output_format: "jpeg",
        safety_tolerance: "5",
      });
      return { id: encodeFalId(FAL_FLUX_ULTRA, request_id), status: "pending" };
    } catch (e) {
      console.warn("[images] flux-pro submit failed, falling back to Replicate ideogram:", e instanceof Error ? e.message : e);
    }
  }

  // Non-text images, or no FAL key, or full FAL chain rejected — fall back to
  // Replicate Ideogram (the previous default).
  const prediction = await (replicate.predictions.create as (args: {
    model: `${string}/${string}`;
    input: Record<string, unknown>;
  }) => Promise<{ id: string }>)({
    model: "ideogram-ai/ideogram-v2",
    input: {
      prompt,
      aspect_ratio: "9:16",
      style_type: "Realistic",
      magic_prompt_option: "On",
    },
  });
  return { id: prediction.id, status: "pending" };
}

export async function pollImage(jobId: string): Promise<ImageJob> {
  const decoded = decodeId(jobId);
  if (decoded.provider === "fal") {
    const job = await falLib.poll(decoded.endpoint, decoded.requestId);
    return {
      id: jobId,
      status: job.status,
      imageUrl: job.imageUrl,
      error: job.error,
    };
  }
  const prediction = await replicate.predictions.get(decoded.requestId);
  const status = prediction.status as string;
  let mappedStatus: ImageJob["status"] = "processing";
  if (status === "succeeded") mappedStatus = "succeeded";
  else if (status === "failed" || status === "canceled") mappedStatus = "failed";
  const output = prediction.output as string | string[] | null;
  const imageUrl =
    typeof output === "string" ? output : Array.isArray(output) ? output[0] : undefined;
  return {
    id: jobId,
    status: mappedStatus,
    imageUrl,
    error: prediction.error ? String(prediction.error) : undefined,
  };
}

function buildSalesPrompts(input: SalesImageInput, count: number): string[] {
  const bullets = (input.bullets.length ? input.bullets : [
    "Lifetime warranty",
    "Conflict-free",
    "Free worldwide shipping",
  ]).slice(0, 4);
  const [b1, b2, b3, b4] = [
    bullets[0] || "Lifetime warranty",
    bullets[1] || "Conflict-free",
    bullets[2] || "Free shipping",
    bullets[3] || "30-day returns",
  ];
  const hook = input.hook.replace(/"/g, "'");
  const product = input.productTitle;
  const brand = input.brand || "Montier";

  // Strict text-rendering anchor — appended to every variant so nano-banana /
  // recraft don't paraphrase, abbreviate, or substitute letters.
  const headlineAnchor = `Render the headline text EXACTLY as: "${hook}". Do not stylize, abbreviate, paraphrase, or substitute any letters.`;
  const bulletsAnchor = `Render each bullet text EXACTLY as written: "${b1}", "${b2}", "${b3}". Do not change spelling or word order.`;
  const fourBulletsAnchor = `Render each bullet text EXACTLY as written: "${b1}", "${b2}", "${b3}", "${b4}". Do not change spelling or word order.`;
  const brandAnchor = `Render brand text EXACTLY as: "${brand}".`;

  const variants = [
    // Variant 1 — hero centered + checklist
    `Premium vertical 9:16 social ad creative, mobile-first. Photorealistic centered hero shot of ${product}, studio lighting with soft shadows. Top of frame: bold large white sans-serif headline that reads exactly "${hook}". Below the product, a clean white checklist showing exactly these three bullet points with checkmark icons: "✓ ${b1}", "✓ ${b2}", "✓ ${b3}". Bottom corner small ${brand} logotype. Background: deep matte black with subtle gold gradient. Luxury, editorial, ultra-realistic. ${headlineAnchor} ${bulletsAnchor} ${brandAnchor}`,

    // Variant 2 — split layout headline + bullets
    `Vertical 9:16 mobile ad. Split layout. Top half: photorealistic close-up macro photo of ${product} with sparkling realistic detail, soft rim light. Bottom half: solid dark background with large bold white serif headline that reads exactly "${hook}", under it four short text bullets in clean white sans-serif on separate lines: "${b1}", "${b2}", "${b3}", "${b4}". Minimal luxury aesthetic. Crisp legible text. ${brand} watermark bottom right. ${headlineAnchor} ${fourBulletsAnchor} ${brandAnchor}`,

    // Variant 3 — lifestyle + sticker badge
    `Mobile-first 9:16 ad creative, lifestyle shot. Photorealistic image of a confident person wearing ${product} in natural daylight, casually framed shoulders-up. Overlay big bold white text at top reading exactly "${hook}". Bottom right: round sticker badge with bold black text on white "✓ ${b1}". Bottom left: small ${brand} logotype. Realistic, polished, instagram-ready. ${headlineAnchor} Render badge text EXACTLY as: "✓ ${b1}". ${brandAnchor}`,

    // Variant 4 — comparison style
    `Vertical 9:16 social ad. Clean white background. Large bold black headline at top reading exactly "${hook}". Centered: photorealistic ${product}. Underneath, three side-by-side stat badges in dark capsules with white text: "${b1}", "${b2}", "${b3}". Minimal, editorial, ultra-sharp typography, magazine-style. ${brand} branding. ${headlineAnchor} ${bulletsAnchor} ${brandAnchor}`,
  ];

  return variants.slice(0, count);
}
