// Pick the cleanest reference shots from a Shopify product gallery.
//
// Problem: many storefront hero images show a model wearing multiple stacked
// items (e.g. a model with five Cuban chains), which makes the autopilot
// generate ads with the wrong number/shape of jewelry. We want the angles
// that show ONE item clearly — ideally a macro on a plain background — so
// the hero compositor and the i2v model can replicate the exact product.
//
// Output: ordered URLs, best-first. Caller takes top-K as references.

import { anthropic } from "./anthropic";

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
const ALLOWED: ImageMediaType[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

async function fetchBlock(url: string): Promise<
  | { type: "image"; source: { type: "base64"; media_type: ImageMediaType; data: string } }
  | null
> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim().toLowerCase();
    const media_type: ImageMediaType = ALLOWED.includes(ct as ImageMediaType)
      ? (ct as ImageMediaType)
      : "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    return { type: "image", source: { type: "base64", media_type, data: buf.toString("base64") } };
  } catch {
    return null;
  }
}

export interface GalleryPickResult {
  /** All gallery URLs, in best-first order (cleanest single-item shots up top). */
  ordered: string[];
  /** Top-K reference URLs we recommend feeding to hero + i2v. */
  references: string[];
  /** Single best macro shot to use as the i2v `start_image` anchor. */
  primary: string | undefined;
}

/**
 * Rank gallery URLs by usefulness as reference for product replication.
 * Best = single product, clean background, no model wearing multiple items.
 * Worst = model with stacked jewelry, lifestyle scenes, packaging shots.
 *
 * Sends all images in one Claude vision call with a strict-JSON schema so
 * we get ordering, primary pick, and references in one round-trip.
 */
export async function pickGalleryReferences(
  galleryUrls: string[],
  productTitle: string,
  refsCount = 3
): Promise<GalleryPickResult> {
  if (galleryUrls.length === 0) {
    return { ordered: [], references: [], primary: undefined };
  }
  if (galleryUrls.length === 1) {
    return { ordered: galleryUrls, references: galleryUrls, primary: galleryUrls[0] };
  }

  // Cap to avoid huge vision payloads.
  const trimmed = galleryUrls.slice(0, 12);
  const blocks = (await Promise.all(trimmed.map((u) => fetchBlock(u)))).map((b, i) => ({
    block: b,
    url: trimmed[i],
    index: i,
  }));
  const usable = blocks.filter((x) => x.block !== null) as Array<{
    block: NonNullable<(typeof blocks)[number]["block"]>;
    url: string;
    index: number;
  }>;

  if (usable.length === 0) {
    return { ordered: trimmed, references: trimmed.slice(0, refsCount), primary: trimmed[0] };
  }

  const sys = `You rank product photos for usefulness as a reference image when
recreating a product in an AI-generated ad. Goal: the ad must show ONE
specific item exactly. Bad references make the AI invent fake clasps,
extra chains, wrong stones, or merge multiple items.

Scoring (higher = better reference):
- +5 single product, no model, clean background, sharp focus
- +4 product on plain surface, no person, good angle
- +3 macro/detail close-up on the product
- +2 product on a body part (e.g. wrist/neck) with no other jewelry
- -3 model wearing the product AND other stacked items (causes hallucination)
- -2 packaging, gift box, or environmental scene that hides the product
- -1 blurry, dark, or oblique angle
- 0 baseline

Return STRICT JSON:
{
  "ranking": [<image indexes 0..N-1, best-first>],
  "primary": <index of single best macro/clean-single-item shot>,
  "notes": "<one sentence reasoning>"
}

The ranking array MUST include every image index exactly once.`;

  const userBlocks: Array<
    | { type: "image"; source: { type: "base64"; media_type: ImageMediaType; data: string } }
    | { type: "text"; text: string }
  > = [
    ...usable.map((x) => x.block),
    {
      type: "text",
      text: `Product: ${productTitle}\n\nThere are ${usable.length} images, indexed 0..${usable.length - 1} in the order shown. Rank them. Return JSON now.`,
    },
  ];

  try {
    const res = await anthropic().messages.create({
      model: "claude-opus-4-6",
      max_tokens: 600,
      system: sys,
      messages: [{ role: "user", content: userBlocks }],
    });
    const textBlock = res.content.find((b) => b.type === "text");
    const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("no json");
    const parsed = JSON.parse(m[0]) as { ranking?: number[]; primary?: number };

    const ranking = Array.isArray(parsed.ranking) ? parsed.ranking : [];
    // Validate: must reference each index exactly once, no out-of-range.
    const valid =
      ranking.length === usable.length &&
      ranking.every((i) => Number.isInteger(i) && i >= 0 && i < usable.length) &&
      new Set(ranking).size === ranking.length;

    const orderedIdx = valid ? ranking : usable.map((_, i) => i);
    const ordered = orderedIdx.map((i) => usable[i].url);
    const primaryIdx =
      typeof parsed.primary === "number" &&
      parsed.primary >= 0 &&
      parsed.primary < usable.length
        ? parsed.primary
        : orderedIdx[0];
    return {
      ordered,
      references: ordered.slice(0, refsCount),
      primary: usable[primaryIdx]?.url,
    };
  } catch {
    // Vision fail → fall back to storefront order. Better than nothing.
    const ordered = usable.map((x) => x.url);
    return {
      ordered,
      references: ordered.slice(0, refsCount),
      primary: ordered[0],
    };
  }
}
