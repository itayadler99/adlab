"use client";
import { useState } from "react";

type Score = {
  hook_score: number;
  retention_score: number;
  cta_score: number;
  overall: number;
  reasons: string[];
  steal_this: string[];
};

export default function SpyPage() {
  const [url, setUrl] = useState("");
  const [transcript, setTranscript] = useState("");
  const [visual, setVisual] = useState("");
  const [score, setScore] = useState<Score | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function analyze() {
    if (!transcript.trim()) {
      setError("Paste a transcript. (Whisper transcription will be wired in v0.2.)");
      return;
    }
    setLoading(true);
    setError("");
    setScore(null);
    try {
      const res = await fetch("/api/spy", {
        method: "POST",
        body: JSON.stringify({ transcript, visual_description: visual }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setScore(res);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }

  return (
    <div className="p-10 max-w-3xl">
      <h1 className="text-2xl font-bold">Spy</h1>
      <p className="text-neutral-400 text-sm mt-1">
        Paste a competitor ad URL + transcript → Claude scores hook, retention, CTA + extracts steal-this notes.
      </p>

      <div className="mt-6 space-y-4">
        <F label="Source URL (Facebook Ad Library, TikTok, IG…)">
          <input className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2 w-full"
            value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.facebook.com/ads/library/?id=…" />
        </F>
        <F label="Transcript (paste audio transcription)">
          <textarea className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2 w-full min-h-32"
            value={transcript} onChange={(e) => setTranscript(e.target.value)} />
        </F>
        <F label="Visual description (optional — what's on screen)">
          <textarea className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2 w-full min-h-20"
            value={visual} onChange={(e) => setVisual(e.target.value)} />
        </F>
        <button disabled={loading} onClick={analyze}
          className="bg-amber-500 hover:bg-amber-400 text-black px-5 py-2 rounded font-medium disabled:opacity-40">
          {loading ? "Scoring…" : "Score it"}
        </button>
        {error && <div className="text-rose-400 text-sm">{error}</div>}
      </div>

      {score && (
        <section className="mt-10 border border-neutral-800 rounded-xl p-6 space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <Pill label="Hook" v={score.hook_score} />
            <Pill label="Retention" v={score.retention_score} />
            <Pill label="CTA" v={score.cta_score} />
            <Pill label="Overall" v={score.overall} accent />
          </div>
          <div>
            <h3 className="text-xs uppercase text-neutral-500 mb-1">Why this score</h3>
            <ul className="list-disc list-inside text-sm space-y-1">
              {score.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
          <div>
            <h3 className="text-xs uppercase text-neutral-500 mb-1">Steal this</h3>
            <ul className="list-disc list-inside text-sm space-y-1 text-amber-300">
              {score.steal_this.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-neutral-400 block mb-1">{label}</span>
      {children}
    </label>
  );
}
function Pill({ label, v, accent }: { label: string; v: number; accent?: boolean }) {
  return (
    <div className={`rounded-lg p-3 text-center ${accent ? "bg-amber-500/20 border border-amber-500/40" : "bg-neutral-900 border border-neutral-800"}`}>
      <div className="text-xs text-neutral-400">{label}</div>
      <div className={`text-2xl font-bold ${accent ? "text-amber-300" : ""}`}>{v}/10</div>
    </div>
  );
}
