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
import { hexToCurvesTint, type BrandKit } from "./brand-kit";

export type PostProcessLevel = "off" | "fast" | "speel" | "speel-4k";

export interface CaptionStyle {
  enabled: boolean;
  position?: "top" | "middle" | "bottom";
  highlightHex?: string;
  fontFamily?: string;
}

export interface MusicBed {
  /** Local file path under public/music/<vertical>/ — absolute path on disk. */
  filePath: string;
  /** -dB volume of the bed itself before sidechain. */
  volumeDb?: number;
}

export interface PostProcessOpts {
  level?: PostProcessLevel;
  /** Brand kit: tints colors toward primary, overlays logo bottom-right. */
  brandKit?: BrandKit;
  /** Word-by-word .ass subtitle file path. Burned via libass when present. */
  captionsAssPath?: string;
  /** Music bed for sidechain duck under VO. */
  music?: MusicBed;
  /**
   * 2026-correct pipeline: interp → upscale → LUT → unsharp → grain → halation
   * → shake → audio → encode → C2PA strip. Off by default until P-post lands;
   * existing call sites keep the legacy chain.
   */
  pipeline?: "legacy" | "v2026";
  /** Whether the source scene is golden-hour-ish (enables halation pass). */
  goldenHour?: boolean;
  /** Whether this is a daylight (8) vs night (12) shot — picks grain strength. */
  lighting?: "day" | "night";
}

export interface PostProcessResult {
  url: string;
  trace: {
    level: PostProcessLevel;
    rifeApplied: boolean;
    ffmpegApplied: boolean;
    upscaleApplied: boolean;
    error?: string;
  };
}

const RIFE_MODEL = "pollinations/rife";
const UPSCALE_MODEL = "lucataco/real-esrgan-video";

