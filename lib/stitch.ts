// Three-tier stitch: FAL ffmpeg-api/compose → Replicate ffmpeg-concat → local
// ffmpeg-static + Vercel Blob. The FAL endpoint is gated on some accounts
// (returns Unauthorized), so we fall through. Each tier returns a public MP4
// URL the caller can hand straight to the player.
//
// Tier 3 (ffmpeg-static) re-encodes every input clip to a canonical spec
// before muxing — 1080x1920 @ 30fps yuv420p, AAC 128k 48kHz, faststart —
// because clips from different i2v models (Veo 8s 1080p, Seedance 10s 1080p,
// Kling 10s 1080p, RIFE 60fps) have different codecs/timebases that break
// the demuxer with `-c copy`. The normalize pass costs ~3-5s per clip but
// makes the concat itself reliable.
import { fal } from "@fal-ai/client";
import Replicate from "replicate";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const FAL_KEY = process.env.FAL_KEY;
if (FAL_KEY) fal.config({ credentials: FAL_KEY });

const FAL_ENDPOINT = "fal-ai/ffmpeg-api/compose";
// Replicate concat model. Accepts a list of mp4 urls and returns a concatenated
// mp4. If the account doesn't have access to this specific slug we fall
// through to the ffmpeg-static tier.
const REPLICATE_CONCAT_MODEL = "lucataco/ffmpeg-concat";

// Canonical re-encode target — keeps Meta Ads happy (9:16 1080p H.264 AAC).
const CANONICAL_WIDTH = 1080;
const CANONICAL_HEIGHT = 1920;
const CANONICAL_FPS = 30;

export interface StitchInput {
  urls: string[];
  /** Per-clip duration override (seconds). Only used by the FAL tier. */
  clipSeconds?: number;
}

export interface StitchTrace {
  /** Which tier produced the final URL. */
  tier: "fal" | "replicate" | "ffmpeg-static";
  /** Errors collected from earlier tiers — useful for debugging in /api/stitch. */
  attempts: { tier: string; error: string }[];
  /** Whether the ffmpeg-static tier had to re-encode (vs. stream-copy concat). */
  normalized?: boolean;
}

export interface StitchResult {
  url: string;
  trace: StitchTrace;
}

export async function stitchVideos(input: StitchInput): Promise<string> {
  const { url } = await stitchVideosWithTrace(input);
  return url;
}

export async function stitchVideosWithTrace(input: StitchInput): Promise<StitchResult> {
  if (!input.urls || input.urls.length === 0) throw new Error("no urls to stitch");
  if (input.urls.length === 1) {
    return { url: input.urls[0], trace: { tier: "fal", attempts: [] } };
  }

  // Pre-flight: reject obviously-bad URLs early so we don't burn FAL quota
  // on a clip that 404s anyway. HEAD is best-effort — we only fail if every
  // URL is known-dead.
  const reachable = await preflightUrls(input.urls);
  if (!reachable) {
    throw new Error(`stitch: every input URL was unreachable. urls=${JSON.stringify(input.urls)}`);
  }

  const attempts: { tier: string; error: string }[] = [];

  if (FAL_KEY) {
    try {
      const url = await withRetry(() => stitchViaFal(input), "fal-compose", { auth: isFalAuthError });
      return { url, trace: { tier: "fal", attempts } };
    } catch (e) {
      const msg = errMsg(e);
      attempts.push({ tier: "fal", error: msg });
      if (!isFalAuthError(e)) {
        console.warn("[stitch] FAL failed with non-auth error, falling through:", msg);
      } else {
        console.warn("[stitch] FAL gated (Unauthorized), falling through to Replicate");
      }
    }
  } else {
    attempts.push({ tier: "fal", error: "FAL_KEY not set" });
  }

  if (process.env.REPLICATE_API_TOKEN) {
    try {
      const url = await withRetry(() => stitchViaReplicate(input.urls), "replicate-concat");
      return { url, trace: { tier: "replicate", attempts } };
    } catch (e) {
      const msg = errMsg(e);
      attempts.push({ tier: "replicate", error: msg });
      console.warn("[stitch] Replicate concat failed, falling through to ffmpeg-static:", msg);
    }
  } else {
    attempts.push({ tier: "replicate", error: "REPLICATE_API_TOKEN not set" });
  }

  // Last resort: local ffmpeg in the Vercel function tmp dir, upload to Blob.
  try {
    const { url, normalized } = await stitchViaFfmpegStatic(input.urls);
    return { url, trace: { tier: "ffmpeg-static", attempts, normalized } };
  } catch (e) {
    attempts.push({ tier: "ffmpeg-static", error: errMsg(e) });
    throw new Error(
      `stitch failed across all tiers. attempts=${JSON.stringify(attempts)}`
    );
  }
}

