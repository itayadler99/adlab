import Replicate from "replicate";

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
}

/**
 * Generate `count` sales-style static images with rendered text + bullet points.
 * Uses Ideogram v2 (Replicate) — best-in-class for legible on-image text.
 * Returns an array of pending Replicate prediction ids (poll via /api/poll?kind=image).
 */
export async function startSalesImages(
  input: SalesImageInput,
  count = 3
): Promise<ImageJob[]> {
  const prompts = buildSalesPrompts(input, count);
  const jobs: ImageJob[] = [];

  for (const prompt of prompts) {
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
    jobs.push({ id: prediction.id, status: "pending" });
  }

  return jobs;
}

export async function pollImage(jobId: string): Promise<ImageJob> {
  const prediction = await replicate.predictions.get(jobId);
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

  const variants = [
    // Variant 1 — hero centered + checklist
    `Premium vertical 9:16 social ad creative, mobile-first. Photorealistic centered hero shot of ${product}, studio lighting with soft shadows. Top of frame: bold large white sans-serif headline that reads exactly "${hook}". Below the product, a clean white checklist showing exactly these three bullet points with checkmark icons: "✓ ${b1}", "✓ ${b2}", "✓ ${b3}". Bottom corner small ${brand} logotype. Background: deep matte black with subtle gold gradient. Luxury, editorial, ultra-realistic.`,

    // Variant 2 — split layout headline + bullets
    `Vertical 9:16 mobile ad. Split layout. Top half: photorealistic close-up macro photo of ${product} with sparkling realistic detail, soft rim light. Bottom half: solid dark background with large bold white serif headline that reads exactly "${hook}", under it four short text bullets in clean white sans-serif on separate lines: "${b1}", "${b2}", "${b3}", "${b4}". Minimal luxury aesthetic. Crisp legible text. ${brand} watermark bottom right.`,

    // Variant 3 — lifestyle + sticker badge
    `Mobile-first 9:16 ad creative, lifestyle shot. Photorealistic image of a confident person wearing ${product} in natural daylight, casually framed shoulders-up. Overlay big bold white text at top reading exactly "${hook}". Bottom right: round sticker badge with bold black text on white "✓ ${b1}". Bottom left: small ${brand} logotype. Realistic, polished, instagram-ready.`,

    // Variant 4 — comparison style
    `Vertical 9:16 social ad. Clean white background. Large bold black headline at top reading exactly "${hook}". Centered: photorealistic ${product}. Underneath, three side-by-side stat badges in dark capsules with white text: "${b1}", "${b2}", "${b3}". Minimal, editorial, ultra-sharp typography, magazine-style. ${brand} branding.`,
  ];

  return variants.slice(0, count);
}
