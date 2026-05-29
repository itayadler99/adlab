"use client";

import { useState } from "react";
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

export default function GeneratePage() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<VideoModel>("veo-3-fast");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    jobId?: string;
    error?: string;
    comingSoon?: boolean;
  } | null>(null);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/generate/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, model }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ error: "שגיאת רשת" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">יצירת סרטון פרסומת</h1>
        <p className="text-white/50 mb-8">
          בחרו מודל ותארו את הסרטון שתרצו להפיק.
        </p>

        <form onSubmit={handleGenerate} className="space-y-6">
          {/* Model selector */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-3">
              מודל וידאו
            </label>
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
                    disabled={!opt.available}
                    onChange={() => opt.available && setModel(opt.value)}
                    className="mt-1 accent-violet-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white ltr-island">
                        {opt.label}
                      </span>
                      {!opt.available && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          בקרוב
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-white/50 mt-0.5">
                      {opt.description}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Prompt */}
          <div>
            <label
              htmlFor="prompt"
              className="block text-sm font-medium text-white/70 mb-2"
            >
              תיאור הסרטון
            </label>
            <textarea
              id="prompt"
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="תארו את סרטון הפרסומת שתרצו להפיק"
              className="w-full rounded-lg border border-white/10 bg-white/5 text-white px-4 py-3 text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="w-full rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-3 font-semibold text-white transition-colors"
          >
            {loading ? "מפיק" : "הפקת סרטון"}
          </button>
        </form>

        {/* Result */}
        {result && (
          <div
            className={[
              "mt-6 rounded-lg border p-4 text-sm",
              result.error
                ? "border-red-700 bg-red-950/40 text-red-300"
                : "border-green-700 bg-green-950/40 text-green-300",
            ].join(" ")}
          >
            {result.error ? (
              <>
                <p className="font-semibold mb-1">שגיאה</p>
                <p>{result.error}</p>
              </>
            ) : (
              <>
                <p className="font-semibold mb-1">המשימה החלה</p>
                <p>
                  מזהה משימה: <code className="font-mono ltr-island">{result.jobId}</code>
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
