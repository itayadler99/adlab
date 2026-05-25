"use client";
import { useState, useCallback } from "react";
import { MODEL_MAP } from "@/lib/video";

type ScriptData = {
  script: string;
  hook: string;
  cta: string;
  product: string;
};

type VideoJob = {
  jobId: string;
  model: string;
  style: string;
  status: "pending" | "processing" | "done" | "failed";
  url?: string;
  thumbnail?: string;
  script: ScriptData;
};

const STYLES = ["cinematic", "ugc", "product", "testimonial", "animated"];

export default function GeneratePage() {
  const [productUrl, setProductUrl] = useState("");
  const [platform, setPlatform] = useState("facebook");
  const [loading, setLoading] = useState(false);
  const [scriptData, setScriptData] = useState<ScriptData | null>(null);
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [error, setError] = useState("");
  const [showVariations, setShowVariations] = useState(false);
  const [selectedModel, setSelectedModel] = useState(Object.keys(MODEL_MAP)[0]);
  const [selectedStyle, setSelectedStyle] = useState(STYLES[0]);
  const [generating, setGenerating] = useState(false);

  const modelKeys = Object.keys(MODEL_MAP);

  const handleGenerate = useCallback(async () => {
    if (!productUrl.trim()) return;
    setLoading(true);
    setError("");
    setScriptData(null);
    setJobs([]);
    setShowVariations(false);
    try {
      const res = await fetch("/api/generate/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productUrl, platform }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setScriptData(data);
      await startVideo(data, selectedModel, selectedStyle);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setLoading(false);
    }
  }, [productUrl, platform, selectedModel, selectedStyle]);

  const startVideo = useCallback(
    async (script: ScriptData, model: string, style: string) => {
      setGenerating(true);
      const tempId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const newJob: VideoJob = {
        jobId: tempId,
        model,
        style,
        status: "pending",
        script,
      };
      setJobs((prev) => [newJob, ...prev]);
      try {
        const res = await fetch("/api/generate/video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ script: script.script, hook: script.hook, cta: script.cta, model, style }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const jobId = data.jobId;
        setJobs((prev) =>
          prev.map((j) =>
            j.jobId === tempId ? { ...j, jobId, status: "processing" } : j
          )
        );
        pollJob(jobId, tempId);
      } catch (e: unknown) {
        setJobs((prev) =>
          prev.map((j) =>
            j.jobId === tempId ? { ...j, status: "failed" } : j
          )
        );
        setError(e instanceof Error ? e.message : "Failed to start video");
      } finally {
        setGenerating(false);
      }
    },
    []
  );

  const pollJob = useCallback(async (jobId: string, tempId: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/poll?jobId=${jobId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "done" || data.status === "failed") {
          clearInterval(interval);
          setJobs((prev) =>
            prev.map((j) =>
              j.jobId === jobId || j.jobId === tempId
                ? { ...j, status: data.status, url: data.url, thumbnail: data.thumbnail }
                : j
            )
          );
        } else {
          setJobs((prev) =>
            prev.map((j) =>
              j.jobId === jobId || j.jobId === tempId
                ? { ...j, status: data.status }
                : j
            )
          );
        }
      } catch {
        clearInterval(interval);
      }
    }, 4000);
  }, []);

  const handleVariation = useCallback(async () => {
    if (!scriptData) return;
    await startVideo(scriptData, selectedModel, selectedStyle);
  }, [scriptData, selectedModel, selectedStyle, startVideo]);

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8 text-purple-400">Generate Ad Video</h1>

      {/* Input Section */}
      <section className="bg-gray-900 rounded-2xl p-6 mb-6 space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Product URL</label>
          <input
            type="url"
            value={productUrl}
            onChange={(e) => setProductUrl(e.target.value)}
            placeholder="https://yourstore.myshopify.com/products/..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
          />
        </div>
        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 min-w-40">
            <label className="block text-sm text-gray-400 mb-1">Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
            >
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
            </select>
          </div>
          <div className="flex-1 min-w-40">
            <label className="block text-sm text-gray-400 mb-1">Model</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
            >
              {modelKeys.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-40">
            <label className="block text-sm text-gray-400 mb-1">Style</label>
            <select
              value={selectedStyle}
              onChange={(e) => setSelectedStyle(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
            >
              {STYLES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading || !productUrl.trim()}
          className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-xl font-semibold text-lg transition"
        >
          {loading ? "Generating Script..." : "Generate Ad"}
        </button>
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </section>

      {/* Script Preview */}
      {scriptData && (
        <section className="bg-gray-900 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-purple-300">Script</h2>
            <button
              onClick={() => setShowVariations((v) => !v)}
              className="px-4 py-1.5 bg-indigo-700 hover:bg-indigo-600 rounded-lg text-sm font-medium transition"
            >
              🎬 Variations
            </button>
          </div>
          {scriptData.hook && (
            <div className="mb-3">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Hook</span>
              <p className="text-gray-200 mt-1">{scriptData.hook}</p>
            </div>
          )}
          <div className="mb-3">
            <span className="text-xs text-gray-500 uppercase tracking-wide">Script</span>
            <p className="text-gray-200 mt-1 whitespace-pre-wrap">{scriptData.script}</p>
          </div>
          {scriptData.cta && (
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wide">CTA</span>
              <p className="text-gray-200 mt-1">{scriptData.cta}</p>
            </div>
          )}

          {/* Variations Panel */}
          {showVariations && (
            <div className="mt-6 border-t border-gray-700 pt-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Render same script with a different model &amp; style</h3>
              <div className="flex gap-4 flex-wrap mb-4">
                <div className="flex-1 min-w-40">
                  <label className="block text-xs text-gray-500 mb-1">Model</label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                  >
                    {modelKeys.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 min-w-40">
                  <label className="block text-xs text-gray-500 mb-1">Style</label>
                  <select
                    value={selectedStyle}
                    onChange={(e) => setSelectedStyle(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                  >
                    {STYLES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                onClick={handleVariation}
                disabled={generating}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold text-sm transition"
              >
                {generating ? "Starting..." : "▶ Render Variation"}
              </button>
            </div>
          )}
        </section>
      )}

      {/* Jobs List */}
      {jobs.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-purple-300">Videos</h2>
          {jobs.map((job) => (
            <div key={job.jobId} className="bg-gray-900 rounded-2xl p-5 flex gap-5 items-start">
              {/* Thumbnail / Status */}
              <div className="w-32 h-20 bg-gray-800 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center">
                {job.status === "done" && job.url ? (
                  <video src={job.url} className="w-full h-full object-cover" muted playsInline />
                ) : job.status === "failed" ? (
                  <span className="text-red-400 text-xs">Failed</span>
                ) : (
                  <span className="text-gray-500 text-xs animate-pulse">
                    {job.status === "pending" ? "Queued" : "Processing…"}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs bg-indigo-900 text-indigo-300 rounded px-2 py-0.5">{job.model}</span>
                  <span className="text-xs bg-gray-800 text-gray-400 rounded px-2 py-0.5">{job.style}</span>
                  <span
                    className={`text-xs rounded px-2 py-0.5 ${
                      job.status === "done"
                        ? "bg-green-900 text-green-300"
                        : job.status === "failed"
                        ? "bg-red-900 text-red-300"
                        : "bg-yellow-900 text-yellow-300"
                    }`}
                  >
                    {job.status}
                  </span>
                </div>
                <p className="text-gray-400 text-xs line-clamp-2">{job.script.hook || job.script.script}</p>
                {job.status === "done" && job.url && (
                  <div className="mt-2 flex gap-3">
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-purple-400 hover:text-purple-300 underline"
                    >
                      Watch
                    </a>
                    <a
                      href={`/launch?videoUrl=${encodeURIComponent(job.url)}`}
                      className="text-xs text-green-400 hover:text-green-300 underline"
                    >
                      Launch as Ad
                    </a>
                  </div>
                )}
              </div>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
