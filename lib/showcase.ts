// Showcase pipeline — product-only ads (no actor on camera).
//
// Stage 1 (FAL nano-banana/edit): drop the real Shopify product into a styled
// studio frame so the first video frame is anchored on the exact item.
// Stage 2 (i2v): animate that hero into a 5-10s clip.
//
// Model preference, per RESEARCH_FINDINGS.md jewelry i2v ranking:
//   1. Kling 2.5 Pro      — best small-object fidelity. Stones, prongs,
//                           engraving stable 5-10s.
//   2. Seedance 2.0 Pro   — best identity lock; can drift on tiny stones.
//   3. Veo 3.1 Fast       — native audio but product drift past 5s.
//
// We try them in order. Each falls through to the next on auth/access/runtime
// errors. Kling start/end frame chaining is also supported for multi-clip
// showcase ads via `chainFromUrl` on the input.
//
// Stateless on the server — client holds ShowcaseState and ticks via
// /api/showcase/advance. Same shape as the UGC pipeline.
import Replicate from "replicate";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as falLib from "./fal";
import { checkVideoQuality } from "./quality-check";

export const FAL_HERO_ENDPOINT = "fal-ai/nano-banana/edit";
/** Secondary hero compositor. nano-banana failures fall through here. */
export const FAL_HERO_ENDPOINT_FALLBACK = "fal-ai/flux-pro/kontext";

export type ShowcaseStage = "hero" | "animate" | "done" | "failed";
type HeroProvider = "nano-banana" | "flux-kontext" | "raw-product";

const QUALITY_THRESHOLD = 7;
const QUALITY_MAX_ATTEMPTS = 2;

// ---- model registry (i2v) -------------------------------------------------

type AnimateModelId = "kling-2.5-pro" | "seedance-2.0-pro" | "veo-3.1-fast" | "kling-2.1-master";

interface AnimateModelSpec {
  provider: "fal" | "replicate";
  endpoint: string;
  maxSec: number;
  /** Whether the endpoint accepts an optional `tail_image_url` / end-frame anchor. */
  supportsEndFrame: boolean;
  label: string;
}

const ANIMATE_REGISTRY: Record<AnimateModelId, AnimateModelSpec> = {
  // Research rank #1 — best for jewelry fidelity. v2.5-turbo accepts start+end frames.
  "kling-2.5-pro": {
    provider: "fal",
    endpoint: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video",
    maxSec: 10,
    supportsEndFrame: true,
    label: "Kling 2.5 Pro (FAL)",
  },
  // Research rank #2 — strongest face + product identity lock; loose on tiny stones.
  "seedance-2.0-pro": {
    provider: "fal",
    endpoint: "fal-ai/bytedance/seedance/v2/pro/image-to-video",
    maxSec: 10,
    supportsEndFrame: false,
    label: "Seedance 2.0 Pro (FAL)",
  },
  // Research rank #3 — only model with native audio; drifts past 5s on small items.
  "veo-3.1-fast": {
    provider: "fal",
    endpoint: "fal-ai/veo3/fast/image-to-video",
    maxSec: 8,
    supportsEndFrame: false,
    label: "Veo 3.1 Fast (FAL)",
  },
  // Replicate fallback when every FAL i2v is gated for the account.
  "kling-2.1-master": {
    provider: "replicate",
    endpoint: "kwaivgi/kling-v2.1-master",
    maxSec: 10,
    supportsEndFrame: false,
    label: "Kling 2.1 (Replicate)",
  },
};

const ANIMATE_FALLBACK_CHAIN: AnimateModelId[] = [
  "kling-2.5-pro",
  "seedance-2.0-pro",
  "veo-3.1-fast",
  "kling-2.1-master",
];

