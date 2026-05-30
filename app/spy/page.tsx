"use client";

import { useState } from "react";

type Stage = "idle" | "fetching" | "transcribing" | "scoring" | "done" | "error";

const DIMENSION_LABELS: Record<"hook" | "cta" | "emotion" | "clarity", string> = {
  hook: "וו פתיחה",
  cta: "קריאה לפעולה",
  emotion: "רגש",
  clarity: "בהירות",
};

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
    fetching: "מושך את הסרטון מספריית הפרסומות",
    transcribing: "מתמלל את האודיו",
    scoring: "מנתח את הפרסומת",
    done: "הסתיים",
    error: "שגיאה",
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
      setError("הדביקו קישור מספריית הפרסומות של פייסבוק או קישור ישיר לסרטון.");
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
        setError(data.error || "התהליך נכשל.");
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
      setError(e instanceof Error ? e.message : "שגיאת רשת");
      setStage("error");
    }
  }

  const isRunning = stage === "fetching" || stage === "transcribing" || stage === "scoring";

  const scoreColor = (s?: number) => {
    if (!s) return "text-white/50";
    if (s >= 8) return "text-emerald-400";
    if (s >= 5) return "text-yellow-400";
    return "text-red-400";
  };

  return (
    <main className="min-h-screen bg-black text-white p-6 md:p-10">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">ריגול פרסומות</h1>
          <p className="mt-1 text-white/50 text-sm">
            הדביקו קישור מספריית הפרסומות של פייסבוק, ונמשוך את הסרטון, נתמלל אותו ונדרג אותו בלחיצה אחת.
          </p>
        </div>

        {/* Input */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-white/70">
            קישור מספריית הפרסומות של פייסבוק
          </label>
          <input
            type="url"
            value={adUrl}
            onChange={(e) => setAdUrl(e.target.value)}
            placeholder="https://www.facebook.com/ads/library/?id=123456789"
            disabled={isRunning}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50 ltr-island"
          />

          {/* Manual video URL toggle */}
          {(showVideoOverride || videoUrlOverride) && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/70">
                קישור ישיר לסרטון{" "}
                <span className="text-white/40 font-normal">(לא חובה, הדביקו אם המשיכה האוטומטית נכשלה)</span>
              </label>
              <input
                type="url"
                value={videoUrlOverride}
                onChange={(e) => setVideoUrlOverride(e.target.value)}
                placeholder="https://video.xx.fbcdn.net/..."
                disabled={isRunning}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50 ltr-island"
              />
            </div>
          )}

          {!showVideoOverride && !videoUrlOverride && (
            <button
              onClick={() => setShowVideoOverride(true)}
              className="text-xs text-white/40 hover:text-violet-400 transition-colors"
            >
              + הדביקו קישור ישיר לסרטון במקום
            </button>
          )}
        </div>

        {/* CTA */}
        <button
          onClick={runPipeline}
          disabled={isRunning}
          className="w-full bg-violet-600 hover:bg-violet-500 disabled:bg-violet-900 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors text-sm"
        >
          {isRunning ? "מנתח" : "ניתוח פרסומת"}
        </button>

        {/* Progress bar */}
        {stage !== "idle" && stage !== "error" && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-white/50">
              <span>{stageLabel[stage]}</span>
              <span>{progressPct[stage]}%</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
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
            <strong>שגיאה:</strong> {error}
          </div>
        )}

        {/* Results */}
        {result && stage === "done" && (
          <div className="space-y-6">
            {/* Video */}
            {result.videoUrl && (
              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-white/70 tracking-wider">
                  סרטון
                </h2>
                <video
                  src={result.videoUrl}
                  controls
                  className="w-full rounded-lg border border-white/10 bg-white/5"
                />
                <a
                  href={result.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-violet-400 hover:underline break-all ltr-island"
                >
                  {result.videoUrl}
                </a>
              </div>
            )}

            {/* Score */}
            {result.score && (
              <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white/70 tracking-wider">
                    ציון
                  </h2>
                  <span
                    className={`text-3xl font-black ${
                      scoreColor(result.score.score)
                    }`}
                  >
                    {result.score.score ?? "·"}
                    <span className="text-base font-normal text-white/40">/10</span>
                  </span>
                </div>

                {/* Score dimensions */}
                <div className="grid grid-cols-2 gap-3">
                  {(["hook", "cta", "emotion", "clarity"] as const).map((key) =>
                    result.score?.[key] ? (
                      <div
                        key={key}
                        className="bg-white/10 rounded-lg p-3 space-y-0.5"
                      >
                        <p className="text-xs tracking-wider text-white/40">
                          {DIMENSION_LABELS[key]}
                        </p>
                        <p className="text-sm text-white/80">{String(result.score![key])}</p>
                      </div>
                    ) : null
                  )}
                </div>

                {result.score.overall && (
                  <div className="bg-white/10 rounded-lg p-3">
                    <p className="text-xs tracking-wider text-white/40 mb-1">
                      משוב כללי
                    </p>
                    <p className="text-sm text-white/80 leading-relaxed">
                      {result.score.overall}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Transcript */}
            {result.transcript && (
              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-white/70 tracking-wider">
                  תמלול
                </h2>
                <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-sm text-white/70 leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap">
                  {result.transcript}
                </div>
              </div>
            )}

            {/* Use this as inspiration */}
            <div className="flex gap-3">
              <a
                href={`/app/generate?inspiration=${encodeURIComponent(
                  result.transcript || ""
                )}`}
                className="flex-1 text-center bg-white/10 hover:bg-white/15 text-white/80 text-sm font-medium py-2.5 rounded-lg transition-colors"
              >
                שימוש כהשראה
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
                className="flex-1 text-center bg-white/10 hover:bg-white/15 text-white/80 text-sm font-medium py-2.5 rounded-lg transition-colors"
              >
                ניתוח פרסומת נוספת
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
