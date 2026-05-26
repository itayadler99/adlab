// Three-tier stitch: FAL ffmpeg-api/compose → Replicate ffmpeg-concat → local
// ffmpeg-static + Vercel Blob. The FAL endpoint is gated on some accounts
// (returns Unauthorized), so we fall through. Each tier returns a public MP4
// URL the caller can hand straight to the player.
import { fal } from "@fal-ai/client";
import Replicate from "replicate";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const FAL_KEY = process.env.FAL_KEY;
if (FAL_KEY) fal.config({ credentials: FAL_KEY });

const FAL_ENDPOINT = "fal-ai/ffmpeg-api/compose";
// Replicate concat model. Accepts a list of mp4 urls and returns a concatenated
// mp4. If the account doesn't have access to this specific slug we fall
// through to the ffmpeg-static tier.
const REPLICATE_CONCAT_MODEL = "lucataco/ffmpeg-concat";

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

  const attempts: { tier: string; error: string }[] = [];

  if (FAL_KEY) {
    try {
      const url = await stitchViaFal(input);
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
      const url = await stitchViaReplicate(input.urls);
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
    const url = await stitchViaFfmpegStatic(input.urls);
    return { url, trace: { tier: "ffmpeg-static", attempts } };
  } catch (e) {
    attempts.push({ tier: "ffmpeg-static", error: errMsg(e) });
    throw new Error(
      `stitch failed across all tiers. attempts=${JSON.stringify(attempts)}`
    );
  }
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

async function stitchViaFfmpegStatic(urls: string[]): Promise<string> {
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
    // Download each clip to /tmp.
    const localPaths: string[] = [];
    for (let i = 0; i < urls.length; i++) {
      const res = await fetch(urls[i]);
      if (!res.ok) throw new Error(`fetch ${urls[i]}: HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const p = path.join(workDir, `clip-${i}.mp4`);
      await writeFile(p, buf);
      localPaths.push(p);
    }

    // Concat demuxer needs a file list.
    const listFile = path.join(workDir, "list.txt");
    const listBody = localPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
    await writeFile(listFile, listBody);

    const outPath = path.join(workDir, "out.mp4");
    // Try stream-copy first (zero re-encode, fast). If clips have mismatched
    // codecs/timebases the muxer will fail; re-encode as a fallback.
    try {
      await runFfmpeg(ffmpegPath, [
        "-y", "-f", "concat", "-safe", "0",
        "-i", listFile,
        "-c", "copy",
        outPath,
      ]);
    } catch {
      await runFfmpeg(ffmpegPath, [
        "-y", "-f", "concat", "-safe", "0",
        "-i", listFile,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-c:a", "aac", "-b:a", "128k",
        "-pix_fmt", "yuv420p",
        outPath,
      ]);
    }

    const sz = (await stat(outPath)).size;
    if (sz < 1024) throw new Error(`stitched mp4 too small (${sz} bytes)`);
    const mp4 = await readFile(outPath);

    // Upload to Vercel Blob.
    const { put } = await import("@vercel/blob");
    const blob = await put(`stitched/${Date.now()}-${urls.length}clips.mp4`, mp4, {
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
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

// ---- helpers ---------------------------------------------------------------

function isFalAuthError(e: unknown): boolean {
  const msg = errMsg(e).toLowerCase();
  return /unauthorized|cannot access application|forbidden|403|401/.test(msg);
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