function nextAnimateModel(current: AnimateModelId | undefined): AnimateModelId | null {
  const idx = current ? ANIMATE_FALLBACK_CHAIN.indexOf(current) : -1;
  if (idx < 0) return ANIMATE_FALLBACK_CHAIN[0];
  if (idx >= ANIMATE_FALLBACK_CHAIN.length - 1) return null;
  return ANIMATE_FALLBACK_CHAIN[idx + 1];
}

// ---- types ----------------------------------------------------------------

export interface ShowcaseInputs {
  productTitle: string;
  productImageUrl: string;
  hook: string;
  /** Optional creative direction — short phrase ("luxury moody studio", "marble surface morning light"). */
  scene?: string;
  /** Clip length in seconds. 5-10. */
  durationSec?: number;
  /** For multi-clip chaining: previous clip's final frame becomes this clip's start. */
  chainFromUrl?: string;
  /** Optional end-frame anchor (Kling 2.5 only). Drives a directed transition. */
  endFrameUrl?: string;
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
  /** Which hero compositor produced the current hero image. */
  heroProvider?: HeroProvider;
  /** Which i2v model produced the current attempt. */
  animateModel?: AnimateModelId;
  /** Number of full animate attempts (initial + quality-driven retries). */
  qualityAttempt?: number;
  /** Last vision-judge result, surfaced to the UI. */
  qualityScore?: number;
  qualityReasons?: string[];
  startedAt: number;
  updatedAt: number;
}

const replicate = () => new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

// ---- entrypoints ----------------------------------------------------------

export async function startShowcase(inputs: ShowcaseInputs): Promise<ShowcaseState> {
  const now = Date.now();
  const state: ShowcaseState = {
    stage: "hero",
    inputs,
    artifacts: {},
    qualityAttempt: 1,
    startedAt: now,
    updatedAt: now,
  };
  // If the caller already has a hero image (chain from prior clip), skip
  // straight to animate.
  if (inputs.chainFromUrl) {
    state.artifacts.heroImageUrl = inputs.chainFromUrl;
    state.stage = "animate";
    await submitAnimate(state, ANIMATE_FALLBACK_CHAIN[0]);
  } else {
    await submitHero(state);
  }
  return state;
}

