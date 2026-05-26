// Showcase pipeline — product-only ads (no actor on camera).
//
// Stage 1 (FAL nano-banana/edit): drop the real Shopify product into a styled
// studio frame so the first video frame is anchored on the exact item.
// Stage 2 (Replicate bytedance/seedance-1-pro, i2v): animate that hero into a
// 10s 1080p clip. Kling 2.1 is the fallback if seedance rejects.
//
// Stateless on the server — client holds ShowcaseState and ticks via
// /api/showcase/advance. Same shape as the UGC pipeline.
import Replicate from "replicate";
import * as falLib from "./fal";

export const FAL_HERO_ENDPOINT = "fal-ai/nano-banana/edit";

export type ShowcaseStage = "hero" | "animate" | "done" | "failed";

export interface ShowcaseInputs {
  productTitle: string;
  productImageUrl: string;
  hook: string;
  /** Optional creative direction — short phrase ("luxury moody studio", "marble surface morning light"). */
  scene?: string;
  /** Clip length in seconds. Seedance caps at 10. */
  durationSec?: number;
}

export interface ShowcaseArtifacts {
  heroImageUrl?: string;
  videoUrl?: string;
}

export interface ShowcasePending {
  provider: "fal" | "replicate";
  endpoint: string; // FAL endpoint OR Replicate model slug
  jobId: string;
}

export interface ShowcaseState {
  stage: ShowcaseStage;
  inputs: ShowcaseInputs;
  artifacts: ShowcaseArtifacts;
  pending?: ShowcasePending;
  error?: string;
  /** Which animate model produced the current attempt — useful for fallback. */
  animateModel?: "seedance-1-pro" | "kling-2.1";
  startedAt: number;
  updatedAt: number;
}

const SEEDANCE_MODEL = "bytedance/seedance-1-pro";
const KLING_MODEL = "kwaivgi/kling-v2.1-master";

const replicate = () => new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

export async function startShowcase(inputs: ShowcaseInputs): Promise<ShowcaseState> {
  const now = Date.now();
  const state: ShowcaseState = {
    stage: "hero",
    inputs,
    artifacts: {},
    startedAt: now,
    updatedAt: now,
  };
  await submitHero(state);
  return state;
}

export async function advanceShowcase(state: ShowcaseState): Promise<ShowcaseState> {
  if (state.stage === "done" || state.stage === "failed") return state;
  if (!state.pending) {
    // Re-submit current stage (e.g. after server restart wiped pending).
    if (state.stage === "hero") await submitHero(state);
    else if (state.stage === "animate") await submitAnimate(state, "seedance-1-pro");
    state.updatedAt = Date.now();
    return state;
  }

  try {
    if (state.pending.provider === "fal") {
      const job = await falLib.poll(state.pending.endpoint, state.pending.jobId);
      if (job.status === "failed") {
        state.stage = "failed";
        state.error = `hero stage failed: ${job.error || "unknown"}`;
        state.updatedAt = Date.now();
        return state;
      }
      if (job.status !== "succeeded") {
        state.updatedAt = Date.now();
        return state;
      }
      state.artifacts.heroImageUrl = job.imageUrl;
      state.pending = undefined;
      state.stage = "animate";
      await submitAnimate(state, "seedance-1-pro");
      state.updatedAt = Date.now();
      return state;
    }

    // Replicate poll
    const prediction = await replicate().predictions.get(state.pending.jobId);
    const status = prediction.status as string;
    if (status === "failed" || status === "canceled") {
      // Animate failed — try fallback model once.
      const errMsg = prediction.error ? String(prediction.error) : "unknown";
      if (state.animateModel === "seedance-1-pro") {
        console.warn(`[showcase] seedance failed (${errMsg}), retrying with kling-2.1`);
        state.pending = undefined;
        try {
          await submitAnimate(state, "kling-2.1");
          state.updatedAt = Date.now();
          return state;
        } catch (e) {
          state.stage = "failed";
          state.error = `animate fallback failed: ${e instanceof Error ? e.message : e}`;
          state.updatedAt = Date.now();
          return state;
        }
      }
      state.stage = "failed";
      state.error = `animate stage failed: ${errMsg}`;
      state.updatedAt = Date.now();
      return state;
    }
    if (status !== "succeeded") {
      state.updatedAt = Date.now();
      return state;
    }
    const out = prediction.output as string | string[] | null;
    const videoUrl = typeof out === "string" ? out : Array.isArray(out) ? out[0] : undefined;
    if (!videoUrl) {
      state.stage = "failed";
      state.error = "animate stage returned no video URL";
      state.updatedAt = Date.now();
      return state;
    }
    state.artifacts.videoUrl = videoUrl;
    state.pending = undefined;
    state.stage = "done";
    state.updatedAt = Date.now();
    return state;
  } catch (e) {
    state.stage = "failed";
    state.error = e instanceof Error ? e.message : String(e);
    state.updatedAt = Date.now();
    return state;
  }
}

