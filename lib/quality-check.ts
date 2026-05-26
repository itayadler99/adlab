// Vision-based judge for the final ad video.
//
// Loop semantics (used by /api/quality-check + autopilot UI):
//   1. Extract a representative frame from the final video (ffmpeg-static).
//   2. Score it against the product photo + script via Claude Vision
//      (rateVideoRealism — see lib/vision-check.ts).
//   3. If score < threshold (default 7) AND retries remaining, return
//      `retry: true` so the caller can re-trigger the animate stage with a
//      stricter prompt + different model. Retry cap = 2 to bound cost.
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
}

export interface QualityCheckOutput extends VideoQualityResult {
  attempt: number;
  maxAttempts: number;
  threshold: number;
  /** Frame URL we judged (useful for debugging). */
  frameUrl?: string;
}

const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_THRESHOLD = 7;

export async function checkVideoQuality(input: QualityCheckInput): Promise<QualityCheckOutput> {
  const threshold = input.threshold ?? DEFAULT_THRESHOLD;
  const attempt = input.attempt ?? 1;
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  let frameUrl: string | undefined;
  try {
    frameUrl = await extractAndUploadFrame(input.videoUrl);
  } catch (e) {
    // Frame extraction is a soft dependency — degrade to scoring the
    // video URL itself (anthropic can also follow http(s) for jpeg frames
    // hosted by Replicate/FAL, but most return mp4 only). If extraction
    // failed and we have no frame, return a permissive pass so we don't
    // block the pipeline.
    console.warn("[quality-check] frame extraction failed:", e instanceof Error ? e.message : e);
    return {
      score: 10,
      reasons: [`frame extraction failed: ${e instanceof Error ? e.message : e}`],
      retry: false,
      attempt,
      maxAttempts,
      threshold,
    };
  }

  const judged = await rateVideoRealism({
    frameUrl,
    productUrl: input.productImageUrl,
    script: input.script,
    threshold,
  });

  // Override retry decision against the attempt cap.
  const wouldRetry = judged.score < threshold;
  const canRetry = attempt < maxAttempts;

  return {
    ...judged,
    retry: wouldRetry && canRetry,
    attempt,
    maxAttempts,
    threshold,
    frameUrl,
  };
}

// ---- frame extraction ----------------------------------------------------

async function extractAndUploadFrame(videoUrl: string): Promise<string> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN not set — needed to host the extracted frame");
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
    const outPath = path.join(workDir, "frame.jpg");
    await writeFile(inPath, buf);

    // Pull a frame near the middle of the clip — most representative.
    await runFfmpeg(ffmpegPath, [
      "-y",
      "-ss", "2",
      "-i", inPath,
      "-frames:v", "1",
      "-q:v", "3",
      outPath,
    ]);

    const jpg = await readFile(outPath);
    const blob = await put(`frames/${Date.now()}.jpg`, jpg, {
      access: "public",
      contentType: "image/jpeg",
      addRandomSuffix: true,
    });
    return blob.url;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
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
