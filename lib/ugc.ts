// UGC pipeline orchestrator. Stateless on the server — client holds UgcState
// and calls /api/ugc/advance with the latest state. Each advance call polls the
// current FAL job; when it completes, the next stage's FAL job is submitted.
import Replicate from "replicate";
import * as falLib from "./fal";
import {
  buildActorPrompt,
  buildCompositePrompt,
  buildCompositeRetryPrompt,
  buildAnimationPrompt,
  pickVoiceId,
  buildVoiceSettings,
  sanitizeScriptForTts,
  normalizeArchetype,
  type UgcPromptCtx,
  type VoiceArchetype,
} from "./ugc-prompts";
import { checkCompositePreservesProduct } from "./vision-check";
import { predictVirality } from "./higgsfield";
import { renderSoulActorFrame, getPresetSoul } from "./souls";

const COMPOSITE_VISION_THRESHOLD = 6; // confidence below this triggers a retry
const COMPOSITE_MAX_ATTEMPTS = 2;     // first attempt + 1 retry

// FAL endpoints used by each stage
export const FAL = {
  actor:    "fal-ai/flux-pro/v1.1-ultra",
  composite:"fal-ai/nano-banana/edit",
  animate:  "fal-ai/veo3.1/fast/image-to-video",
  // TTS: prefer eleven-v3 (richer emotion/breath/pauses) with a
  // turbo-v2.5 fallback if the v3 endpoint rejects the submit.
  tts:      "fal-ai/elevenlabs/tts/eleven-v3",
  ttsFallback: "fal-ai/elevenlabs/tts/turbo-v2.5",
  // Lipsync FAL endpoint is the tier-2 fallback now; tier 1 is Replicate
  // sync/lipsync-2 (best 2026 Hebrew phoneme accuracy), tier 3 is the
  // legacy cjwbw/wav2lip on Replicate.
  lipsync:  "fal-ai/sync-lipsync/v2",
} as const;

// Replicate model slugs for the lipsync fallback chain.
const REPLICATE_LIPSYNC_PRIMARY = "sync/lipsync-2" as const;
const REPLICATE_LIPSYNC_LASTRESORT = "cjwbw/wav2lip" as const;

// sync/lipsync-2 is audio-driven (it tracks the waveform, not a phoneme
// transcript), so Hebrew accuracy is won two ways: (1) cleaner, slower Hebrew
// TTS upstream — see buildVoiceSettings in ugc-prompts; (2) a lower temperature
// here so the model tracks the audio tightly instead of inventing expressive
// mouth shapes that read as wrong on non-English phonemes. `cut_off` keeps the
// output the length of the (shorter) source rather than looping.
// `LIPSYNC2_TEMPERATURE` env lets the owner retune or zero it out if a future
// model build rejects the field (the chain falls through to FAL on a 422).
const LIPSYNC2_TEMPERATURE = (() => {
  const raw = Number(process.env.LIPSYNC2_TEMPERATURE);
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 0.5;
})();

// Phase 9: Replicate Veo 3 Fast (i2v) is the primary animate path now because
// the production FAL_KEY is revoked. FAL Veo stays as tier-2 fallback in case
// the key is rotated later.
const REPLICATE_ANIMATE_PRIMARY = "google/veo-3-fast" as const;

