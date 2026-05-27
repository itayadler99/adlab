import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// Downloads a video/audio URL and sends it to OpenAI Whisper for transcription.
// Whisper accepts mp4/m4a/mp3 directly — no ffmpeg required.
//
// Pass `wordTimestamps: true` to get verbose_json + word-level timestamps,
// which the captions module needs to build the bouncing-word .ass file.
export async function POST(req: Request) {
  try {
    const { url, wordTimestamps } = (await req.json()) as {
      url?: string;
      wordTimestamps?: boolean;
    };
    if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

    const key = process.env.OPENAI_API_KEY;
    if (!key) return NextResponse.json({ error: "OPENAI_API_KEY not set on server" }, { status: 500 });

    // 1. fetch the media
    const media = await fetch(url);
    if (!media.ok) return NextResponse.json({ error: `fetch failed ${media.status}` }, { status: 502 });
    const buf = Buffer.from(await media.arrayBuffer());
    const contentType = media.headers.get("content-type") || "video/mp4";
    const ext = contentType.includes("mp4") ? "mp4" : contentType.includes("mpeg") ? "mp3" : "m4a";

    // 2. send to Whisper
    const form = new FormData();
    form.append("file", new Blob([buf], { type: contentType }), `clip.${ext}`);
    form.append("model", "whisper-1");
    if (wordTimestamps) {
      form.append("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "word");
    }

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    const out = await res.json();
    if (out.error) return NextResponse.json({ error: out.error.message }, { status: 500 });
    if (wordTimestamps) {
      return NextResponse.json({
        transcript: out.text,
        words: out.words ?? [],
        language: out.language,
        duration: out.duration,
      });
    }
    return NextResponse.json({ transcript: out.text });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
