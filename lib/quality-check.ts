// Vision-based judge for the final ad video.
//
// Loop semantics (used by /api/quality-check + the showcase state machine):
//   1. Extract N representative frames from the final video (ffmpeg-static).
//      Default = 3 frames sampled at 10%/50%/90% of the clip.
//   2. Score each frame against the product photo + script via Claude Vision
//      (rateVideoRealism — see lib/vision-check.ts).
//   3. Worst frame drives the verdict — a single frame full of AI tells is
//      a fail even if the others are clean.
//   4. If worst score < threshold (default 7) AND retries remaining, return
//      `retry: true`. Retry cap = 2 to bound cost.
//   5. Optionally persist the full record (per-frame URLs + scores) to a
//      Vercel Blob under /quality-log/ so a later cron can analyze drift.
//
// This file is the canonical surface — callers should import from here
// rather than from vision-check.ts directly.
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { put } from "@vercel/blob";
import { rateVideoRealism, type VideoQualityResult } from "./vision-check";

export type { VideoQualityResult } from "./vision-check";

export interface QualityCheckInput {
  videoUrl: string;
  productImageUrl: string;
  script?: string;
  /** Score below which we recommend a retry. Default 7. */
  threshold?: number;
  /** Attempts already made — pipeline caps re-animation at 2 total. */
  attempt?: number;
  /** Hard cap on total attempts (initial + retries). Default 2. */
  maxAttempts?: number;
  /** How many frames to sample. Default 3 (10%/50%/90% of duration). */
  frameCount?: number;
  /** Override sample positions in (0,1). Length must equal frameCount when both set. */
  framePositions?: number[];
  /** Persist the per-frame record to Vercel Blob under /quality-log/. */
  persistLog?: boolean;
  /** Caller-supplied tag (e.g. "showcase:montier:ring-7") for the log key. */
  logTag?: string;
}

export interface FrameJudgement extends VideoQualityResult {
  /** Where in the clip we sampled (seconds). */
  atSec: number;
  /** Sampled-frame URL (Vercel Blob jpeg). */
  frameUrl: string;
}

export interface QualityCheckOutput {
  /** Worst score across all sampled frames — drives the retry verdict. */
  score: number;
  /** Reasons union'd from every frame judgement, top 6 surfaced. */
  reasons: string[];
  retry: boolean;
  /** Per-frame breakdown, in chronological order. */
  frames: FrameJudgement[];
  attempt: number;
  maxAttempts: number;
  threshold: number;
  /** Backwards-compat alias — URL of the worst-scoring frame. */
  frameUrl?: string;
  /** Backwards-compat alias — six-criterion breakdown of the worst frame. */
  details?: FrameJudgement["details"];
  /** Blob URL where the JSON record was persisted, if persistLog was true. */
  logUrl?: string;
}

const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_THRESHOLD = 7;
const DEFAULT_FRAME_COUNT = 3;
const DEFAULT_FRAME_POSITIONS = [0.1, 0.5, 0.9];

export async function checkVideoQuality(input: QualityCheckInput): Promise<QualityCheckOutput> {
  const threshold = input.threshold ?? DEFAULT_THRESHOLD;
  const attempt = input.attempt ?? 1;
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const frameCount = Math.max(1, Math.min(6, input.frameCount ?? DEFAULT_FRAME_COUNT));
  const positions =
    input.framePositions && input.framePositions.length === frameCount
      ? input.framePositions
      : defaultPositions(frameCount);

  // Frame extraction is a soft dependency — if it fails entirely we pass.
  let frames: { atSec: number; url: string }[] = [];
  try {
    frames = await extractAndUploadFrames(input.videoUrl, positions);
  } catch (e) {
    console.warn("[quality-check] frame extraction failed:", errMsg(e));
    return {
      score: 10,
      reasons: [`frame extraction failed: ${errMsg(e)}`],
      retry: false,
      frames: [],
      attempt,
      maxAttempts,
      threshold,
    };
  }

  // Score each frame in parallel — independent Anthropic calls.
  const judged = await Promise.all(
    frames.map(async (f) => {
      const r = await rateVideoRealism({
        frameUrl: f.url,
        productUrl: input.productImageUrl,
        script: input.script,
        threshold,
      });
      const judgement: FrameJudgement = { ...r, atSec: f.atSec, frameUrl: f.url };
      return judgement;
    })
  );

  // Worst frame drives the verdict.
  const score = judged.reduce((min, j) => Math.min(min, j.score), Infinity);
  const reasons = dedupeStrings(judged.flatMap((j) => j.reasons)).slice(0, 6);
  const wouldRetry = score < threshold;
  const canRetry = attempt < maxAttempts;

  // Pick the worst-scoring frame for the backwards-compat alias fields.
  const worst = judged.reduce<FrameJudgement | undefined>(
    (acc, j) => (acc === undefined || j.score < acc.score ? j : acc),
    undefined
  );

  const out: QualityCheckOutput = {
    score: Number.isFinite(score) ? score : 10,
    reasons,
    retry: wouldRetry && canRetry,
    frames: judged,
    attempt,
    maxAttempts,
    threshold,
    frameUrl: worst?.frameUrl,
    details: worst?.details,
  };

  if (input.persistLog) {
    try {
      out.logUrl = await persistQualityLog(out, input);
    } catch (e) {
      console.warn("[quality-check] log persistence failed:", errMsg(e));
    }
  }

  return out;
}