const replicate = () => new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

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
  /**
   * Optional Higgsfield Soul ID — pre-trained character. When set, the actor
   * stage is short-circuited (no flux-pro call) and the soul's rendered frame
   * is used as the actor image.
   */
  soulId?: string;
  /**
   * Enable virality_predictor pre-launch gate. When the final lipsync video
   * scores <40, the caller may regenerate the hook. Off by default.
   */
  viralityGate?: boolean;
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
  /**
   * `provider` is optional for backwards compatibility — older client state
   * payloads omit it and default to FAL.
   */
  pending?: { endpoint: string; jobId: string; provider?: "fal" | "replicate" };
  error?: string;
  startedAt: number;
  updatedAt: number;
  /** How many composite attempts we have submitted (initial + retries). */
  compositeAttempts?: number;
  /** Per-attempt vision-check outcomes — surfaced to the UI for transparency. */
  compositeAttemptLog?: CompositeAttemptLog[];
  /**
   * Which lipsync tier is currently being attempted (1 = Replicate
   * sync/lipsync-2, 2 = FAL sync-lipsync/v2, 3 = Replicate cjwbw/wav2lip).
   * Bumped automatically when a tier fails at submit or poll time.
   */
  lipsyncTier?: 1 | 2 | 3;
  /** Virality score (0-100) once the gate has run, plus any reasons. */
  viralityScore?: number;
  viralityReasons?: string[];
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

  const provider = state.pending.provider || "fal";
  const job = provider === "replicate"
    ? await pollReplicateJob(state.pending.jobId)
    : await falLib.poll(state.pending.endpoint, state.pending.jobId);

  if (job.status === "failed") {
    // Lipsync stage gets an in-band fallback to the next tier rather than
    // tearing down the whole pipeline — that's the whole point of the chain.
    if (state.stage === "lipsync") {
      const currentTier = state.lipsyncTier ?? 1;
      if (currentTier < 3) {
        const nextTier = (currentTier + 1) as 2 | 3;
        console.warn(
          `[ugc] lipsync tier ${currentTier} poll failed (${job.error || "unknown"}); falling through to tier ${nextTier}`
        );
        state.pending = undefined;
        state.lipsyncTier = nextTier;
        try {
          await submitLipsyncTier(state, nextTier);
          state.updatedAt = Date.now();
          return state;
        } catch (e) {
          // Submit-side failure on next tier — keep falling through.
          if (nextTier < 3) {
            try {
              await submitLipsyncTier(state, 3);
              state.lipsyncTier = 3;
              state.updatedAt = Date.now();
              return state;
            } catch (e2) {
              state.stage = "failed";
              state.error = e2 instanceof Error ? e2.message : String(e2);
              state.updatedAt = Date.now();
              return state;
            }
          }
          state.stage = "failed";
          state.error = e instanceof Error ? e.message : String(e);
          state.updatedAt = Date.now();
          return state;
        }
      }
    }
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
      // Virality gate — score the final video; surface results on state but
      // do not auto-regenerate here. Caller decides whether to re-fan-out.
      if (state.inputs.viralityGate && job.videoUrl) {
        try {
          const pred = await predictVirality(job.videoUrl);
          state.viralityScore = pred.score;
          state.viralityReasons = pred.reasons;
        } catch {
          /* gate is best-effort */
        }
      }
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
      // Soul ID short-circuit: render the actor frame directly via Higgsfield.
      // On success we stash the URL straight into artifacts and skip the FAL
      // submit. On any failure we fall through to flux-pro so the pipeline
      // never blocks on Higgsfield availability.
      if (state.inputs.soulId) {
        try {
          const soulFrameUrl = await renderSoulActorFrame({
            soulId: state.inputs.soulId,
            prompt: buildActorPrompt(ctx),
            aspectRatio: "9:16",
          });
          if (soulFrameUrl) {
            state.artifacts.actorImageUrl = soulFrameUrl;
            // Skip directly to composite by faking a "succeeded" pending.
            // Easier: advance the stage here.
            state.stage = "composite";
            state.pending = undefined;
            await submitStage(state, {});
            return;
          }
        } catch (e) {
          console.warn(
            "[ugc] Soul ID render failed, falling back to flux-pro:",
            e instanceof Error ? e.message : e
          );
        }
      }
      endpoint = FAL.actor;
      // When a preset Soul was requested but couldn't be rendered live, keep
      // the character recognizable by seeding the flux-pro prompt with the
      // preset's description.
      const presetSeed = state.inputs.soulId ? getPresetSoul(state.inputs.soulId)?.promptSeed : undefined;
      const actorPrompt = presetSeed
        ? `${buildActorPrompt(ctx)} The subject specifically is: ${presetSeed}.`
        : buildActorPrompt(ctx);
      input = {
        prompt: actorPrompt,
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
      const animatePrompt = buildAnimationPrompt(ctx, state.inputs.script);
      // Phase 9 primary: Replicate google/veo-3-fast (i2v). Falls back to FAL
      // Veo 3.1 Fast on any submit error (e.g. rate limit, transient outage).
      try {
        const prediction = await (replicate().predictions.create as (args: {
          model: `${string}/${string}`;
          input: Record<string, unknown>;
        }) => Promise<{ id: string }>)({
          model: REPLICATE_ANIMATE_PRIMARY,
          input: {
            prompt: animatePrompt,
            image: state.artifacts.compositeImageUrl,
            aspect_ratio: "9:16",
            duration_seconds: 8,
          },
        });
        state.pending = { endpoint: REPLICATE_ANIMATE_PRIMARY, jobId: prediction.id, provider: "replicate" };
        return;
      } catch (e) {
        console.warn(
          "[ugc] replicate veo-3-fast submit failed, falling back to FAL veo3.1/fast:",
          e instanceof Error ? e.message : e
        );
      }
      endpoint = FAL.animate;
      input = {
        prompt: animatePrompt,
        image_url: state.artifacts.compositeImageUrl,
        aspect_ratio: "9:16",
        resolution: "1080p",
        duration: "8s",
        generate_audio: false,
      };
      break;
    }
    case "tts": {
      const lang = state.inputs.language || "en";
      const voiceId = pickVoiceId(archetype, lang);
      // Tune voice_settings per archetype + language (Hebrew gets Israeli-market
      // cadence). Sanitize the script so Hebrew reads don't code-switch into an
      // English accent and so em-dashes don't leak into the prosody.
      const vs = buildVoiceSettings(archetype, lang);
      const ttsText = sanitizeScriptForTts(state.inputs.script, lang);
      // eleven-v3 takes a nested voice_settings object; turbo-v2.5 takes the
      // same fields flat. We submit v3 first and fall back to turbo-v2.5 if
      // v3 rejects (4xx, unsupported voice, account not enabled, etc.).
      try {
        const v3Input = {
          text: ttsText,
          voice: voiceId,
          // eleven-v3 takes a language_code hint to lock pronunciation.
          language_code: lang,
          voice_settings: {
            stability: vs.stability,
            similarity_boost: vs.similarity_boost,
            style: vs.style,
            use_speaker_boost: vs.use_speaker_boost,
            speed: vs.speed,
          },
        };
        const { request_id } = await falLib.submit(FAL.tts, v3Input);
        state.pending = { endpoint: FAL.tts, jobId: request_id };
        return;
      } catch (e) {
        console.warn(
          "[ugc] elevenlabs v3 submit failed, falling back to turbo-v2.5:",
          e instanceof Error ? e.message : e
        );
      }
      endpoint = FAL.ttsFallback;
      input = {
        text: ttsText,
        voice: voiceId,
        language_code: lang,
        stability: vs.stability,
        similarity_boost: vs.similarity_boost,
        style: vs.style,
        speed: vs.speed,
      };
      break;
    }
    case "lipsync": {
      if (!state.artifacts.rawVideoUrl) throw new Error("lipsync stage: missing rawVideoUrl");
      if (!state.artifacts.audioUrl) throw new Error("lipsync stage: missing audioUrl");
      // Tiered fallback (Replicate sync/lipsync-2 → FAL sync-lipsync/v2 →
      // Replicate cjwbw/wav2lip) is handled by a dedicated helper that
      // updates state.pending + state.lipsyncTier in-band.
      const tier = state.lipsyncTier ?? 1;
      await submitLipsyncTier(state, tier);
      return;
    }
    default:
      return; // done / failed — nothing to submit
  }

  const { request_id } = await falLib.submit(endpoint, input);
  state.pending = { endpoint, jobId: request_id, provider: "fal" };
}

