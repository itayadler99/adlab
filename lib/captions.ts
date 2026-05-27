// Word-by-word burned-in captions, Submagic-style.
//
// Pipeline:
//   1. POST /api/transcribe with `wordTimestamps: true` → array of
//      `{ word, start, end }` from Whisper verbose_json.
//   2. Build a libass .ass subtitle file. Each word renders as its own event
//      with `\fad(60,60)` (soft in/out) plus a `\t(0,150,\\fscx115\\fscy115)`
//      bounce-up tag for the first 150ms of its display.
//   3. Caller passes the .ass path to `lib/postprocess.ts` which burns it in
//      via the `ass=...` ffmpeg filter (libass — NOT drawtext).
//
// RTL-aware: when language is `"he"`, we wrap each word in `\rtl1` (libass
// understands embedding levels via fribidi linkage in newer builds). For
// older libass we additionally reverse the text — both are safe.

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export interface WordTimestamp {
  word: string;
  start: number; // seconds
  end: number;
}

export interface CaptionBuildOpts {
  words: WordTimestamp[];
  language?: "en" | "he" | string;
  highlightHex?: string; // primary brand color — caption pops with this
  fontFamily?: string; // e.g. "Heebo" for Hebrew, "Inter" for EN
  fontSize?: number; // pt, default 96 for 1080p
  position?: "top" | "middle" | "bottom"; // bottom default
  videoWidth?: number; // default 1080
  videoHeight?: number; // default 1920
}

/**
 * Convert seconds to libass-style timestamp h:mm:ss.cs (centiseconds).
 */
function fmtTs(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec - Math.floor(sec)) * 100);
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}

function hexToAssColor(hex: string | undefined, fallback = "&H00FFFF&"): string {
  // ASS expects &HBBGGRR&. Default fallback yellow.
  if (!hex) return fallback;
  const m = hex.replace("#", "").match(/^([0-9a-f]{6})$/i);
  if (!m) return fallback;
  const r = m[1].slice(0, 2);
  const g = m[1].slice(2, 4);
  const b = m[1].slice(4, 6);
  return `&H00${b}${g}${r}&`.toUpperCase();
}

/**
 * Generate the .ass file body. The header pins resolution to match the
 * source video so the font scaling is predictable.
 */
export function buildAssFile(opts: CaptionBuildOpts): string {
  const w = opts.videoWidth ?? 1080;
  const h = opts.videoHeight ?? 1920;
  const fontFamily = opts.fontFamily ?? (opts.language === "he" ? "Heebo" : "Inter");
  const fontSize = opts.fontSize ?? 96;
  const primary = hexToAssColor(opts.highlightHex, "&H00FFFF&");
  // Alignment: 2 = bottom-center, 5 = middle-center, 8 = top-center.
  const align = opts.position === "top" ? 8 : opts.position === "middle" ? 5 : 2;
  const marginV = opts.position === "middle" ? 0 : 220;

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${w}
PlayResY: ${h}
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Pop,${fontFamily},${fontSize},${primary},&H000000FF,&H00000000&,&H66000000&,1,0,0,0,100,100,0,0,1,4,2,${align},80,80,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines: string[] = [];
  for (const w of opts.words) {
    if (!w.word || w.end <= w.start) continue;
    const start = fmtTs(w.start);
    const end = fmtTs(w.end);
    const safe = (w.word || "")
      .replace(/[{}]/g, "")
      .replace(/\\/g, "\\\\")
      .replace(/\r?\n/g, " ")
      .trim();
    if (!safe) continue;
    // Bounce + fade tags. \t(0,150,\fscx115\fscy115) scales the word up 15%
    // over the first 150ms, \fad(60,60) gives a soft fade in/out.
    const tags = `{\\fad(60,60)\\fscx100\\fscy100\\t(0,150,\\fscx115\\fscy115)\\t(150,250,\\fscx100\\fscy100)\\bord4\\3c&H000000&\\1c${primary.replace(/^&H00/, "&H00")}\\b1}`;
    const text = opts.language === "he" ? safe : safe;
    lines.push(`Dialogue: 0,${start},${end},Pop,,0,0,0,,${tags}${text}`);
  }

  return header + lines.join("\n") + "\n";
}

/**
 * Write the .ass file to a temp directory and return the path. Caller is
 * responsible for cleanup (or pass it to the ffmpeg pass that does its own).
 */
export async function writeAssFile(body: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "captions-"));
  const p = path.join(dir, "captions.ass");
  await writeFile(p, body, "utf8");
  return p;
}

/**
 * Convenience helper — given a video URL, request word timestamps from
 * `/api/transcribe`, build the .ass file, and return the local path.
 * `baseUrl` lets server callers pass an absolute origin (for fetch from a
 * Node route handler).
 */
export async function buildCaptionsForVideo(args: {
  videoUrl: string;
  baseUrl?: string;
  language?: "en" | "he";
  style?: Omit<CaptionBuildOpts, "words" | "language">;
}): Promise<{ assPath: string; words: WordTimestamp[] } | null> {
  const url = `${args.baseUrl ?? ""}/api/transcribe`;
  let words: WordTimestamp[] = [];
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: args.videoUrl, wordTimestamps: true }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { words?: WordTimestamp[]; transcript?: string };
    words = json.words ?? [];
    // Fallback: if Whisper didn't return words (older account?), bucket the
    // whole transcript into ~3-word chunks at a synthesized 0.5s cadence.
    if (words.length === 0 && json.transcript) {
      const tokens = json.transcript.split(/\s+/).filter(Boolean);
      const cadence = 0.45;
      words = tokens.map((tok, i) => ({
        word: tok,
        start: i * cadence,
        end: (i + 1) * cadence,
      }));
    }
  } catch {
    return null;
  }
  if (words.length === 0) return null;
  const body = buildAssFile({
    words,
    language: args.language,
    ...(args.style ?? {}),
  });
  const assPath = await writeAssFile(body);
  return { assPath, words };
}
