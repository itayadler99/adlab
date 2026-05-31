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
import { mkdtemp, rm, writeFile, stat, readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export type PostProcessLevel = "off" | "fast" | "speel" | "speel-4k";

/** Per-filter intensity controls. Defaults match the research recipe. */
export interface RealismIntensity {
  /** ffmpeg noise alls 0-30. Default 10. */
  grain?: number;
  /** Halation screen-blend opacity 0-0.6. Default 0.18. */
  halation?: number;
  /** Final saturation multiplier 0.8-1.3. Default 1.05. */
  saturation?: number;
  /** Unsharp amount 0-1.5. Default 0.7. */
  sharpen?: number;
  /**
   * Subtle handheld shake to break "tripod feel". 0-1, default 0 (off).
   * Values translate to rotation amplitude (radians) and inner crop %.
   * 0.5 → ~0.3° wobble at ~0.7 Hz, 2% crop.
   */
  shake?: number;
}

export interface PostProcessOpts {
  level?: PostProcessLevel;
  /** When false, skip the metadata strip step (e.g. unit tests that diff bytes). */
  stripMetadata?: boolean;
  /** Override per-filter intensities (each falls back to defaults). */
  intensity?: RealismIntensity;
  /** Override the target framerate of the RIFE interpolation. */
  targetFps?: number;
  /**
   * Optional URL or absolute path to a `.cube` LUT file. If provided we use
   * ffmpeg `lut3d` instead of the curves+eq approximation. Useful for the
   * "iPhone 15 Pro" LUT from RESEARCH_FINDINGS.md once you drop one into
   * public/luts/.
   */
  lutPath?: string;
  /**
   * When true, run the source audio through `loudnorm=I=-18:LRA=11:TP=-2`
   * before re-encoding. Brings the final ad to -18 LUFS — the
   * Meta/TikTok-friendly target the research recipe calls out.
   * Default: true when the source has audio. Set false to bit-exact copy.
   */
  normalizeAudio?: boolean;
}

export interface PostProcessResult {
  url: string;
  trace: {
    level: PostProcessLevel;
    rifeApplied: boolean;
    rifeModel?: string;
    ffmpegApplied: boolean;
    upscaleApplied: boolean;
    metadataStripped: boolean;
    lutApplied: boolean;
    audioNormalized: boolean;
    /** Per-filter values actually applied — useful when intensity was overridden. */
    intensity: Required<RealismIntensity>;
    error?: string;
  };
}

// RIFE chain — try primary, fall through on access errors.
const RIFE_MODELS = [
  "pollinations/rife",
  "zsxkib/rife", // community-maintained alternative
] as const;
const UPSCALE_MODEL = "lucataco/real-esrgan-video";

const DEFAULT_INTENSITY: Required<RealismIntensity> = {
  grain: 10,
  halation: 0.18,
  saturation: 1.05,
  sharpen: 0.7,
  shake: 0,
};

function resolveIntensity(override?: RealismIntensity): Required<RealismIntensity> {
  return {
    grain: clamp(override?.grain ?? DEFAULT_INTENSITY.grain, 0, 30),
    halation: clamp(override?.halation ?? DEFAULT_INTENSITY.halation, 0, 0.6),
    saturation: clamp(override?.saturation ?? DEFAULT_INTENSITY.saturation, 0.8, 1.3),
    sharpen: clamp(override?.sharpen ?? DEFAULT_INTENSITY.sharpen, 0, 1.5),
    shake: clamp(override?.shake ?? DEFAULT_INTENSITY.shake, 0, 1),
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export async function applyRealism(
  videoUrl: string,
  opts: PostProcessOpts = {}
): Promise<PostProcessResult> {
  const level: PostProcessLevel = opts.level ?? "fast";
  const intensity = resolveIntensity(opts.intensity);
  const trace: PostProcessResult["trace"] = {
    level,
    rifeApplied: false,
    ffmpegApplied: false,
    upscaleApplied: false,
    metadataStripped: false,
    lutApplied: false,
    audioNormalized: false,
    intensity,
  };

  if (level === "off") return { url: videoUrl, trace };

  let workingUrl = videoUrl;

  // Step 2 (speel + speel-4k): Replicate RIFE for frame interpolation. Walks
  // the RIFE_MODELS chain so a gated primary doesn't kill the whole pass.
  if ((level === "speel" || level === "speel-4k") && process.env.REPLICATE_API_TOKEN) {
    const targetFps = opts.targetFps ?? 60;
    let rifeErr: unknown;
    for (const model of RIFE_MODELS) {
      try {
        const interped = await runRife(workingUrl, model, targetFps);
        if (interped) {
          workingUrl = interped;
          trace.rifeApplied = true;
          trace.rifeModel = model;
          rifeErr = undefined;
          break;
        }
      } catch (e) {
        rifeErr = e;
        if (!isModelAccessError(e)) break; // non-auth failure is real — stop walking
        console.warn(`[postprocess] RIFE ${model} not accessible, trying next:`, errMsg(e));
      }
    }
    if (rifeErr) {
      console.warn("[postprocess] RIFE failed across chain, continuing without interp:", errMsg(rifeErr));
      trace.error = `rife: ${errMsg(rifeErr)}`;
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
    const normalizeAudio = opts.normalizeAudio !== false;
    const lutPath = await resolveLutPath(opts.lutPath);
    const enhanced = await runFfmpegRealism(workingUrl, {
      stripMetadata,
      intensity,
      lutPath,
      normalizeAudio,
    });
    trace.ffmpegApplied = true;
    trace.metadataStripped = stripMetadata;
    trace.lutApplied = Boolean(lutPath);
    trace.audioNormalized = normalizeAudio;
    return { url: enhanced, trace };
  } catch (e) {
    console.warn("[postprocess] ffmpeg pass failed, returning prior url:", errMsg(e));
    trace.error = (trace.error ? trace.error + "; " : "") + `ffmpeg: ${errMsg(e)}`;
    return { url: workingUrl, trace };
  }
}

/**
 * Apply realism to N clips in parallel.
 *
 * Useful when the showcase sequence orchestrator produces multiple sub-clips
 * we want enhanced before stitching. We cap concurrency to avoid hammering
 * the same Vercel function's CPU with N simultaneous ffmpeg processes.
 */
export async function applyRealismToMany(
  videoUrls: string[],
  opts: PostProcessOpts & { concurrency?: number } = {}
): Promise<PostProcessResult[]> {
  const concurrency = Math.max(1, Math.min(4, opts.concurrency ?? 2));
  const results: PostProcessResult[] = new Array(videoUrls.length);
  let nextIdx = 0;
  async function worker() {
    while (true) {
      const i = nextIdx++;
      if (i >= videoUrls.length) return;
      results[i] = await applyRealism(videoUrls[i], opts);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

// ---- Replicate models -----------------------------------------------------

async function runRife(
  videoUrl: string,
  model: string,
  fps: number
): Promise<string | null> {
  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
  const output = await replicate.run(model as `${string}/${string}`, {
    input: { video: videoUrl, fps }, // research: 24→60 is the sweet spot
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
//   noise=alls=<grain>:allf=t                    35mm grain
//   curves OR lut3d                              teal/orange iPhone color grade
//   eq=saturation=<saturation>                   perceived "filmy" look
// [graded][glow]
//   blend=screen:opacity=<halation>              halation/bloom mix
//   unsharp=5:5:<sharpen>                        sharpen pop
//
// We keep the chain inside one -filter_complex so ffmpeg only re-encodes once.
function buildFilterComplex(opts: {
  intensity: Required<RealismIntensity>;
  lutPath?: string;
}): string {
  const { grain, halation, saturation, sharpen, shake } = opts.intensity;
  const colorGrade = opts.lutPath
    ? `lut3d=file=${escapeFilterArg(opts.lutPath)}`
    : "curves=r='0/0 0.5/0.55 1/1':b='0/0.05 0.5/0.45 1/0.95'";

  // Subtle camera shake — rotation oscillation + inner crop to hide edges.
  // Inactive when shake == 0.
  const shakeFilter = shake > 0
    ? `,rotate=a='${(0.006 * shake).toFixed(4)}*sin(2*PI*t*0.7)':c=none:bilinear=1,crop=iw*${(1 - 0.02 * shake).toFixed(4)}:ih*${(1 - 0.02 * shake).toFixed(4)}`
    : "";

  return [
    "[0:v]split=2[base][glow]",
    "[glow]gblur=sigma=8,eq=brightness=0.04[bloom]",
    `[base]noise=alls=${grain}:allf=t,${colorGrade},eq=saturation=${saturation}[graded]`,
    `[graded][bloom]blend=all_mode=screen:all_opacity=${halation},unsharp=5:5:${sharpen}${shakeFilter}[v]`,
  ].join(";");
}

// ffmpeg filter_complex args interpret special chars (':', ',', '\') as
// separators. Wrap paths to keep colons/commas inside filenames intact.
function escapeFilterArg(s: string): string {
  return `'${s.replace(/'/g, "\\'").replace(/\\/g, "\\\\")}'`;
}

async function runFfmpegRealism(
  videoUrl: string,
  opts: {
    stripMetadata: boolean;
    intensity: Required<RealismIntensity>;
    lutPath?: string;
    normalizeAudio: boolean;
  }
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

    const filterComplex = buildFilterComplex({
      intensity: opts.intensity,
      lutPath: opts.lutPath,
    });
    const audioArgs = opts.normalizeAudio
      ? [
          "-map", "0:a?",
          // loudnorm to -18 LUFS — the Meta/TikTok target per research.
          // Single-pass is sufficient for ad-length clips; two-pass would
          // require probing first, which adds 2x latency.
          "-af", "loudnorm=I=-18:LRA=11:TP=-2",
          "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
        ]
      : ["-map", "0:a?", "-c:a", "aac", "-b:a", "128k"];

    const args = [
      "-y", "-i", inPath,
      "-filter_complex", filterComplex,
      "-map", "[v]",
      ...audioArgs,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
      "-pix_fmt", "yuv420p",
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
    if (sz > 450 * 1024 * 1024) {
      throw new Error(`postprocess mp4 too large (${(sz / 1024 / 1024).toFixed(1)} MB) for Blob upload`);
    }
    const { put } = await import("@vercel/blob");
    const blob = await put(`postprocess/${Date.now()}.mp4`, createReadStream(outPath), {
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

function isModelAccessError(e: unknown): boolean {
  const msg = errMsg(e).toLowerCase();
  return /unauthorized|cannot access|forbidden|not found|404|401|403|access denied/.test(msg);
}

// Resolve the LUT path. Accepts:
//   - undefined → opt-in default from env (POSTPROCESS_LUT_PATH), else no LUT.
//   - http(s) URL → download to /tmp first, return the local path.
//   - absolute path → use as-is after stat() check.
// We intentionally avoid walking process.cwd() — Turbopack's NFT bundler
// then traces the whole project. Use POSTPROCESS_LUT_PATH or pass an
// absolute path / URL explicitly.
async function resolveLutPath(lutPath?: string): Promise<string | undefined> {
  const effective = lutPath || process.env.POSTPROCESS_LUT_PATH;
  if (!effective) return undefined;
  if (/^https?:\/\//i.test(effective)) {
    try {
      const res = await fetch(effective);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const dir = await mkdtemp(path.join(tmpdir(), "lut-"));
      const local = path.join(dir, "lut.cube");
      await writeFile(local, Buffer.from(await res.arrayBuffer()));
      return local;
    } catch (e) {
      console.warn("[postprocess] LUT download failed, falling back to curves:", errMsg(e));
      return undefined;
    }
  }
  if (!path.isAbsolute(effective)) {
    console.warn(`[postprocess] LUT path must be absolute or http(s) URL: ${effective}`);
    return undefined;
  }
  try {
    await stat(effective);
    return effective;
  } catch {
    console.warn(`[postprocess] LUT not found at ${effective}, falling back to curves`);
    return undefined;
  }
}

// ---- Audio/Captions add-ons (preserved from feat/audio-captions merge) ----

export interface CaptionStyle {
  enabled: boolean;
  position?: "top" | "middle" | "bottom";
  highlightHex?: string;
  fontFamily?: string;
}

export interface MusicBed {
  filePath: string;
  volumeDb?: number;
}

export async function addMusicBed(
  videoUrl: string,
  musicPath: string,
  opts: { musicDb?: number } = {}
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ffmpegPath = require("ffmpeg-static") as string | null;
  if (!ffmpegPath) throw new Error("ffmpeg-static binary not available");
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN required for addMusicBed");
  }
  const musicDb = opts.musicDb ?? -16;

  const workDir = await mkdtemp(path.join(tmpdir(), "music-"));
  try {
    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error(`fetch ${videoUrl}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const inPath = path.join(workDir, "in.mp4");
    const outPath = path.join(workDir, "out.mp4");
    await writeFile(inPath, buf);

    const filter =
      `[0:a]asplit=2[voice][scin];` +
      `[1:a]volume=${musicDb}dB[bed];` +
      `[bed][scin]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=300[duck];` +
      `[voice][duck]amix=inputs=2:duration=first:dropout_transition=0[mix]`;

    await runFfmpeg(ffmpegPath, [
      "-y",
      "-i", inPath,
      "-stream_loop", "-1", "-i", musicPath,
      "-shortest",
      "-filter_complex", filter,
      "-map", "0:v",
      "-map", "[mix]",
      "-c:v", "copy",
      "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart",
      outPath,
    ]);

    const sz = (await stat(outPath)).size;
    if (sz < 1024) throw new Error(`addMusicBed mp4 too small (${sz} bytes)`);
    const mp4 = await readFile(outPath);
    const { put } = await import("@vercel/blob");
    const blob = await put(`music/${Date.now()}.mp4`, mp4, {
      access: "public",
      contentType: "video/mp4",
      addRandomSuffix: true,
    });
    return blob.url;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

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
