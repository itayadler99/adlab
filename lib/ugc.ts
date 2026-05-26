// UGC pipeline orchestrator. Stateless on the server — client holds UgcState
// and calls /api/ugc/advance with the latest state. Each advance call polls the
// current FAL job; when it completes, the next stage's FAL job is submitted.
import * as falLib from "./fal";
import {
  buildActorPrompt,
  buildCompositePrompt,
  buildCompositeRetryPrompt,
  buildAnimationPrompt,
  pickVoiceId,
  normalizeArchetype,
  type UgcPromptCtx,
  type VoiceArchetype,
} from "./ugc-prompts";
import { checkCompositePreservesProduct } from "./vision-check";

const COMPOSITE_VISION_THRESHOLD = 6; // confidence below this triggers a retry
const COMPOSITE_MAX_ATTEMPTS = 2;     // first attempt + 1 retry

// FAL endpoints used by each stage
export const FAL = {
  actor:    "fal-ai/flux-pro/v1.1-ultra",
  composite:"fal-ai/nano-banana/edit",
  animate:  "fal-ai/veo3.1/fast/image-to-video",
  tts:      "fal-ai/elevenlabs/tts/turbo-v2.5",
  lipsync:  "fal-ai/sync-lipsync/v2",
} as const;

export type UgcStage =
  | "actor"
  | "composite"
  | "animate"
  | "tts"
  | "lipsync"
  | "done"
  | "failed";

export interface UgcInputs {
  productTitle: string;
  productDescription?: string;
  productImageUrl: string; // public product image from Shopify
  script: string;
  hook: string;
  style: "ugc_review" | "yapping" | "founder_pov" | "demo";
  demographic?: string;
  setting?: string;
  language?: "en" | "he";
  /** Raw archetype string from the LLM — normalized via normalizeArchetype(). */
  voiceArchetype?: string;
}

export interface UgcArtifacts {
  actorImageUrl?: string;
  compositeImageUrl?: string;
  rawVideoUrl?: string;
  audioUrl?: string;
  finalVideoUrl?: string;
}

export interface CompositeAttemptLog {
  url?: string;
  match: boolean;
  confidence: number;
  reasons: string[];
}

export interface UgcState {
  stage: UgcStage;
  inputs: UgcInputs;
  artifacts: UgcArtifacts;
  pending?: { endpoint: string; jobId: string };
  error?: string;
  startedAt: number;
  updatedAt: number;
  /** How many composite attempts we have submitted (initial + retries). */
  compositeAttempts?: number;
  /** Per-attempt vision-check outcomes — surfaced to the UI for transparency. */
  compositeAttemptLog?: CompositeAttemptLog[];
}

const STAGE_ORDER: UgcStage[] = ["actor", "composite", "animate", "tts", "lipsync", "done"];

function nextStage(s: UgcStage): UgcStage {
  const idx = STAGE_ORDER.indexOf(s);
  if (idx < 0 || idx >= STAGE_ORDER.length - 1) return "done";
  return STAGE_ORDER[idx + 1];
}

/** Build initial state and submit the first stage (actor). */
export async function startUgc(inputs: UgcInputs): Promise<UgcState> {
  const now = Date.now();
  const state: UgcState = {
    stage: "actor",
    inputs,
    artifacts: {},
    startedAt: now,
    updatedAt: now,
  };
  await submitStage(state);
  return state;
}

/** Poll current pending job; on success, transition to next stage and submit it. */
export async function advanceUgc(state: UgcState): Promise<UgcState> {
  if (state.stage === "done" || state.stage === "failed") return state;
  if (!state.pending) {
    // Shouldn't happen — re-submit current stage.
    await submitStage(state);
    state.updatedAt = Date.now();
    return state;
  }

  const job = await falLib.poll(state.pending.endpoint, state.pending.jobId);

  if (job.status === "failed") {
    const failedStage = state.stage;
    state.stage = "failed";
    state.error = `${failedStage} stage failed: ${job.error || "unknown"}`;
    state.updatedAt = Date.now();
    return state;
  }
  if (job.status !== "succeeded") {
    // still processing
    state.updatedAt = Date.now();
    return state;
  }

  // succeeded — store artifact, advance
  switch (state.stage) {
    case "actor":
      state.artifacts.actorImageUrl = job.imageUrl;
      break;
    case "composite": {
      // Vision-gate: confirm the composite still contains the real product.
      // If confidence is too low and we haven't exhausted retries, re-submit
      // the composite with the stricter prompt.
      const candidateUrl = job.imageUrl;
      const check = candidateUrl
        ? await checkCompositePreservesProduct(candidateUrl, state.inputs.productImageUrl)
        : { match: true, confidence: 10, reasons: [] };
      state.compositeAttemptLog = [
        ...(state.compositeAttemptLog || []),
        { url: candidateUrl, match: check.match, confidence: check.confidence, reasons: check.reasons },
      ];
      const attempts = state.compositeAttempts ?? 1;
      const passed = check.match && check.confidence >= COMPOSITE_VISION_THRESHOLD;
      if (!passed && attempts < COMPOSITE_MAX_ATTEMPTS) {
        console.warn(
          `[ugc] composite attempt ${attempts} failed vision check (confidence=${check.confidence}, reasons=${(check.reasons || []).join("|")}); retrying with stricter prompt`
        );
        // Stay on composite stage, resubmit with retry prompt.
        state.compositeAttempts = attempts + 1;
        state.pending = undefined;
        try {
          await submitStage(state, { compositeRetryReasons: check.reasons });
          state.updatedAt = Date.now();
          return state;
        } catch (e) {
          state.stage = "failed";
          state.error = e instanceof Error ? e.message : String(e);
          state.updatedAt = Date.now();
          return state;
        }
      }
      // Accept this composite (either passed, or out of retries — best effort).
      state.artifacts.compositeImageUrl = candidateUrl;
      break;
    }
    case "animate":
      state.artifacts.rawVideoUrl = job.videoUrl;
      break;
    case "tts":
      state.artifacts.audioUrl = job.audioUrl;
      break;
    case "lipsync":
      state.artifacts.finalVideoUrl = job.videoUrl;
      break;
  }

  const next = nextStage(state.stage);
  state.stage = next;
  state.pending = undefined;
  state.updatedAt = Date.now();

  if (next !== "done") {
    try {
      await submitStage(state);
    } catch (e) {
      state.stage = "failed";
      state.error = e instanceof Error ? e.message : String(e);
    }
  }

  return state;
}

