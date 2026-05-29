// Post-processing pass that turns a sterile AI video into something closer to
// real iPhone footage.
//
// Recipe (from RESEARCH_FINDINGS.md, applied in order):
//
//   1. Generate at max quality (handled by the showcase / UGC pipelines).
//   2. Interp 24 → 60fps  →  Replicate pollinations/rife  (with fal-ai/film
//                            as a secondary fallback we'll wire when the
//                            account confirms access).
//   3. Upscale            →  Replicate lucataco/real-esrgan-video (2x).
//   4. Grain              →  ffmpeg noise=alls=10:allf=t
//   5. Halation           →  ffmpeg gblur on a duplicated stream, screen-blended
//                            at low opacity — kills the plastic-skin tell.
//   6. iPhone LUT          →  approximated via ffmpeg curves+eq (no .cube file
//                            shipped — see RESEARCH_FINDINGS for the real
//                            iphone.cube source if you want to drop one into
//                            public/luts/).
//   7. Camera shake       →  vidstabdetect+vidstabtransform inverse (very
//                            mild — just enough to break "tripod feel").
//   8. Sharpen pop        →  ffmpeg unsharp=5:5:0.7
//   9. Re-encode          →  libx264 CRF20 30fps CFR 1080x1920 AAC 128k.
//  10. Strip metadata     →  -map_metadata -1 -map_chapters -1  (proxies for
//                            the exiftool C2PA strip in the recipe — TikTok
//                            flags 1.3B clips on Content Credentials).
//
// Four knobs:
//   - "off":      pass through (original URL).
//   - "fast":     ffmpeg-only realism pass + metadata strip. ~10s, free.
//   - "speel":    + RIFE 48fps interp first.                  ~60s, ~$0.05.
//   - "speel-4k": + Real-ESRGAN 2x upscale to ~4K.            ~180s, ~$0.20.
//
// Every step fails open — on any error we surface a trace note and return
// the most-processed URL we have so far.
import Replicate from "replicate";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export type PostProcessLevel = "off" | "fast" | "speel" | "speel-4k";

export interface PostProcessOpts {
  level?: PostProcessLevel;
  /** When false, skip the metadata strip step (e.g. unit tests that diff bytes). */
  stripMetadata?: boolean;
}

export interface PostProcessResult {
  url: string;
  trace: {
    level: PostProcessLevel;
    rifeApplied: boolean;
    ffmpegApplied: boolean;
    upscaleApplied: boolean;
    metadataStripped: boolean;
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
    metadataStripped: false,
  } as PostProcessResult["trace"];

  if (level === "off") return { url: videoUrl, trace };

  let workingUrl = videoUrl;

  // Step 2 (speel + speel-4k): Replicate RIFE for 2x frame interpolation.
  if ((level === "speel" || level === "speel-4k") && process.env.REPLICATE_API_TOKEN) {
    try {
      const interped = await runRife(workingUrl);
      if (interped) {
        workingUrl = interped;
        trace.rifeApplied = true;
      }
    } catch (e) {
      console.warn("[postprocess] RIFE failed, continuing without interp:", errMsg(e));
      trace.error = `rife: ${errMsg(e)}`;
    }
  }

  // Step 3 (speel-4k only): Real-ESRGAN video upscale to ~4K.
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

  // Steps 4-10 (fast / speel / speel-4k): ffmpeg realism filter chain + strip.
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.warn("[postprocess] BLOB_READ_WRITE_TOKEN missing, skipping ffmpeg pass");
    trace.error = (trace.error ? trace.error + "; " : "") + "ffmpeg: BLOB_READ_WRITE_TOKEN not set";
    return { url: workingUrl, trace };
  }
  try {
    const stripMetadata = opts.stripMetadata !== false;
    const enhanced = await runFfmpegRealism(workingUrl, { stripMetadata });
    trace.ffmpegApplied = true;
    trace.metadataStripped = stripMetadata;
    return { url: enhanced, trace };
  } catch (e) {
    console.warn("[postprocess] ffmpeg pass failed, returning prior url:", errMsg(e));
    trace.error = (trace.error ? trace.error + "; " : "") + `ffmpeg: ${errMsg(e)}`;
    return { url: workingUrl, trace };
  }
}

// ---- Replicate models -----------------------------------------------------

async function runRife(videoUrl: string): Promise<string | null> {
  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
  const output = await replicate.run(RIFE_MODEL as `${string}/${string}`, {
    input: { video: videoUrl, fps: 60 }, // research: 24→60 is the sweet spot
  });
  return pickReplicateUrl(output);
}

async function runUpscale(videoUrl: string): Promise<string | null> {
  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
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

// ---- ffmpeg-static realism filter chain -----------------------------------

// Filter graph rebuilt to match the RESEARCH_FINDINGS recipe.
//
// [0:v]
//   split → [base][glow]                         duplicate stream for halation
//
// [glow]
//   gblur=sigma=8                                soft bloom
//   eq=brightness=0.04                           lift it a touch
// [base]
//   noise=alls=10:allf=t                         35mm grain
//   curves=...teal/orange iPhone-ish             color grade
//   eq=saturation=1.05                           perceived "filmy" look
// [graded][glow]
//   blend=all_mode=screen:all_opacity=0.18       halation/bloom mix
//   unsharp=5:5:0.7                              sharpen pop
//
// We keep the chain inside one -filter_complex so ffmpeg only re-encodes once.
const FILTER_COMPLEX = [
  "[0:v]split=2[base][glow]",
  "[glow]gblur=sigma=8,eq=brightness=0.04[bloom]",
  "[base]noise=alls=10:allf=t," +
    "curves=r='0/0 0.5/0.55 1/1':b='0/0.05 0.5/0.45 1/0.95'," +
    "eq=saturation=1.05[graded]",
  "[graded][bloom]blend=all_mode=screen:all_opacity=0.18,unsharp=5:5:0.7[v]",
].join(";");

async function runFfmpegRealism(
  videoUrl: string,
  opts: { stripMetadata: boolean }
): Promise<string> {
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

    const args = [
      "-y", "-i", inPath,
      "-filter_complex", FILTER_COMPLEX,
      "-map", "[v]",
      "-map", "0:a?", // pass through audio if present
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      // Metadata strip — proxy for exiftool -all=. Removes container metadata,
      // chapters, and (importantly) most C2PA / Content Credentials beacons.
      ...(opts.stripMetadata
        ? ["-map_metadata", "-1", "-map_chapters", "-1", "-fflags", "+bitexact"]
        : []),
      "-movflags", "+faststart",
      outPath,
    ];

    await runFfmpeg(ffmpegPath, args);

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
