"use client";

import { useState } from "react";

type Stage = "idle" | "fetching" | "transcribing" | "scoring" | "done" | "error";

interface ScoreResult {
  score: number;
  hook?: string;
  cta?: string;
  emotion?: string;
  clarity?: string;
  overall?: string;
  [key: string]: unknown;
}

interface PipelineResult {
  videoUrl?: string;
  transcript?: string;
  score?: ScoreResult;
  error?: string;
}

export default function SpyPage() {
  const [adUrl, setAdUrl] = useState("");
  const [videoUrlOverride, setVideoUrlOverride] = useState("");
  const [showVideoOverride, setShowVideoOverride] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState("");

  const stageLabel: Record<Stage, string> = {
    idle: "",
    fetching: "Fetching video from Ad Library…",
    transcribing: "Transcribing audio…",
    scoring: "Scoring ad with AI…",
    done: "Done!",
    error: "Error",
  };

  const progressPct: Record<Stage, number> = {
    idle: 0,
    fetching: 25,
    transcribing: 55,
    scoring: 80,
    done: 100,
    error: 0,
  };

  async function runPipeline() {
    const trimmedUrl = adUrl.trim();
    const trimmedVideo = videoUrlOverride.trim();

    if (!trimmedUrl && !trimmedVideo) {
      setError("Paste a Facebook Ad Library URL or a direct video URL.");
      return;
    }

    setError("");
    setResult(null);
    setStage("fetching");

    try {
      const body: Record<string, string> = {};
      if (trimmedUrl) body.url = trimmedUrl;
      if (trimmedVideo) body.videoUrl = trimmedVideo;

      const res = await fetch("/api/spy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      // Update stages based on timing (the API is sequential, so we animate)
      // We show transcribing after a small delay since we can't stream
      const transcribeTimer = setTimeout(() => setStage("transcribing"), 2000);
      const scoreTimer = setTimeout(() => setStage("scoring"), 8000);

      const data: PipelineResult & { success?: boolean } = await res.json();

      clearTimeout(transcribeTimer);
      clearTimeout(scoreTimer);

      if (!res.ok || data.error) {
        setError(data.error || "Pipeline failed.");
        setStage("error");
        setResult(data);

        // If video extraction failed, offer manual override
        if (res.status === 422) {
          setShowVideoOverride(true);
        }
        return;
      }

      setResult(data);
      setStage("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Network error");
      setStage("error");
    }
  }

  const isRunning = stage === "fetching" || stage === "transcribing" || stage === "scoring";

  const scoreColor = (s?: number) => {
    if (!s) return "text-zinc-400";
    if (s >= 8) return "text-emerald-400";
    if (s >= 5) return "text-yellow-400";
    return "text-red-400";
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-6 md:p-10">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ad Spy</h1>
          <p className="mt-1 text-zinc-400 text-sm">
            Paste a Facebook Ad Library URL — we&apos;ll fetch the video, transcribe it, and
            score it with AI in one click.
          </p>
        </div>

        {/* Input */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-zinc-300">
            Facebook Ad Library URL
          </label>
          <input
            type="url"
            value={adUrl}
            onChange={(e) => setAdUrl(e.target.value)}
            placeholder="https://www.facebook.com/ads/library/?id=123456789"
            disabled={isRunning}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
          />

          {/* Manual video URL toggle */}
          {(showVideoOverride || videoUrlOverride) && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-zinc-300">
                Direct video URL{" "}
                <span className="text-zinc-500 font-normal">(optional — paste if auto-fetch fails)</span>
              </label>
              <input
                type="url"
                value={videoUrlOverride}
                onChange={(e) => setVideoUrlOverride(e.target.value)}
                placeholder="https://video.xx.fbcdn.net/..."
                disabled={isRunning}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
              />
            </div>
          )}

          {!showVideoOverride && !videoUrlOverride && (
            <button
              onClick={() => setShowVideoOverride(true)}
              className="text-xs text-zinc-500 hover:text-violet-400 transition-colors"
            >
              + Paste direct video URL instead
            </button>
          )}
        </div>

        {/* CTA */}
        <button
          onClick={runPipeline}
          disabled={isRunning}
          className="w-full bg-violet-600 hover:bg-violet-500 disabled:bg-violet-900 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors text-sm"
        >
          {isRunning ? "Analysing…" : "Analyse Ad"}
        </button>

        {/* Progress bar */}
        {stage !== "idle" && stage !== "error" && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-zinc-400">
              <span>{stageLabel[stage]}</span>
              <span>{progressPct[stage]}%</span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-500 rounded-full transition-all duration-700"
                style={{ width: `${progressPct[stage]}%` }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-950 border border-red-800 text-red-300 rounded-lg p-4 text-sm">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Results */}
        {result && stage === "done" && (
          <div className="space-y-6">
            {/* Video */}
            {result.videoUrl && (
              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
                  Video
                </h2>
                <video
                  src={result.videoUrl}
                  controls
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900"
                />
                <a
                  href={result.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-violet-400 hover:underline break-all"
                >
                  {result.videoUrl}
                </a>
              </div>
            )}

            {/* Score */}
            {result.score && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
                    AI Score
                  </h2>
                  <span
                    className={`text-3xl font-black ${
                      scoreColor(result.score.score)
                    }`}
                  >
                    {result.score.score ?? "—"}
                    <span className="text-base font-normal text-zinc-500">/10</span>
                  </span>
                </div>

                {/* Score dimensions */}
                <div className="grid grid-cols-2 gap-3">
                  {(["hook", "cta", "emotion", "clarity"] as const).map((key) =>
                    result.score?.[key] ? (
                      <div
                        key={key}
                        className="bg-zinc-800 rounded-lg p-3 space-y-0.5"
                      >
                        <p className="text-xs uppercase tracking-wider text-zinc-500">
                          {key}
                        </p>
                        <p className="text-sm text-zinc-200">{String(result.score![key])}</p>
                      </div>
                    ) : null
                  )}
                </div>

                {result.score.overall && (
                  <div className="bg-zinc-800 rounded-lg p-3">
                    <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">
                      Overall feedback
                    </p>
                    <p className="text-sm text-zinc-200 leading-relaxed">
                      {result.score.overall}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Transcript */}
            {result.transcript && (
              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
                  Transcript
                </h2>
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-sm text-zinc-300 leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap">
                  {result.transcript}
                </div>
              </div>
            )}

            {/* Use this as inspiration */}
            <div className="flex gap-3">
              <a
                href={`/generate?inspiration=${encodeURIComponent(
                  result.transcript || ""
                )}`}
                className="flex-1 text-center bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium py-2.5 rounded-lg transition-colors"
              >
                Use as inspiration →
              </a>
              <button
                onClick={() => {
                  setStage("idle");
                  setResult(null);
                  setError("");
                  setAdUrl("");
                  setVideoUrlOverride("");
                  setShowVideoOverride(false);
                }}
                className="flex-1 text-center bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium py-2.5 rounded-lg transition-colors"
              >
                Analyse another
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