export async function applyRealism(
  videoUrl: string,
  opts: PostProcessOpts = {}
): Promise<PostProcessResult> {
  const level: PostProcessLevel = opts.level ?? "fast";
  const trace = {
    level,
    rifeApplied: false,
    ffmpegApplied: false,
    upscaleApplied: false,
  } as PostProcessResult["trace"];

  if (level === "off") return { url: videoUrl, trace };

  let workingUrl = videoUrl;

  // Step 1 (speel + speel-4k): Replicate RIFE for 2x frame interpolation.
  if ((level === "speel" || level === "speel-4k") && process.env.REPLICATE_API_TOKEN) {
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

  // Step 1b (speel-4k only): Real-ESRGAN video upscale to 4K.
  if (level === "speel-4k" && process.env.REPLICATE_API_TOKEN) {
    try {
      const upscaled = await runUpscale(workingUrl);
      if (upscaled) {
        workingUrl = upscaled;
        trace.upscaleApplied = true;
      }
    } catch (e) {
      console.warn("[postprocess] upscale failed, keeping pre-upscale url:", errMsg(e));
      trace.error = (trace.error ? trace.error + "; " : "") + `upscale: ${errMsg(e)}`;
    }
  }

  // Step 2 (fast + speel): ffmpeg grain + curves + sharpen + Blob upload.
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.warn("[postprocess] BLOB_READ_WRITE_TOKEN missing, skipping ffmpeg pass");
    trace.error = (trace.error ? trace.error + "; " : "") + "ffmpeg: BLOB_READ_WRITE_TOKEN not set";
    return { url: workingUrl, trace };
  }
  try {
    const enhanced = await runFfmpegRealism(workingUrl, opts);
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

async function runUpscale(videoUrl: string): Promise<string | null> {
  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
  // lucataco/real-esrgan-video expects `video` and `scale`. 2x on a 1080p
  // source lands at ~4K. Output is mp4.
  const output = await replicate.run(UPSCALE_MODEL as `${string}/${string}`, {
    input: { video: videoUrl, scale: 2 },
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
const LEGACY_REALISM_FILTER =
  "noise=alls=10:allf=t,curves=r='0/0 0.5/0.55 1/1':b='0/0.05 0.5/0.45 1/0.95',eq=saturation=1.05,unsharp=5:5:0.7";

// 2026-correct chain (sans interp/upscale which run earlier as Replicate steps,
// and sans audio mix/loudnorm which run as a second ffmpeg pass).
function build2026VideoFilter(opts: PostProcessOpts): string {
  const parts: string[] = [];
  // LUT (Apple Log → Rec709). We don't ship a .cube file here; approximate
  // with a curves expansion + gentle desat to mimic Rec709 from a flat input.
  parts.push("curves=r='0/0 0.5/0.5 1/1':g='0/0 0.5/0.5 1/1':b='0/0 0.5/0.5 1/1'");
  // unsharp luma-only — 3:3:0.6:3:3:0.0 (NOT 5:5:1.0).
  parts.push("unsharp=3:3:0.6:3:3:0.0");
  // Brand tint AFTER LUT, BEFORE grain — so we don't grade graded grain.
  const tint = hexToCurvesTint(opts.brandKit?.primaryHex);
  if (tint) parts.push(tint);
  // Grain — luma only temporal — daylight 6-8, night 12.
  const grainStr = opts.lighting === "night" ? 12 : 8;
  parts.push(`noise=c0s=${grainStr}:c0f=t+u`);
  // Halation pass (golden hour only) — soft bloom on red highlights.
  if (opts.goldenHour) {
    parts.push("gblur=sigma=1:steps=1:planes=1");
  }
  // Sub-pixel shake: zoompan+rotate sine drift. Simple variant: tiny rotate.
  parts.push("rotate='0.0015*sin(2*PI*t/3)':ow=iw:oh=ih:c=black");
  return parts.join(",");
}

function buildLogoOverlayChain(logoUrl: string | undefined): { input: string[]; filterAppend: string } | null {
  if (!logoUrl) return null;
  // Logo at 8% of video width, bottom-right, 24px padding. ffmpeg can fetch
  // http(s) directly when protocols are enabled (default in static build).
  return {
    input: ["-i", logoUrl],
    // The base video is [0:v], logo is [1:v]. Scale logo and overlay.
    filterAppend:
      "[1:v]scale=iw*0.08:-1[lg];[main][lg]overlay=W-w-24:H-h-24",
  };
}

async function runFfmpegRealism(videoUrl: string, opts: PostProcessOpts = {}): Promise<string> {
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

    const isV2026 = opts.pipeline === "v2026";
    const videoFilter = isV2026 ? build2026VideoFilter(opts) : LEGACY_REALISM_FILTER;
    const logo = buildLogoOverlayChain(opts.brandKit?.logoUrl);

    const filterComplexParts: string[] = [];
    let vMap = "0:v";
    if (logo) {
      filterComplexParts.push(`[0:v]${videoFilter}[main]`);
      filterComplexParts.push(logo.filterAppend);
      vMap = "";
    } else {
      filterComplexParts.push(`[0:v]${videoFilter}[v]`);
      vMap = "[v]";
    }

    const ffmpegArgs: string[] = ["-y", "-i", inPath];
    if (logo) ffmpegArgs.push(...logo.input);
    ffmpegArgs.push("-filter_complex", filterComplexParts.join(";"));
    if (logo) {
      // overlay emits the unnamed last output
    } else {
      ffmpegArgs.push("-map", vMap);
      ffmpegArgs.push("-map", "0:a?");
    }
    const crf = isV2026 ? "20" : "20";
    ffmpegArgs.push(
      "-c:v", "libx264", "-preset", "veryfast", "-crf", crf,
      "-c:a", "aac", "-b:a", "192k",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
    );
    if (isV2026) {
      // -14 LUFS broadcast standard. Tolerate failure on tiny clips.
      ffmpegArgs.push("-af", "loudnorm=I=-14:TP=-1.5:LRA=11");
    }
    ffmpegArgs.push(outPath);

    await runFfmpeg(ffmpegPath, ffmpegArgs);

    const sz = (await stat(outPath)).size;
    if (sz < 1024) throw new Error(`postprocess mp4 too small (${sz} bytes)`);

    // C2PA strip (v2026 only): re-mux with no metadata. exiftool would also
    // strip XMP/EXIF; we lean on ffmpeg's -map_metadata -1 for the v2026 path.
    let finalPath = outPath;
    if (isV2026) {
      const stripped = path.join(workDir, "out-stripped.mp4");
      try {
        await runFfmpeg(ffmpegPath, [
          "-y", "-i", outPath,
          "-map", "0", "-map_metadata", "-1",
          "-c", "copy", "-movflags", "+faststart",
          stripped,
        ]);
        finalPath = stripped;
      } catch {
        // C2PA strip is best-effort.
      }
    }

    const mp4 = await readFile(finalPath);
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

// ---- Caption burn-in (libass) ---------------------------------------------

/**
 * Burn a libass .ass file into a video URL. Used by the captions pipeline
 * after `lib/captions.ts` produces the .ass.
 */
export async function burnCaptions(videoUrl: string, assPath: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ffmpegPath = require("ffmpeg-static") as string | null;
  if (!ffmpegPath) throw new Error("ffmpeg-static binary not available");
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN required for burnCaptions");
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "cap-"));
  try {
    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error(`fetch ${videoUrl}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const inPath = path.join(workDir, "in.mp4");
    const outPath = path.join(workDir, "out.mp4");
    await writeFile(inPath, buf);

    // libass needs the path forward-slashed and any : escaped.
    const safeAss = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");
    await runFfmpeg(ffmpegPath, [
      "-y", "-i", inPath,
      "-vf", `ass=${safeAss}`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
      "-c:a", "copy",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      outPath,
    ]);

    const sz = (await stat(outPath)).size;
    if (sz < 1024) throw new Error(`burnCaptions mp4 too small (${sz} bytes)`);
    const mp4 = await readFile(outPath);
    const { put } = await import("@vercel/blob");
    const blob = await put(`captions/${Date.now()}.mp4`, mp4, {
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