/**
 * Submit a lipsync job at the requested tier; on submit-time failure,
 * walk forward through the fallback chain. The poll-side fallback is
 * handled in advanceUgc.
 */
async function submitLipsyncTier(state: UgcState, tier: 1 | 2 | 3): Promise<void> {
  const video = state.artifacts.rawVideoUrl;
  const audio = state.artifacts.audioUrl;
  if (!video || !audio) throw new Error("lipsync stage: missing video or audio");

  if (tier === 1) {
    try {
      const prediction = await (replicate().predictions.create as (args: {
        model: `${string}/${string}`;
        input: Record<string, unknown>;
      }) => Promise<{ id: string }>)({
        model: REPLICATE_LIPSYNC_PRIMARY,
        input: { video, audio, sync_mode: "cut_off", temperature: LIPSYNC2_TEMPERATURE },
      });
      state.pending = { endpoint: REPLICATE_LIPSYNC_PRIMARY, jobId: prediction.id, provider: "replicate" };
      state.lipsyncTier = 1;
      return;
    } catch (e) {
      console.warn(
        "[ugc] replicate sync/lipsync-2 submit failed, falling back to fal sync-lipsync v2:",
        e instanceof Error ? e.message : e
      );
      return submitLipsyncTier(state, 2);
    }
  }

  if (tier === 2) {
    try {
      const { request_id } = await falLib.submit(FAL.lipsync, {
        video_url: video,
        audio_url: audio,
        sync_mode: "cut_off",
      });
      state.pending = { endpoint: FAL.lipsync, jobId: request_id, provider: "fal" };
      state.lipsyncTier = 2;
      return;
    } catch (e) {
      console.warn(
        "[ugc] fal sync-lipsync v2 submit failed, falling back to replicate cjwbw/wav2lip:",
        e instanceof Error ? e.message : e
      );
      return submitLipsyncTier(state, 3);
    }
  }

  // tier 3 — last resort. wav2lip takes { face, audio }.
  const prediction = await (replicate().predictions.create as (args: {
    model: `${string}/${string}`;
    input: Record<string, unknown>;
  }) => Promise<{ id: string }>)({
    model: REPLICATE_LIPSYNC_LASTRESORT,
    input: { face: video, audio },
  });
  state.pending = { endpoint: REPLICATE_LIPSYNC_LASTRESORT, jobId: prediction.id, provider: "replicate" };
  state.lipsyncTier = 3;
}