function defaultPositions(n: number): number[] {
  if (n === DEFAULT_FRAME_COUNT) return DEFAULT_FRAME_POSITIONS;
  if (n === 1) return [0.5];
  // Evenly spaced sampling avoiding the very first/last frame which can be
  // black or a fade.
  const step = 0.8 / (n - 1);
  return Array.from({ length: n }, (_, i) => 0.1 + step * i);
}

function dedupeStrings(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    const key = s.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s.trim());
  }
  return out;
}

// ---- frame extraction ----------------------------------------------------

async function extractAndUploadFrames(
  videoUrl: string,
  positions: number[]
): Promise<{ atSec: number; url: string }[]> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN not set — needed to host extracted frames");
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ffmpegPath = require("ffmpeg-static") as string | null;
  if (!ffmpegPath) throw new Error("ffmpeg-static binary not available");

  const workDir = await mkdtemp(path.join(tmpdir(), "frame-"));
  try {
    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error(`fetch ${videoUrl}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const inPath = path.join(workDir, "in.mp4");
    await writeFile(inPath, buf);

    // Probe duration so we can convert fractional positions to seconds. We
    // use ffmpeg's own format-detection pass — no separate ffprobe binary.
    const duration = await probeDuration(ffmpegPath, inPath);

    const out: { atSec: number; url: string }[] = [];
    for (let i = 0; i < positions.length; i++) {
      const pos = Math.max(0, Math.min(1, positions[i]));
      const atSec = duration ? Math.max(0, duration * pos) : 1 + i; // fallback when probe fails
      const jpgPath = path.join(workDir, `frame-${i}.jpg`);
      try {
        await runFfmpeg(ffmpegPath, [
          "-y",
          "-ss", String(atSec),
          "-i", inPath,
          "-frames:v", "1",
          "-q:v", "3",
          jpgPath,
        ]);
        const jpg = await readFile(jpgPath);
        const blob = await put(`frames/${Date.now()}-${i}.jpg`, jpg, {
          access: "public",
          contentType: "image/jpeg",
          addRandomSuffix: true,
        });
        out.push({ atSec, url: blob.url });
      } catch (e) {
        console.warn(`[quality-check] frame ${i} at ${atSec.toFixed(2)}s failed:`, errMsg(e));
      }
    }
    if (out.length === 0) throw new Error("no frames could be extracted");
    return out;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function probeDuration(ffmpegPath: string, inPath: string): Promise<number | null> {
  // Parse ffmpeg's stderr line "Duration: HH:MM:SS.ss,". We don't need ffprobe.
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, ["-hide_banner", "-i", inPath], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", () => {
      const m = stderr.match(/Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!m) return resolve(null);
      const h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      const s = parseFloat(m[3]);
      resolve(h * 3600 + min * 60 + s);
    });
    proc.on("error", () => resolve(null));
  });
}

// ---- log persistence -----------------------------------------------------

async function persistQualityLog(
  out: QualityCheckOutput,
  input: QualityCheckInput
): Promise<string> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN not set");
  }
  const tag = (input.logTag || "anon")
    .replace(/[^a-z0-9\-:_]/gi, "_")
    .slice(0, 80);
  const key = `quality-log/${tag}/${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const record = {
    when: new Date().toISOString(),
    videoUrl: input.videoUrl,
    productImageUrl: input.productImageUrl,
    script: input.script,
    threshold: out.threshold,
    score: out.score,
    reasons: out.reasons,
    frames: out.frames.map((f) => ({
      atSec: f.atSec,
      frameUrl: f.frameUrl,
      score: f.score,
      reasons: f.reasons,
      details: f.details,
    })),
  };
  const blob = await put(key, JSON.stringify(record, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: true,
  });
  return blob.url;
}

function runFfmpeg(bin: string, args: string[]): Promise<void> {
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

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
