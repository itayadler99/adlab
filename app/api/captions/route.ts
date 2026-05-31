import { NextResponse } from "next/server";
import { buildAssFile, type WordTimestamp, type CaptionBuildOpts } from "@/lib/captions";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// POST /api/captions
// -----------------------------------------------------------------------------
// Build word-by-word libass captions, decoupled from the postprocess burn-in.
//
// Two modes:
//   1. { videoUrl }      → transcribes via /api/transcribe (word timestamps),
//                          then returns the .ass body + words.
//   2. { words: [...] }  → skip transcription, build the .ass body directly
//                          (lets the UI re-style captions without re-paying for
//                          Whisper).
//
// Returns the .ass file body as text plus the word list. The caller (or the
// Terminal-1 postprocess pass) burns it in with the ffmpeg `ass=` filter. We
// deliberately do NOT touch the video here — this route is preview/inspection
// only, so it stays fast and writes nothing to Blob.
// -----------------------------------------------------------------------------

type Style = Omit<CaptionBuildOpts, "words" | "language">;

interface Body {
  videoUrl?: string;
  words?: WordTimestamp[];
  language?: "en" | "he";
  style?: Style;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const language = body.language === "he" ? "he" : "en";

    let words: WordTimestamp[] = Array.isArray(body.words) ? body.words : [];

    // Mode 1: fetch word timestamps from the transcribe route.
    if (words.length === 0) {
      if (!body.videoUrl) {
        return NextResponse.json({ error: "provide videoUrl or words[]" }, { status: 400 });
      }
      if (!/^https:\/\//i.test(body.videoUrl)) {
        return NextResponse.json({ error: "videoUrl must be https://" }, { status: 400 });
      }
      const origin = new URL(req.url).origin;
      const res = await fetch(`${origin}/api/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: body.videoUrl, wordTimestamps: true }),
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: `transcribe failed (${res.status})` },
          { status: 502 }
        );
      }
      const json = (await res.json()) as { words?: WordTimestamp[]; transcript?: string };
      words = json.words ?? [];
      // Whisper word timestamps occasionally come back empty (account quirk):
      // bucket the transcript into a synthesized cadence so captions still render.
      if (words.length === 0 && json.transcript) {
        const tokens = json.transcript.split(/\s+/).filter(Boolean);
        const cadence = 0.45;
        words = tokens.map((tok, i) => ({ word: tok, start: i * cadence, end: (i + 1) * cadence }));
      }
    }

    if (words.length === 0) {
      return NextResponse.json({ error: "no word timestamps available" }, { status: 422 });
    }

    const ass = buildAssFile({ words, language, ...(body.style ?? {}) });
    return NextResponse.json({ ass, words, language, wordCount: words.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "captions build failed" },
      { status: 500 }
    );
  }
}