// ---- preflight ------------------------------------------------------------

async function preflightUrls(urls: string[]): Promise<boolean> {
  // Fast HEAD on all URLs in parallel. We tolerate 405 (method not allowed)
  // since many CDNs reject HEAD; only treat hard 4xx/5xx as dead.
  const results = await Promise.all(
    urls.map(async (u) => {
      try {
        const res = await fetch(u, { method: "HEAD" });
        if (res.status === 405 || res.status === 501) return true;
        return res.status >= 200 && res.status < 400;
      } catch {
        // Network error — could be a transient blip; be permissive.
        return true;
      }
    })
  );
  return results.some(Boolean);
}

// ---- Tier 1: FAL ffmpeg-api/compose ---------------------------------------

async function stitchViaFal(input: StitchInput): Promise<string> {
  if (!FAL_KEY) throw new Error("FAL_KEY not set");
  const clipSec = input.clipSeconds ?? 8;
  const clipMs = clipSec * 1000;
  const keyframes = input.urls.map((url, i) => ({
    timestamp: i * clipMs,
    url,
    duration: clipMs,
  }));
  const tracks = [{ id: "main", type: "video", keyframes }];
  const result = await fal.subscribe(FAL_ENDPOINT, { input: { tracks }, logs: false });
  const data = (result as { data?: Record<string, unknown> }).data || {};
  const video = data.video as { url?: string } | undefined;
  const url = video?.url || (data.url as string | undefined);
  if (!url) throw new Error("FAL compose returned no video URL");
  return url;
}

// ---- Tier 2: Replicate lucataco/ffmpeg-concat -----------------------------

async function stitchViaReplicate(urls: string[]): Promise<string> {
  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

  // lucataco/ffmpeg-concat accepts a JSON-string list. If the slug doesn't
  // exist on this account, replicate.run throws and the caller falls through.
  const output = await replicate.run(REPLICATE_CONCAT_MODEL as `${string}/${string}`, {
    input: { video_inputs: JSON.stringify(urls) },
  });

  const url = pickReplicateUrl(output);
  if (!url) throw new Error("Replicate concat returned no URL");
  return url;
}

function pickReplicateUrl(output: unknown): string | undefined {
  if (typeof output === "string") return output;
  if (Array.isArray(output) && typeof output[0] === "string") return output[0] as string;
  // Replicate file-like object with .url() method (newer SDK).
  if (output && typeof output === "object") {
    const maybe = output as { url?: unknown };
    if (typeof maybe.url === "function") {
      try {
        const u = (maybe.url as () => unknown)();
        if (typeof u === "string") return u;
        if (u && typeof u === "object" && "toString" in u) return String(u);
      } catch {
        /* fall through */
      }
    }
    if (typeof maybe.url === "string") return maybe.url;
  }
  return undefined;
}

// ---- Tier 3: ffmpeg-static + Vercel Blob ----------------------------------

