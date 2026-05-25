"use client";
import { useState } from "react";

export default function LaunchPage() {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("AdLab — Test campaign");
  const [videoUrl, setVideoUrl] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("https://montierjewelry.com");
  const [pageId, setPageId] = useState(process.env.NEXT_PUBLIC_DEFAULT_PAGE_ID || "");
  const [pixelId, setPixelId] = useState(process.env.NEXT_PUBLIC_DEFAULT_PIXEL_ID || "");
  const [dailyBudget, setDailyBudget] = useState(20);
  const [countries, setCountries] = useState("US");
  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(45);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  async function launch() {
    setSubmitting(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/launch", {
        method: "POST",
        body: JSON.stringify({
          name, video_url: videoUrl, thumbnail_url: thumbnailUrl, message, link,
          page_id: pageId, pixel_id: pixelId,
          daily_budget: dailyBudget,
          countries: countries.split(",").map((s) => s.trim()).filter(Boolean),
          age_min: ageMin, age_max: ageMax,
        }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setResult(res);
    } catch (e: any) {
      setError(e.message);
    }
    setSubmitting(false);
  }

  return (
    <div className="p-10 max-w-3xl">
      <h1 className="text-2xl font-bold">Launch</h1>
      <p className="text-neutral-400 text-sm mt-1">
        Build a paused Meta campaign (campaign + adset + ad) in one click. Activate later in Ads Manager.
      </p>

      <div className="flex gap-2 mt-6 mb-8">
        {["Creative", "Targeting", "Review"].map((s, i) => (
          <button key={s} onClick={() => setStep(i + 1)}
            className={`px-3 py-1.5 rounded text-sm ${
              step === i + 1 ? "bg-emerald-500 text-black" : "bg-neutral-800 text-neutral-300"
            }`}>
            {i + 1}. {s}
          </button>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <F label="Campaign name"><I value={name} onChange={setName} /></F>
          <F label="Video URL (hosted MP4)"><I value={videoUrl} onChange={setVideoUrl} placeholder="https://…/clip.mp4" /></F>
          <F label="Thumbnail URL"><I value={thumbnailUrl} onChange={setThumbnailUrl} placeholder="https://…/thumb.jpg" /></F>
          <F label="Ad primary text"><textarea
            className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2 w-full min-h-24"
            value={message} onChange={(e) => setMessage(e.target.value)} /></F>
          <F label="Landing URL"><I value={link} onChange={setLink} /></F>
          <button onClick={() => setStep(2)} className="bg-emerald-500 text-black px-5 py-2 rounded font-medium">Next →</button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <F label="Facebook Page ID"><I value={pageId} onChange={setPageId} /></F>
          <F label="Pixel ID (for purchase optimization)"><I value={pixelId} onChange={setPixelId} /></F>
          <F label="Daily budget ($)">
            <input type="number" className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2 w-full"
              value={dailyBudget} onChange={(e) => setDailyBudget(Number(e.target.value))} />
          </F>
          <F label="Countries (comma separated)"><I value={countries} onChange={setCountries} /></F>
          <div className="grid grid-cols-2 gap-3">
            <F label="Min age">
              <input type="number" className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2 w-full"
                value={ageMin} onChange={(e) => setAgeMin(Number(e.target.value))} />
            </F>
            <F label="Max age">
              <input type="number" className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2 w-full"
                value={ageMax} onChange={(e) => setAgeMax(Number(e.target.value))} />
            </F>
          </div>
          <button onClick={() => setStep(3)} className="bg-emerald-500 text-black px-5 py-2 rounded font-medium">Review →</button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <pre className="bg-neutral-900 border border-neutral-800 rounded p-4 text-xs overflow-auto">
{JSON.stringify({ name, videoUrl, thumbnailUrl, message, link, pageId, pixelId, dailyBudget, countries, ageMin, ageMax }, null, 2)}
          </pre>
          <button disabled={submitting} onClick={launch}
            className="bg-fuchsia-500 hover:bg-fuchsia-400 text-white px-6 py-3 rounded font-medium disabled:opacity-40">
            {submitting ? "Launching…" : "🚀 Launch (paused)"}
          </button>
          {error && <div className="text-rose-400 text-sm">{error}</div>}
          {result && (
            <pre className="bg-neutral-900 border border-emerald-700 rounded p-4 text-xs overflow-auto">
{JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
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
function I({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2 w-full"
      value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  );
}