async function submitHero(state: ShowcaseState): Promise<void> {
  const prompt = buildHeroPrompt(state.inputs);
  const { request_id } = await falLib.submit(FAL_HERO_ENDPOINT, {
    prompt,
    image_urls: [state.inputs.productImageUrl],
    num_images: 1,
    output_format: "jpeg",
  });
  state.pending = { provider: "fal", endpoint: FAL_HERO_ENDPOINT, jobId: request_id };
}

async function submitAnimate(state: ShowcaseState, which: "seedance-1-pro" | "kling-2.1"): Promise<void> {
  if (!state.artifacts.heroImageUrl) throw new Error("animate stage: missing heroImageUrl");
  const duration = Math.min(10, Math.max(5, state.inputs.durationSec ?? 10));
  const prompt = buildAnimatePrompt(state.inputs);

  let model: `${string}/${string}`;
  let input: Record<string, unknown>;
  if (which === "seedance-1-pro") {
    model = SEEDANCE_MODEL;
    input = {
      prompt,
      duration,
      aspect_ratio: "9:16",
      resolution: "1080p",
      image: state.artifacts.heroImageUrl,
    };
  } else {
    model = KLING_MODEL;
    input = {
      prompt,
      duration: duration <= 5 ? 5 : 10,
      aspect_ratio: "9:16",
      start_image: state.artifacts.heroImageUrl,
    };
  }

  const prediction = await (replicate().predictions.create as (args: {
    model: `${string}/${string}`;
    input: Record<string, unknown>;
  }) => Promise<{ id: string }>)({ model, input });
  state.pending = { provider: "replicate", endpoint: model, jobId: prediction.id };
  state.animateModel = which;
}

// ---- prompt builders ------------------------------------------------------

export function buildHeroPrompt(inputs: ShowcaseInputs): string {
  const scene = inputs.scene || pickDefaultScene(inputs.productTitle);
  return [
    `Place the EXACT product from this image as the hero of a luxury macro product photograph.`,
    `Do not redesign, restyle, or invent any details — preserve every facet, link, gemstone, clasp, finish, and proportion of the original product 1:1.`,
    `Scene: ${scene}.`,
    `Studio macro lens 100mm, shallow depth of field, soft directional key light from upper left, gentle bounce fill, subtle specular highlights catching the metal and stones.`,
    `Photoreal, editorial jewelry catalog quality, no text, no logos, no watermarks, no people.`,
    `Vertical 9:16 framing centered on the product.`,
  ].join(" ");
}

export function buildAnimatePrompt(inputs: ShowcaseInputs): string {
  return [
    `Animate this still product photograph into a slow cinematic macro reveal of ${inputs.productTitle}.`,
    `Camera: 4-second slow push-in plus subtle parallax orbit, then a gentle hold. No cuts.`,
    `Light: slow warm key drift across the metal, soft glittering specular reflections on the stones.`,
    `Movement: real physical settle — tiny weight wobble of the piece, a single gentle catchlight glint, micro dust motes in the air.`,
    `The product itself does not morph, deform, duplicate, or change shape. No people, no hands, no jewelry other than the exact item shown.`,
    `Shot on a high-end mirrorless body, mild ISO grain, color graded with a faint teal/orange luxury look. Crisp 1080p vertical 9:16.`,
  ].join(" ");
}

function pickDefaultScene(productTitle: string): string {
  const t = productTitle.toLowerCase();
  if (/ring|band/.test(t)) return "polished black stone slab with soft white reflections, single product centered";
  if (/chain|necklace|pendant/.test(t)) return "matte cream linen draped softly, single piece arranged in a relaxed curve";
  if (/earring|stud|hoop/.test(t)) return "brushed pearl-grey velvet pad, single pair arranged side by side";
  if (/bracelet|cuff/.test(t)) return "warm walnut wood surface, soft morning window light, single piece";
  return "minimal cream marble surface, single product centered, soft window light from the right";
}

// ---- routing heuristic for autopilot --------------------------------------

/**
 * Decide whether the showcase (product-only) path is the right pick.
 * - Style "demo" or "founder_pov" with a product image always routes here.
 * - Other styles route here only when the user opts in explicitly.
 */
export function shouldUseShowcase(opts: {
  hasProductImage: boolean;
  style: string;
  productTitle?: string;
}): boolean {
  if (!opts.hasProductImage) return false;
  if (opts.style === "demo") return true;
  // founder_pov often shows the product close-up; if we have a clean product
  // photo, the showcase path usually beats a fake actor.
  if (opts.style === "founder_pov" && isSmallWearable(opts.productTitle)) return true;
  return false;
}

function isSmallWearable(title?: string): boolean {
  if (!title) return false;
  return /ring|band|chain|necklace|pendant|earring|stud|hoop|bracelet|cuff|watch/i.test(title);
}