interface PolledJob {
  status: "pending" | "processing" | "succeeded" | "failed";
  videoUrl?: string;
  imageUrl?: string;
  audioUrl?: string;
  error?: string;
}

async function pollReplicateJob(jobId: string): Promise<PolledJob> {
  const prediction = await replicate().predictions.get(jobId);
  const s = prediction.status as string;
  let mapped: PolledJob["status"] = "processing";
  if (s === "succeeded") mapped = "succeeded";
  else if (s === "failed" || s === "canceled") mapped = "failed";

  let videoUrl: string | undefined;
  if (mapped === "succeeded") {
    const out = prediction.output as unknown;
    if (typeof out === "string") videoUrl = out;
    else if (Array.isArray(out) && typeof out[0] === "string") videoUrl = out[0];
    else if (out && typeof out === "object") {
      const obj = out as Record<string, unknown>;
      if (typeof obj.video === "string") videoUrl = obj.video;
      else if (typeof obj.url === "string") videoUrl = obj.url;
      else if (Array.isArray(obj.video) && typeof obj.video[0] === "string") videoUrl = obj.video[0] as string;
    }
  }

  return {
    status: mapped,
    videoUrl,
    error: prediction.error ? String(prediction.error) : undefined,
  };
}

/** Convenience: derive UgcInputs from autopilot's analysis + product + script. */
export function planUgcInputs(args: {
  analysis: {
    hook: string;
    style: UgcInputs["style"];
    body_themes: string[];
    /** Optional hints from the LLM analysis. */
    voiceArchetype?: string;
    demographic?: string;
    setting?: string;
  };
  product: { title: string; description?: string; imageUrl?: string };
  script: string;
  language?: "en" | "he";
  /** Optional Soul ID + virality gate, forwarded straight through. */
  soulId?: string;
  viralityGate?: boolean;
  /** Caller overrides win over analysis-derived hints. */
  demographic?: string;
  setting?: string;
  voiceArchetype?: string;
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
    voiceArchetype: args.voiceArchetype ?? args.analysis.voiceArchetype,
    demographic: args.demographic ?? args.analysis.demographic,
    setting: args.setting ?? args.analysis.setting,
    soulId: args.soulId,
    viralityGate: args.viralityGate,
  };
}