/** Submit the FAL job for the current stage and stash request_id in state.pending. */
async function submitStage(
  state: UgcState,
  opts: { compositeRetryReasons?: string[] } = {}
): Promise<void> {
  const archetype: VoiceArchetype = normalizeArchetype(state.inputs.voiceArchetype);
  const ctx: UgcPromptCtx = {
    productTitle: state.inputs.productTitle,
    productDescription: state.inputs.productDescription,
    hook: state.inputs.hook,
    style: state.inputs.style,
    demographic: state.inputs.demographic,
    setting: state.inputs.setting,
    language: state.inputs.language,
    voiceArchetype: archetype,
  };

  let endpoint: string;
  let input: Record<string, unknown>;

  switch (state.stage) {
    case "actor": {
      endpoint = FAL.actor;
      input = {
        prompt: buildActorPrompt(ctx),
        aspect_ratio: "9:16",
        num_images: 1,
        safety_tolerance: "5",
        output_format: "jpeg",
      };
      break;
    }
    case "composite": {
      if (!state.artifacts.actorImageUrl) throw new Error("composite stage: missing actorImageUrl");
      endpoint = FAL.composite;
      // On the first submission, compositeAttempts is undefined → seed to 1.
      // The advance loop bumps it to 2 before resubmitting on retry.
      if (state.compositeAttempts === undefined) state.compositeAttempts = 1;
      const isRetry = (state.compositeAttempts ?? 1) > 1;
      const prompt = isRetry
        ? buildCompositeRetryPrompt(ctx, opts.compositeRetryReasons || [])
        : buildCompositePrompt(ctx);
      input = {
        prompt,
        image_urls: [state.artifacts.actorImageUrl, state.inputs.productImageUrl],
        num_images: 1,
        output_format: "jpeg",
      };
      break;
    }
    case "animate": {
      if (!state.artifacts.compositeImageUrl) throw new Error("animate stage: missing compositeImageUrl");
      endpoint = FAL.animate;
      input = {
        prompt: buildAnimationPrompt(ctx, state.inputs.script),
        image_url: state.artifacts.compositeImageUrl,
        aspect_ratio: "9:16",
        resolution: "1080p",
        duration: "8s",
        generate_audio: false,
      };
      break;
    }
    case "tts": {
      endpoint = FAL.tts;
      input = {
        text: state.inputs.script,
        voice: pickVoiceId(archetype, state.inputs.language || "en"),
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.4,
        speed: 1.0,
      };
      break;
    }
    case "lipsync": {
      if (!state.artifacts.rawVideoUrl) throw new Error("lipsync stage: missing rawVideoUrl");
      if (!state.artifacts.audioUrl) throw new Error("lipsync stage: missing audioUrl");
      endpoint = FAL.lipsync;
      input = {
        video_url: state.artifacts.rawVideoUrl,
        audio_url: state.artifacts.audioUrl,
        sync_mode: "cut_off",
      };
      break;
    }
    default:
      return; // done / failed — nothing to submit
  }

  const { request_id } = await falLib.submit(endpoint, input);
  state.pending = { endpoint, jobId: request_id };
}

/** Convenience: derive UgcInputs from autopilot's analysis + product + script. */
export function planUgcInputs(args: {
  analysis: { hook: string; style: UgcInputs["style"]; body_themes: string[] };
  product: { title: string; description?: string; imageUrl?: string };
  script: string;
  language?: "en" | "he";
}): UgcInputs | null {
  if (!args.product.imageUrl) return null;
  return {
    productTitle: args.product.title,
    productDescription: args.product.description,
    productImageUrl: args.product.imageUrl,
    script: args.script,
    hook: args.analysis.hook,
    style: args.analysis.style,
    language: args.language || "en",
  };
}
