// Post-processing pass that turns a sterile AI video into something closer to
// real iPhone footage. Three knobs:
//   - "off":   pass through (original URL).
//   - "fast":  ffmpeg-static only — grain + teal/orange curves + unsharp.
//              ~5-10s, no external cost.
//   - "speel": Replicate RIFE interp 24→48fps first, then the ffmpeg pass.
//              ~30-90s, ~$0.05.
//
// On any failure the pipeline returns the input URL untouched and surfaces
// the error in `trace.error` — the goal is "never block the final ad".
import Replicate from "replicate";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export type PostProcessLevel = "off" | "fast" | "speel";

export interface PostProcessOpts {
  level?: PostProcessLevel;
}

export interface PostProcessResult {
  url: string;
  trace: {
    level: PostProcessLevel;
    rifeApplied: boolean;
    ffmpegApplied: boolean;
    error?: string;
  };
}

const RIFE_MODEL = "pollinations/rife";

export async function applyRealism(
  videoUrl: string,
  opts: PostProcessOpts = {}
): Promise<PostProcessResult> {
  const level: PostProcessLevel = opts.level ?? "fast";
  const trace = { level, rifeApplied: false, ffmpegApplied: false } as PostProcessResult["trace"];

  if (level === "off") return { url: videoUrl, trace };

  let workingUrl = videoUrl;

  // Step 1 (speel only): Replicate RIFE for 2x frame interpolation.
  if (level === "speel" && process.env.REPLICATE_API_TOKEN) {
    try {
      const interped = await runRife(workingUrl);
      if (interped) {
        workingUrl = interped;
        trace.rifeApplied = true;
      }
    } catch (e) {
      console.warn("[postprocess] RIFE failed, continuing with ffmpeg only:", errMsg(e));
      trace.error = `rife: ${errMsg(e)}`;
    }
  }

  // Step 2 (fast + speel): ffmpeg grain + curves + sharpen + Blob upload.
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.warn("[postprocess] BLOB_READ_WRITE_TOKEN missing, skipping ffmpeg pass");
    trace.error = (trace.error ? trace.error + "; " : "") + "ffmpeg: BLOB_READ_WRITE_TOKEN not set";
    return { url: workingUrl, trace };
  }
  try {
    const enhanced = await runFfmpegRealism(workingUrl);
    trace.ffmpegApplied = true;
    return { url: enhanced, trace };
  } catch (e) {
    console.warn("[postprocess] ffmpeg pass failed, returning prior url:", errMsg(e));
    trace.error = (trace.error ? trace.error + "; " : "") + `ffmpeg: ${errMsg(e)}`;
    return { url: workingUrl, trace };
  }
}

// ---- Replicate RIFE -------------------------------------------------------

async function runRife(videoUrl: string): Promise<string | null> {
  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
  // pollinations/rife accepts `video` and outputs an interpolated mp4.
  // If this slug isn't accessible on the account, replicate.run throws and
  // the caller catches.
  const output = await replicate.run(RIFE_MODEL as `${string}/${string}`, {
    input: { video: videoUrl, fps: 48 },
  });
  return pickReplicateUrl(output);
}

function pickReplicateUrl(output: unknown): string | null {
  if (typeof output === "string") return output;
  if (Array.isArray(output) && typeof output[0] === "string") return output[0] as string;
  if (output && typeof output === "object") {
    const maybe = output as { url?: unknown };
    if (typeof maybe.url === "function") {
      try {
        const u = (maybe.url as () => unknown)();
        if (typeof u === "string") return u;
        if (u && typeof u === "object" && "toString" in u) return String(u);
      } catch {
        /* ignore */
      }
    }
    if (typeof maybe.url === "string") return maybe.url;
  }
  return null;
}

// ---- ffmpeg-static + Vercel Blob ------------------------------------------

// Filter chain notes:
// - noise=alls=10:allf=t  → fine 35mm-style film grain on all frames.
// - curves=...            → mild teal/orange — lift shadow blues a touch,
//                           warm midtone highlights.
// - unsharp=5:5:0.7       → subtle pop without ringing.
// - eq=saturation=1.05    → restore color after grain dulls things slightly.
const REALISM_FILTER =
  "noise=alls=10:allf=t,curves=r='0/0 0.5/0.55 1/1':b='0/0.05 0.5/0.45 1/0.95',eq=saturation=1.05,unsharp=5:5:0.7";

async function runFfmpegRealism(videoUrl: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ffmpegPath = require("ffmpeg-static") as string | null;
  if (!ffmpegPath) throw new Error("ffmpeg-static binary not available");

  const workDir = await mkdtemp(path.join(tmpdir(), "pp-"));
  try {
    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error(`fetch ${videoUrl}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const inPath = path.join(workDir, "in.mp4");
    const outPath = path.join(workDir, "out.mp4");
    await writeFile(inPath, buf);

    await runFfmpeg(ffmpegPath, [
      "-y", "-i", inPath,
      "-vf", REALISM_FILTER,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
      "-c:a", "copy",
      "-pix_fmt", "yuv420p",
      outPath,
    ]);

    const sz = (await stat(outPath)).size;
    if (sz < 1024) throw new Error(`postprocess mp4 too small (${sz} bytes)`);
    const mp4 = await readFile(outPath);
    const { put } = await import("@vercel/blob");
    const blob = await put(`postprocess/${Date.now()}.mp4`, mp4, {
      access: "public",
      contentType: "video/mp4",
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

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
