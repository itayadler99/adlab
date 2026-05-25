"use client";
import { useEffect, useState } from "react";

type Product = { id: number; title: string; handle: string; image?: { src: string } };
type Script = { script: string; visual_prompt: string; cta: string };
type VideoJob = { id: string; status: string; output?: string | string[]; error?: string };

export default function GeneratePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState<number | "">("");
  const [style, setStyle] = useState<"yapping" | "founder_pov" | "ugc_review" | "demo">("yapping");
  const [duration, setDuration] = useState<15 | 30 | 45>(15);
  const [model, setModel] = useState<"kling-1.6" | "veo-3" | "seedance-1.0-pro">("kling-1.6");
  const [script, setScript] = useState<Script | null>(null);
  const [job, setJob] = useState<VideoJob | null>(null);
  const [loading, setLoading] = useState<"" | "script" | "video">("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((d) => setProducts(d.products || []))
      .catch(() => setError("Could not load products. Check SHOPIFY env vars."));
  }, []);

  // Poll video job
  useEffect(() => {
    if (!job || job.status === "succeeded" || job.status === "failed") return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/poll?id=${job.id}`).then((x) => x.json());
      setJob(r);
    }, 4000);
    return () => clearInterval(t);
  }, [job?.id, job?.status]);

  async function generateScript() {
    setLoading("script");
    setError("");
    setScript(null);
    setJob(null);
    try {
      const product = products.find((p) => p.id === productId);
      const res = await fetch("/api/generate/script", {
        method: "POST",
        body: JSON.stringify({
          productTitle: product?.title,
          productImageUrl: product?.image?.src,
          style,
          duration,
        }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setScript(res);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading("");
  }

  async function generateVideo() {
    if (!script) return;
    setLoading("video");
    setError("");
    try {
      const res = await fetch("/api/generate/video", {
        method: "POST",
        body: JSON.stringify({
          prompt: script.visual_prompt,
          duration: duration > 15 ? 10 : duration,
          model,
        }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setJob(res);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading("");
  }

  const videoUrl = Array.isArray(job?.output) ? job?.output[0] : job?.output;

  return (
    <div className="p-10 max-w-3xl">
      <h1 className="text-2xl font-bold">Generate</h1>
      <p className="text-neutral-400 mt-1 text-sm">
        Pick a product → Claude writes the script → Replicate renders the video.
      </p>

      <div className="mt-8 space-y-4">
        <Field label="Product">
          <select
            className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2 w-full"
            value={productId}
            onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">— choose —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Style">
            <select className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2 w-full"
              value={style} onChange={(e) => setStyle(e.target.value as any)}>
              <option value="yapping">Yapping</option>
              <option value="founder_pov">Founder POV</option>
              <option value="ugc_review">UGC review</option>
              <option value="demo">Demo</option>
            </select>
          </Field>
          <Field label="Duration">
            <select className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2 w-full"
              value={duration} onChange={(e) => setDuration(Number(e.target.value) as any)}>
              <option value={15}>15s</option>
              <option value={30}>30s</option>
              <option value={45}>45s</option>
            </select>
          </Field>
          <Field label="Video model">
            <select className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2 w-full"
              value={model} onChange={(e) => setModel(e.target.value as any)}>
              <option value="kling-1.6">Kling 1.6 Pro</option>
              <option value="veo-3">Veo 3</option>
              <option value="seedance-1.0-pro">Seedance 1 Pro</option>
            </select>
          </Field>
        </div>

        <button
          disabled={!productId || loading === "script"}
          onClick={generateScript}
          className="bg-fuchsia-500 hover:bg-fuchsia-400 text-white px-5 py-2 rounded font-medium disabled:opacity-40"
        >
          {loading === "script" ? "Writing…" : "1. Write script"}
        </button>
      </div>

      {error && <div className="mt-6 text-rose-400 text-sm">{error}</div>}

      {script && (
        <section className="mt-10 border border-neutral-800 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold">Script</h2>
          <Box label="Dialogue" body={script.script} />
          <Box label="Visual prompt" body={script.visual_prompt} />
          <Box label="CTA" body={script.cta} />
          <button
            disabled={loading === "video" || !!job}
            onClick={generateVideo}
            className="bg-emerald-500 hover:bg-emerald-400 text-black px-5 py-2 rounded font-medium disabled:opacity-40"
          >
            {loading === "video" ? "Submitting…" : "2. Render video"}
          </button>
        </section>
      )}

      {job && (
        <section className="mt-6 border border-neutral-800 rounded-xl p-6">
          <div className="text-sm">
            Job <code className="text-neutral-400">{job.id}</code> · status:{" "}
            <span className={job.status === "succeeded" ? "text-emerald-400" :
              job.status === "failed" ? "text-rose-400" : "text-amber-400"}>
              {job.status}
            </span>
          </div>
          {job.error && <div className="text-rose-400 mt-2 text-sm">{job.error}</div>}
          {videoUrl && (
            <div className="mt-4">
              <video src={videoUrl} controls className="w-full rounded-lg" />
              <a href={videoUrl} download className="text-fuchsia-400 underline text-sm mt-2 inline-block">
                Download
              </a>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-neutral-400 block mb-1">{label}</span>
      {children}
    </label>
  );
}

function Box({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <pre className="text-sm whitespace-pre-wrap mt-1 text-neutral-200">{body}</pre>
    </div>
  );
}