export async function advanceShowcase(state: ShowcaseState): Promise<ShowcaseState> {
  if (state.stage === "done" || state.stage === "failed") return state;
  if (!state.pending) {
    // Re-submit current stage (e.g. after server restart wiped pending).
    if (state.stage === "hero") await submitHero(state);
    else if (state.stage === "animate") {
      const which = state.animateModel ?? ANIMATE_FALLBACK_CHAIN[0];
      await submitAnimate(state, which);
    }
    state.updatedAt = Date.now();
    return state;
  }

  try {
    if (state.pending.provider === "fal") {
      const job = await falLib.poll(state.pending.endpoint, state.pending.jobId);
      if (job.status === "failed") {
        // Animate failure → walk the i2v fallback chain.
        if (state.stage === "animate") {
          const fallback = nextAnimateModel(state.animateModel);
          if (fallback) {
            console.warn(
              `[showcase] ${state.animateModel} animate failed (${job.error || "unknown"}); falling back to ${fallback}`
            );
            state.pending = undefined;
            try {
              await submitAnimate(state, fallback);
              state.updatedAt = Date.now();
              return state;
            } catch (e) {
              state.stage = "failed";
              state.error = `animate fallback to ${fallback} failed: ${errMsg(e)}`;
              state.updatedAt = Date.now();
              return state;
            }
          }
        }
        // Hero failure → walk nano-banana → flux-kontext → raw-product.
        if (state.stage === "hero") {
          const nextProvider = nextHeroProvider(state.heroProvider);
          // nextHeroProvider("raw-product") returns "raw-product" — terminal,
          // we've already tried everything available. submitHero handles the
          // raw-product case (just uses productImageUrl directly).
          if (nextProvider !== state.heroProvider) {
            console.warn(
              `[showcase] hero ${state.heroProvider} failed (${job.error || "unknown"}); falling back to ${nextProvider}`
            );
            state.pending = undefined;
            try {
              await submitHero(state);
              state.updatedAt = Date.now();
              return state;
            } catch (e) {
              state.stage = "failed";
              state.error = `hero fallback to ${nextProvider} failed: ${errMsg(e)}`;
              state.updatedAt = Date.now();
              return state;
            }
          }
        }
        state.stage = "failed";
        state.error = `${state.stage} stage failed: ${job.error || "unknown"}`;
        state.updatedAt = Date.now();
        return state;
      }
      if (job.status !== "succeeded") {
        state.updatedAt = Date.now();
        return state;
      }
      if (state.stage === "hero") {
        state.artifacts.heroImageUrl = job.imageUrl;
        state.pending = undefined;
        state.stage = "animate";
        await submitAnimate(state, ANIMATE_FALLBACK_CHAIN[0]);
        state.updatedAt = Date.now();
        return state;
      }
      // FAL animate path — succeeded.
      if (state.stage === "animate") {
        const videoUrl = job.videoUrl;
        if (!videoUrl) {
          state.stage = "failed";
          state.error = "animate stage returned no video URL";
          state.updatedAt = Date.now();
          return state;
        }
        return await finalizeAnimate(state, videoUrl);
      }
    }

    // Replicate animate poll
    const prediction = await replicate().predictions.get(state.pending.jobId);
    const status = prediction.status as string;
    if (status === "failed" || status === "canceled") {
      const errStr = prediction.error ? String(prediction.error) : "unknown";
      const fallback = nextAnimateModel(state.animateModel);
      if (fallback) {
        console.warn(`[showcase] ${state.animateModel} failed (${errStr}); falling back to ${fallback}`);
        state.pending = undefined;
        try {
          await submitAnimate(state, fallback);
          state.updatedAt = Date.now();
          return state;
        } catch (e) {
          state.stage = "failed";
          state.error = `animate fallback to ${fallback} failed: ${errMsg(e)}`;
          state.updatedAt = Date.now();
          return state;
        }
      }
      state.stage = "failed";
      state.error = `animate stage failed: ${errStr}`;
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
    return await finalizeAnimate(state, videoUrl);
  } catch (e) {
    // Network or library error during poll. If we still have a fallback
    // model, try it instead of failing the whole pipeline.
    if (state.stage === "animate") {
      const fallback = nextAnimateModel(state.animateModel);
      if (fallback && isModelAccessError(e)) {
        console.warn(`[showcase] ${state.animateModel} access error (${errMsg(e)}); falling back to ${fallback}`);
        state.pending = undefined;
        try {
          await submitAnimate(state, fallback);
          state.updatedAt = Date.now();
          return state;
        } catch (e2) {
          state.stage = "failed";
          state.error = `animate fallback to ${fallback} failed: ${errMsg(e2)}`;
          state.updatedAt = Date.now();
          return state;
        }
      }
    }
    state.stage = "failed";
    state.error = errMsg(e);
    state.updatedAt = Date.now();
    return state;
  }
}

async function finalizeAnimate(state: ShowcaseState, videoUrl: string): Promise<ShowcaseState> {
  state.artifacts.videoUrl = videoUrl;
  state.pending = undefined;
  state.stage = "done";

  // Quality gate. Run Claude Vision on a frame; if score < threshold AND we
  // have a retry left, walk down the model chain (or back up to #1 if we're
  // already at the end) and re-submit. Capped at QUALITY_MAX_ATTEMPTS total.
  const attempt = state.qualityAttempt ?? 1;
  try {
    const qc = await checkVideoQuality({
      videoUrl,
      productImageUrl: state.inputs.productImageUrl,
      threshold: QUALITY_THRESHOLD,
      attempt,
      maxAttempts: QUALITY_MAX_ATTEMPTS,
    });
    state.qualityScore = qc.score;
    state.qualityReasons = qc.reasons;
    if (qc.retry) {
      const nextModel = nextAnimateModel(state.animateModel) ?? ANIMATE_FALLBACK_CHAIN[0];
      console.warn(
        `[showcase] quality score ${qc.score} < ${QUALITY_THRESHOLD} on attempt ${attempt}; re-animating with ${nextModel}`
      );
      state.qualityAttempt = attempt + 1;
      state.artifacts.videoUrl = undefined;
      state.stage = "animate";
      state.pending = undefined;
      await submitAnimate(state, nextModel);
    }
  } catch (e) {
    console.warn("[showcase] quality check errored, accepting current video:", errMsg(e));
  }
  state.updatedAt = Date.now();
  return state;
}

// ---- stage submitters -----------------------------------------------------

async function submitHero(state: ShowcaseState): Promise<void> {
  // Pick the next compositor in the chain we haven't tried yet.
  const nextProvider = nextHeroProvider(state.heroProvider);
  if (nextProvider === "raw-product") {
    // Terminal "no compositor available" fallback — animate straight off the
    // Shopify product photo. Quality drops (no styled background) but the
    // pipeline stays alive.
    state.artifacts.heroImageUrl = state.inputs.productImageUrl;
    state.heroProvider = "raw-product";
    state.pending = undefined;
    state.stage = "animate";
    await submitAnimate(state, ANIMATE_FALLBACK_CHAIN[0]);
    return;
  }

  const prompt = buildHeroPrompt(state.inputs);
  const endpoint =
    nextProvider === "nano-banana" ? FAL_HERO_ENDPOINT : FAL_HERO_ENDPOINT_FALLBACK;

  const input: Record<string, unknown> =
    nextProvider === "nano-banana"
      ? {
          prompt,
          image_urls: [state.inputs.productImageUrl],
          num_images: 1,
          output_format: "jpeg",
        }
      : {
          // flux-pro/kontext accepts a single conditioning image with an edit
          // prompt — same shape as nano-banana but a different field name.
          prompt,
          image_url: state.inputs.productImageUrl,
          num_images: 1,
          output_format: "jpeg",
        };

  try {
    const { request_id } = await falLib.submit(endpoint, input);
    state.pending = { provider: "fal", endpoint, jobId: request_id };
    state.heroProvider = nextProvider;
  } catch (e) {
    // FAL key revoked / model gated → mark this provider as tried and walk to
    // the next link in the chain. Eventually we land on raw-product which
    // animates straight off the Shopify image (no compositor needed).
    if (isAuthError(e)) {
      console.warn(`[showcase] hero ${nextProvider} auth failed (${errMsg(e)}); falling through`);
      state.heroProvider = nextProvider;
      state.pending = undefined;
      await submitHero(state);
      return;
    }
    throw e;
  }
}

function isAuthError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /unauthorized|cannot access application|forbidden|401|403/i.test(msg);
}

