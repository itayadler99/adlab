"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { VideoModel } from "@/lib/video";

const MODEL_OPTIONS: {
  value: VideoModel;
  label: string;
  description: string;
  available: boolean;
}[] = [
  {
    value: "veo-3-fast",
    label: "Veo 3 Fast",
    description: "ברירת המחדל המומלצת. אנכי 1080p, שמונה שניות.",
    available: true,
  },
  {
    value: "veo-3",
    label: "Veo 3",
    description: "איכות קולנועית מובילה, שמונה שניות.",
    available: true,
  },
  {
    value: "kling-2.1",
    label: "Kling 2.1",
    description: "מצוין לתוכן גולשים ומוצר, תנועה ריאליסטית, חמש עד עשר שניות.",
    available: true,
  },
  {
    value: "hailuo-02",
    label: "Hailuo 02",
    description: "תנועה חלקה, שש עד עשר שניות.",
    available: true,
  },
  {
    value: "seedance-1.0",
    label: "Seedance 1.0",
    description: "מהיר עם תנועה טובה.",
    available: true,
  },
  {
    value: "kling-1.6",
    label: "Kling 1.6",
    description: "בסיס קולנועי יציב.",
    available: true,
  },
  {
    value: "minimax",
    label: "Minimax Video-01",
    description: "מהיר, עלות נמוכה, איכות בסיסית.",
    available: true,
  },
];

type Phase = "idle" | "starting" | "rendering" | "done" | "error";

function GenerateInner() {
  const searchParams = useSearchParams();
  const inspiration = searchParams.get("inspiration") ?? "";

  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<VideoModel>("veo-3-fast");
  const [phase, setPhase] = useState<Phase>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pre-fill the prompt when arriving from the spy tool ("use as inspiration").
  useEffect(() => {
    if (inspiration) setPrompt(inspiration);
  }, [inspiration]);

  // Cleanup any pending poll on unmount.
  useEffect(() => () => {
    if (pollRef.current) clearTimeout(pollRef.current);
  }, []);

  const poll = useCallback(
    async (id: string, m: VideoModel) => {
      try {
        const res = await fetch(
          `/api/poll?id=${encodeURIComponent(id)}&kind=video&model=${encodeURIComponent(m)}`
        );
        const data = await res.json();
        if (data.status === "succeeded" && data.videoUrl) {
          setVideoUrl(data.videoUrl);
          setPhase("done");
          return;
        }
        if (data.status === "failed") {
          setError(data.error || "ההפקה נכשלה");
          setPhase("error");
          return;
        }
        // still processing — poll again
        pollRef.current = setTimeout(() => poll(id, m), 4000);
      } catch {
        // transient network blip — keep trying
        pollRef.current = setTimeout(() => poll(id, m), 5000);
      }
    },
    []
  );

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || phase === "starting" || phase === "rendering") return;
    setPhase("starting");
    setError(null);
    setVideoUrl(null);
    setJobId(null);
    try {
      const res = await fetch("/api/generate/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, model }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "ההפקה נכשלה");
        setPhase("error");
        return;
      }
      setJobId(data.jobId);
      if (data.status === "succeeded" && data.videoUrl) {
        setVideoUrl(data.videoUrl);
        setPhase("done");
        return;
      }
      setPhase("rendering");
      poll(data.jobId, data.model ?? model);
    } catch {
      setError("שגיאת רשת");
      setPhase("error");
    }
  }

  function reset() {
    if (pollRef.current) clearTimeout(pollRef.current);
    setPhase("idle");
    setJobId(null);
    setVideoUrl(null);
    setError(null);
  }

  const busy = phase === "starting" || phase === "rendering";

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">יצירת סרטון פרסומת</h1>
        <p className="text-white/50 mb-8">בחרו מודל ותארו את הסרטון שתרצו להפיק.</p>

        {inspiration && phase === "idle" && (
          <div className="mb-6 rounded-lg border border-violet-500/30 bg-violet-950/30 p-3 text-sm text-violet-200">
            התסריט נטען מניתוח פרסומת המתחרה. ערכו לפי הצורך והפיקו.
          </div>
        )}

        <form onSubmit={handleGenerate} className="space-y-6">
          {/* Model selector */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-3">מודל וידאו</label>
            <div className="grid gap-3">
              {MODEL_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={[
                    "flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors",
                    opt.available
                      ? model === opt.value
                        ? "border-violet-500 bg-violet-950/40"
                        : "border-white/10 hover:border-white/30 bg-white/5"
                      : "border-white/10 bg-white/5 opacity-60 cursor-not-allowed",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="model"
                    value={opt.value}
                    checked={model === opt.value}
                    disabled={!opt.available || busy}
                    onChange={() => opt.available && setModel(opt.value)}
                    className="mt-1 accent-violet-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white ltr-island">{opt.label}</span>
                      {!opt.available && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          בקרוב
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-white/50 mt-0.5">{opt.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Prompt */}
          <div>
            <label htmlFor="prompt" className="block text-sm font-medium text-white/70 mb-2">
              תיאור הסרטון
            </label>
            <textarea
              id="prompt"
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={busy}
              placeholder="תארו את סרטון הפרסומת שתרצו להפיק"
              className="w-full rounded-lg border border-white/10 bg-white/5 text-white px-4 py-3 text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none disabled:opacity-50"
            />
          </div>

          <button
            type="submit"
            disabled={busy || !prompt.trim()}
            className="w-full rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-3 font-semibold text-white transition-colors"
          >
            {phase === "starting" ? "מתחיל" : phase === "rendering" ? "מפיק" : "הפקת סרטון"}
          </button>
        </form>

        {/* Rendering progress */}
        {phase === "rendering" && (
          <div className="mt-6 rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-3 text-sm text-white/70">
              <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
              מפיק את הסרטון. זה לוקח בדרך כלל כדקה.
            </div>
            <div className="mt-3 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full w-1/2 bg-violet-500 rounded-full animate-pulse" />
            </div>
            {jobId && (
              <p className="mt-2 text-xs text-white/30">
                מזהה משימה: <code className="font-mono ltr-island">{jobId}</code>
              </p>
            )}
          </div>
        )}

        {/* Result video */}
        {phase === "done" && videoUrl && (
          <div className="mt-6 space-y-3">
            <div className="rounded-lg border border-emerald-700/40 bg-emerald-950/30 p-3 text-sm text-emerald-300">
              הסרטון מוכן.
            </div>
            <video
              src={videoUrl}
              controls
              className="w-full aspect-[9/16] max-h-[70vh] object-contain rounded-xl border border-white/10 bg-zinc-900"
            />
            <div className="flex gap-3">
              <a
                href={videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 text-sm font-medium py-2.5 rounded-lg transition-colors"
              >
                פתיחה בכרטיסייה חדשה
              </a>
              <button
                onClick={reset}
                className="flex-1 text-center bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 text-sm font-medium py-2.5 rounded-lg transition-colors"
              >
                הפקת סרטון נוסף
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {phase === "error" && (
          <div className="mt-6 rounded-lg border border-red-700 bg-red-950/40 p-4 text-sm text-red-300">
            <p className="font-semibold mb-1">שגיאה</p>
            <p>{error}</p>
            <button
              onClick={reset}
              className="mt-3 text-xs text-red-200 underline hover:text-white"
            >
              ניסיון חוזר
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

export default function GeneratePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <GenerateInner />
    </Suspense>
  );
}