async function stitchViaFfmpegStatic(
  urls: string[]
): Promise<{ url: string; normalized: boolean }> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN not set — required for ffmpeg-static fallback to upload the stitched mp4"
    );
  }
  // Load ffmpeg path at runtime (kept external via next.config.serverExternalPackages).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ffmpegPath = require("ffmpeg-static") as string | null;
  if (!ffmpegPath) throw new Error("ffmpeg-static binary not available on this platform");

  const workDir = await mkdtemp(path.join(tmpdir(), "stitch-"));
  try {
    // Download all clips in parallel with retry. Capped at 4 concurrent
    // downloads so we don't blow the Vercel function memory if every clip
    // is 100MB.
    const localPaths = await downloadAllParallel(workDir, urls, 4);

    const outPath = path.join(workDir, "out.mp4");

    // Fast path: stream-copy concat. Works only when every clip already has
    // the same codec, resolution, framerate, and timebase. Fails fast on
    // mismatched inputs (common with i2v + RIFE outputs from different
    // providers), so we catch the error and fall through to the normalize
    // path rather than spending time speculatively.
    let normalized = false;
    const listFile = path.join(workDir, "list.txt");
    await writeFile(
      listFile,
      localPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n")
    );
    try {
      await runFfmpeg(ffmpegPath, [
        "-y", "-f", "concat", "-safe", "0",
        "-i", listFile,
        "-c", "copy",
        "-movflags", "+faststart",
        outPath,
      ]);
    } catch {
      // Slow path: normalize each clip to the canonical spec, then concat.
      // Two-pass keeps the filter graph simple and the memory profile flat.
      normalized = true;
      const normalizedPaths: string[] = [];
      for (let i = 0; i < localPaths.length; i++) {
        const np = path.join(workDir, `norm-${i}.mp4`);
        await runFfmpeg(ffmpegPath, [
          "-y", "-i", localPaths[i],
          "-vf", `scale=${CANONICAL_WIDTH}:${CANONICAL_HEIGHT}:force_original_aspect_ratio=decrease,pad=${CANONICAL_WIDTH}:${CANONICAL_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,fps=${CANONICAL_FPS},setsar=1`,
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
          "-pix_fmt", "yuv420p",
          // Always emit a stereo AAC track so the concat track count matches.
          // If the source has no audio, ffmpeg fills with silence via anullsrc.
          "-af", "aresample=async=1:first_pts=0",
          "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
          "-shortest",
          np,
        ]);
        normalizedPaths.push(np);
      }
      const normListFile = path.join(workDir, "list-norm.txt");
      await writeFile(
        normListFile,
        normalizedPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n")
      );
      await runFfmpeg(ffmpegPath, [
        "-y", "-f", "concat", "-safe", "0",
        "-i", normListFile,
        "-c", "copy",
        "-movflags", "+faststart",
        outPath,
      ]);
    }

    const sz = (await stat(outPath)).size;
    if (sz < 1024) throw new Error(`stitched mp4 too small (${sz} bytes)`);
    // Vercel Blob has a 500 MB single-object limit. If we somehow exceed that
    // something's gone wrong upstream (uncompressed RIFE 60fps 4K can blow up).
    if (sz > 450 * 1024 * 1024) {
      throw new Error(`stitched mp4 too large (${(sz / 1024 / 1024).toFixed(1)} MB) for Blob upload`);
    }

    // Stream the file off disk straight into Blob — keeps peak memory ~1 MB
    // instead of holding the whole stitched mp4 (often 50-150 MB) in a Buffer.
    const { put } = await import("@vercel/blob");
    const blob = await put(
      `stitched/${Date.now()}-${urls.length}clips.mp4`,
      createReadStream(outPath),
      {
        access: "public",
        contentType: "video/mp4",
        addRandomSuffix: true,
      }
    );
    return { url: blob.url, normalized };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function downloadAllParallel(
  workDir: string,
  urls: string[],
  concurrency: number
): Promise<string[]> {
  const localPaths: (string | undefined)[] = new Array(urls.length);
  let nextIdx = 0;
  async function worker() {
    while (true) {
      const i = nextIdx++;
      if (i >= urls.length) return;
      const buf = await downloadWithRetry(urls[i]);
      const p = path.join(workDir, `clip-${i}.mp4`);
      await writeFile(p, buf);
      localPaths[i] = p;
    }
  }
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, urls.length)) }, () => worker())
  );
  // Defensive: ensure every slot was filled. downloadWithRetry throws on
  // hard failure so this should never trip in practice.
  for (let i = 0; i < urls.length; i++) {
    if (!localPaths[i]) throw new Error(`download missing for clip ${i}`);
  }
  return localPaths as string[];
}

async function downloadWithRetry(url: string, attempts = 4): Promise<Buffer> {
  const backoff = [0, 1000, 3000, 7000];
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    if (backoff[i]) await sleep(backoff[i]);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        // Don't retry hard 4xx (auth / not found).
        if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
          throw new Error(`fetch ${url}: HTTP ${res.status} (no retry)`);
        }
        throw new Error(`fetch ${url}: HTTP ${res.status}`);
      }
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      lastErr = e;
      if (/no retry/.test(errMsg(e))) throw e;
      console.warn(`[stitch] download attempt ${i + 1}/${attempts} for ${url.slice(0, 60)}… failed: ${errMsg(e)}`);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`download failed: ${url}`);
}

function runFfmpeg(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

// ---- helpers ---------------------------------------------------------------

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  opts: { auth?: (e: unknown) => boolean } = {}
): Promise<T> {
  const backoff = [0, 1500, 4000];
  let lastErr: unknown;
  for (let i = 0; i < backoff.length; i++) {
    if (backoff[i]) await sleep(backoff[i]);
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      // Auth / gating errors are terminal — no point retrying.
      if (opts.auth && opts.auth(e)) throw e;
      // 4xx other than 408/429 are terminal too.
      const msg = errMsg(e);
      if (/\b4(0[013-79]|1[0-7])\b/.test(msg) && !/\b(408|429)\b/.test(msg)) throw e;
      console.warn(`[stitch] ${label} attempt ${i + 1}/${backoff.length} failed: ${msg}`);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`${label} failed after ${backoff.length} attempts`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isFalAuthError(e: unknown): boolean {
  const msg = errMsg(e).toLowerCase();
  return /unauthorized|cannot access application|forbidden|403|401/.test(msg);
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