function nextHeroProvider(current?: HeroProvider): HeroProvider {
  switch (current) {
    case undefined:
      return "nano-banana";
    case "nano-banana":
      return "flux-kontext";
    case "flux-kontext":
      return "raw-product";
    case "raw-product":
      return "raw-product";
  }
}

async function submitAnimate(state: ShowcaseState, which: AnimateModelId): Promise<void> {
  if (!state.artifacts.heroImageUrl) throw new Error("animate stage: missing heroImageUrl");
  const spec = ANIMATE_REGISTRY[which];
  const duration = Math.min(spec.maxSec, Math.max(5, state.inputs.durationSec ?? 10));
  const prompt = buildAnimatePrompt(state.inputs);

  if (spec.provider === "fal") {
    const input = buildFalAnimateInput(which, state, prompt, duration);
    try {
      const { request_id } = await falLib.submit(spec.endpoint, input);
      state.pending = { provider: "fal", endpoint: spec.endpoint, jobId: request_id };
      state.animateModel = which;
      return;
    } catch (e) {
      // Same FAL key fail mode as hero — walk the chain to a non-FAL provider.
      if (isAuthError(e)) {
        const next = nextAnimateModel(which);
        if (!next) throw new Error(`animate: all providers failed (last auth error: ${errMsg(e)})`);
        console.warn(`[showcase] animate ${which} auth failed (${errMsg(e)}); falling back to ${next}`);
        state.animateModel = which;
        state.pending = undefined;
        return submitAnimate(state, next);
      }
      throw e;
    }
  }

  // Replicate path
  const input: Record<string, unknown> = {
    prompt,
    duration: duration <= 5 ? 5 : 10,
    aspect_ratio: "9:16",
    start_image: state.artifacts.heroImageUrl,
  };
  const prediction = await (replicate().predictions.create as (args: {
    model: `${string}/${string}`;
    input: Record<string, unknown>;
  }) => Promise<{ id: string }>)({
    model: spec.endpoint as `${string}/${string}`,
    input,
  });
  state.pending = { provider: "replicate", endpoint: spec.endpoint, jobId: prediction.id };
  state.animateModel = which;
}

