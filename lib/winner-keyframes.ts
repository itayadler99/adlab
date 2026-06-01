// Keyframe extraction for cloning long competitor videos.
//
// Given a competitor video URL and a desired clip count N, this extracts N
// frames at evenly spaced timestamps (t_i = (i + 0.5) * dur / N — sampled
// from clip midpoints so the seed represents the middle of each clip's window
// rather than the cut point) and uploads each to Vercel Blob.
//
// The returned URL array is consumed by startVideoSequence as per-clip i2v
// seeds — preserving actor identity, product, and shot list across the full
// duration of the source ad.
//
// Uses ffmpeg-static + Vercel Blob — same pattern as showcase.ts:extractLastFrameToBlob.
//
// Node runtime only. Requires BLOB_READ_WRITE_TOKEN.
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export interface KeyframeExtractionResult {
  frameUrls: string[];     // length === count
  durationSec: number;     // probed duration of source video
  count: number;
}

export async function extractKeyframes(
  videoUrl: string,
  count: number,
  hintDurationSec?: number
): Promise<KeyframeExtractionResult> {
  if (count < 1) throw new Error("count must be >= 1");
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN not set");
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ffmpegPath = require("ffmpeg-static") as string | null;
  if (!ffmpegPath) throw new Error("ffmpeg-static binary not available");

  const workDir = await mkdtemp(path.join(tmpdir(), "winner-keyframes-"));
  try {
    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error(`fetch ${videoUrl}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const inPath = path.join(workDir, "in.mp4");
    await writeFile(inPath, buf);

    const durationSec = await probeDuration(ffmpegPath, inPath, hintDurationSec);
    if (!(durationSec > 0)) {
      throw new Error("could not determine video duration");
    }

    // Sample at clip midpoints. Last frame clamped to dur - 0.1s so we never
    // request a timestamp past EOF (which yields a black frame on many codecs).
    const timestamps: number[] = [];
    for (let i = 0; i < count; i++) {
      const t = Math.min(durationSec - 0.1, ((i + 0.5) * durationSec) / count);
      timestamps.push(Math.max(0, t));
    }

    const { put } = await import("@vercel/blob");
    const frameUrls: string[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const outPath = path.join(workDir, `frame-${i}.jpg`);
      // -ss before -i = fast seek (keyframe-aligned). Accuracy ~1s, fine for i2v seed.
      await runFfmpegSpawn(ffmpegPath, [
        "-y",
        "-ss", timestamps[i].toFixed(3),
        "-i", inPath,
        "-frames:v", "1",
        "-q:v", "2",
        outPath,
      ]);
      const jpg = await readFile(outPath);
      const blob = await put(`winner-keyframes/${Date.now()}-${i}.jpg`, jpg, {
        access: "public",
        contentType: "image/jpeg",
        addRandomSuffix: true,
      });
      frameUrls.push(blob.url);
    }
    return { frameUrls, durationSec, count };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

// Probe duration via ffmpeg stderr (no ffprobe in ffmpeg-static).
// Falls back to the caller's hint if parsing fails.
async function probeDuration(
  ffmpegPath: string,
  inPath: string,
  hint?: number
): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, ["-i", inPath], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", () => {
      const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (m) {
        const h = parseInt(m[1], 10);
        const min = parseInt(m[2], 10);
        const s = parseFloat(m[3]);
        resolve(h * 3600 + min * 60 + s);
        return;
      }
      resolve(hint ?? 0);
    });
    proc.on("error", () => resolve(hint ?? 0));
  });
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
