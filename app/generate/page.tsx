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
    value: "minimax",
    label: "Minimax Video-01",
    description: "Fast, high-quality short-form video generation.",
    available: true,
  },
  {
    value: "kling-1.6",
    label: "Kling 1.6",
    description: "Cinematic quality with strong motion consistency.",
    available: true,
  },
  {
    value: "sora-2",
    label: "Sora-2",
    description: "OpenAI Sora-2 — REST API coming soon (currently MCP-only).",
    available: false,
  },
];

export default function GeneratePage() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<VideoModel>("minimax");
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
      setResult({ error: "Network error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Generate Video Ad</h1>
        <p className="text-zinc-400 mb-8">
          Choose a model and describe your video ad.
        </p>

        <form onSubmit={handleGenerate} className="space-y-6">
          {/* Model selector */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-3">
              Video Model
            </label>
            <div className="grid gap-3">
              {MODEL_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={[
                    "flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors",
                    opt.available
                      ? model === opt.value
                        ? "border-indigo-500 bg-indigo-950/40"
                        : "border-zinc-700 hover:border-zinc-500 bg-zinc-900"
                      : "border-zinc-800 bg-zinc-900/50 opacity-60 cursor-not-allowed",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="model"
                    value={opt.value}
                    checked={model === opt.value}
                    disabled={!opt.available}
                    onChange={() => opt.available && setModel(opt.value)}
                    className="mt-1 accent-indigo-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-100">
                        {opt.label}
                      </span>
                      {!opt.available && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          Coming Soon
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-400 mt-0.5">
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
              className="block text-sm font-medium text-zinc-300 mb-2"
            >
              Prompt
            </label>
            <textarea
              id="prompt"
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the video ad you want to generate…"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-100 px-4 py-3 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-3 font-semibold text-white transition-colors"
          >
            {loading ? "Generating…" : "Generate Video"}
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
                <p className="font-semibold mb-1">
                  {result.comingSoon ? "⏳ Coming Soon" : "❌ Error"}
                </p>
                <p>{result.error}</p>
                {result.comingSoon && (
                  <p className="mt-2 text-amber-400">
                    Sora-2 REST API is expected to launch soon. In the meantime,
                    use Minimax or Kling 1.6.
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="font-semibold mb-1">✅ Job Started</p>
                <p>
                  Job ID: <code className="font-mono">{result.jobId}</code>
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