function buildFalAnimateInput(
  which: AnimateModelId,
  state: ShowcaseState,
  prompt: string,
  duration: number
): Record<string, unknown> {
  const hero = state.artifacts.heroImageUrl!;
  switch (which) {
    case "kling-2.5-pro": {
      // Kling 2.5 Pro i2v supports `image_url` as start; `tail_image_url` is the
      // optional end-frame anchor for directed transitions.
      const input: Record<string, unknown> = {
        prompt,
        image_url: hero,
        duration: Math.min(10, Math.max(5, duration)),
        aspect_ratio: "9:16",
      };
      if (state.inputs.endFrameUrl) input.tail_image_url = state.inputs.endFrameUrl;
      return input;
    }
    case "seedance-2.0-pro":
      return {
        prompt,
        image_url: hero,
        duration: Math.min(10, Math.max(5, duration)),
        aspect_ratio: "9:16",
        resolution: "1080p",
      };
    case "veo-3.1-fast":
      return {
        prompt,
        image_url: hero,
        aspect_ratio: "9:16",
        resolution: "1080p",
        duration: `${Math.min(8, Math.max(5, duration))}s`,
        generate_audio: false, // showcase ads use music bed, not Veo audio
      };
    default:
      return { prompt, image_url: hero };
  }
}

// ---- prompt phrase library (from RESEARCH_FINDINGS.md) --------------------

/**
 * Phrases that empirically land realism (per RESEARCH_FINDINGS.md).
 * Useful for letting the UI surface "+ add phrase" suggestions or for the
 * autopilot script writer to pick from.
 */
export const REALISM_PHRASES_WORK: readonly string[] = Object.freeze([
  "shot on iPhone 15, vertical 9:16",
  "soft window light, late afternoon",
  "handheld, subtle camera shake",
  "natural skin with visible pores",
  "slightly overexposed highlights",
  "imperfect framing, subject off-center",
  "candid, unscripted, no eye contact with lens",
  "background slightly out of focus, depth of field",
  "raw, real, not polished, documentary feel",
]);

/**
 * Phrases that break realism. The prompt builders strip these; documenting
 * them here lets a hand-written script avoid them too.
 */
export const REALISM_PHRASES_BREAK: readonly string[] = Object.freeze([
  "cinematic 8k masterpiece",
  "professional studio lighting",
  "perfectly framed",
  "high quality",
]);

/** Strip the BREAK phrases from a candidate prompt (case-insensitive). */
export function scrubBreakPhrases(prompt: string): string {
  let out = prompt;
  for (const phrase of REALISM_PHRASES_BREAK) {
    out = out.replace(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "");
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

// ---- prompt builders ------------------------------------------------------

export function buildHeroPrompt(inputs: ShowcaseInputs): string {
  const scene = inputs.scene || pickDefaultScene(inputs.productTitle);
  return [
    `Place the EXACT product from this image as the hero of a macro product still.`,
    `Do not redesign, restyle, or invent any details — preserve every facet, link, gemstone, clasp, finish, and proportion of the original product 1:1.`,
    `Scene: ${scene}.`,
    `Soft window light from upper left in the late afternoon. Real shadow under the piece, real specular reflections on the metal and stones.`,
    `Macro lens 100mm equivalent, shallow depth of field, background slightly out of focus.`,
    `Photoreal jewelry catalog still, no text, no logos, no watermarks, no people.`,
    `Vertical 9:16 framing, slightly off-center, raw documentary feel.`,
  ].join(" ");
}

export function buildAnimatePrompt(inputs: ShowcaseInputs): string {
  return [
    `Animate this still into a slow macro reveal of ${inputs.productTitle}.`,
    `Camera: subtle handheld push-in then a gentle hold — slight camera shake, no cuts.`,
    `Light: soft window light slowly drifts across the metal, gentle specular reflections on stones.`,
    `Movement: real physical settle — tiny weight wobble of the piece, a single gentle catchlight glint, micro dust motes in the air.`,
    `The product itself does not morph, deform, duplicate, or change shape. No people, no hands, no other jewelry.`,
    `Shot on iPhone 15, vertical 9:16, mild ISO grain, natural color, slightly overexposed highlights, imperfect framing, candid documentary feel.`,
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

// ---- multi-clip sequence orchestrator -------------------------------------
//
// Drives N back-to-back showcase clips where the LAST frame of clip i becomes
// the START frame of clip i+1, giving an unbroken motion thread across the
// stitched ad. This is the Kling start/end-frame chaining technique from
// RESEARCH_FINDINGS.md applied to the product showcase path.
//
// Workflow:
//   1. startShowcaseSequence(inputs, totalSec) returns a state with one
//      ShowcaseState[0] tracking the first clip (hero → animate).
//   2. advanceShowcaseSequence() ticks the active sub-clip via advanceShowcase.
//   3. When the active clip finishes, we extract its last frame (ffmpeg-static),
//      upload to Blob, and spawn the next ShowcaseState seeded with
//      chainFromUrl = that last frame.
//   4. Loop until clips.length === planned. Caller then hands the produced
//      video URLs to stitchVideos() to produce the final master.

export interface ShowcaseSequenceInputs {
  productTitle: string;
  productImageUrl: string;
  hook: string;
  scene?: string;
  /** Total ad length in seconds. Sequence splits into clipSec-long sub-clips. */
  totalSec: number;
  /** Length of each sub-clip. Default 10 (max for most i2v models). */
  clipSec?: number;
}

export type ShowcaseSequenceStage = "running" | "done" | "failed";

export interface ShowcaseSequenceState {
  stage: ShowcaseSequenceStage;
  inputs: ShowcaseSequenceInputs;
  /** Per-clip sub-state. Last entry is the currently active clip. */
  clips: ShowcaseState[];
  /** Public URLs for finished clips, in order. Caller stitches these. */
  clipUrls: string[];
  /** How many sub-clips the sequence plans to produce. */
  plannedClips: number;
  error?: string;
  startedAt: number;
  updatedAt: number;
}

export async function startShowcaseSequence(
  inputs: ShowcaseSequenceInputs
): Promise<ShowcaseSequenceState> {
  const clipSec = clampClipSec(inputs.clipSec);
  const plannedClips = Math.max(1, Math.ceil(inputs.totalSec / clipSec));
  const first = await startShowcase({
    productTitle: inputs.productTitle,
    productImageUrl: inputs.productImageUrl,
    hook: inputs.hook,
    scene: inputs.scene,
    durationSec: clipSec,
  });
  return {
    stage: "running",
    inputs,
    clips: [first],
    clipUrls: [],
    plannedClips,
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export async function advanceShowcaseSequence(
  state: ShowcaseSequenceState
): Promise<ShowcaseSequenceState> {
  if (state.stage === "done" || state.stage === "failed") return state;
  const active = state.clips[state.clips.length - 1];
  if (!active) {
    state.stage = "failed";
    state.error = "no active sub-clip in sequence state";
    state.updatedAt = Date.now();
    return state;
  }

  // Tick the active clip's own state machine.
  const advanced = await advanceShowcase(active);
  state.clips[state.clips.length - 1] = advanced;
  state.updatedAt = Date.now();

  if (advanced.stage === "failed") {
    state.stage = "failed";
    state.error = `clip ${state.clips.length}/${state.plannedClips} failed: ${advanced.error || "unknown"}`;
    return state;
  }
  if (advanced.stage !== "done" || !advanced.artifacts.videoUrl) return state;

  // Active clip finished. Stash its URL.
  state.clipUrls.push(advanced.artifacts.videoUrl);

  // Done with all planned clips?
  if (state.clips.length >= state.plannedClips) {
    state.stage = "done";
    return state;
  }

  // Otherwise: extract last frame and kick off the next clip with it as
  // chainFromUrl. Extraction failures degrade gracefully — we fall back to
  // the hero composite path so the chain breaks but the next clip still runs.
  let lastFrameUrl: string | undefined;
  try {
    lastFrameUrl = await extractLastFrameToBlob(advanced.artifacts.videoUrl);
  } catch (e) {
    console.warn("[showcase-seq] last-frame extraction failed, next clip will start fresh:", errMsg(e));
  }

  try {
    const clipSec = clampClipSec(state.inputs.clipSec);
    const next = await startShowcase({
      productTitle: state.inputs.productTitle,
      productImageUrl: state.inputs.productImageUrl,
      hook: state.inputs.hook,
      scene: state.inputs.scene,
      durationSec: clipSec,
      chainFromUrl: lastFrameUrl,
    });
    state.clips.push(next);
    state.updatedAt = Date.now();
    return state;
  } catch (e) {
    state.stage = "failed";
    state.error = `failed to start clip ${state.clips.length + 1}: ${errMsg(e)}`;
    return state;
  }
}

function clampClipSec(v?: number): number {
  const n = typeof v === "number" && v > 0 ? Math.round(v) : 10;
  return Math.min(10, Math.max(5, n));
}

// ---- last-frame extraction (used by sequence chaining) --------------------

async function extractLastFrameToBlob(videoUrl: string): Promise<string> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN not set");
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ffmpegPath = require("ffmpeg-static") as string | null;
  if (!ffmpegPath) throw new Error("ffmpeg-static binary not available");

  const workDir = await mkdtemp(path.join(tmpdir(), "showcase-frame-"));
  try {
    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error(`fetch ${videoUrl}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const inPath = path.join(workDir, "in.mp4");
    const outPath = path.join(workDir, "last.jpg");
    await writeFile(inPath, buf);

    // Trick: -sseof -0.1 seeks to 0.1s before EOF, then -frames:v 1 grabs
    // the next decoded frame — effectively the last frame.
    await runFfmpegSpawn(ffmpegPath, [
      "-y", "-sseof", "-0.1",
      "-i", inPath,
      "-update", "1", "-frames:v", "1", "-q:v", "2",
      outPath,
    ]);

    const jpg = await readFile(outPath);
    const { put } = await import("@vercel/blob");
    const blob = await put(`showcase-chain/${Date.now()}.jpg`, jpg, {
      access: "public",
      contentType: "image/jpeg",
      addRandomSuffix: true,
    });
    return blob.url;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function runFfmpegSpawn(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-1500)}`));
    });
  });
}

// ---- helpers --------------------------------------------------------------

function isModelAccessError(e: unknown): boolean {
  const msg = errMsg(e).toLowerCase();
  return /unauthorized|cannot access|forbidden|not found|404|401|403/.test(msg);
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
