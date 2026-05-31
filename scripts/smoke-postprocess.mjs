#!/usr/bin/env node
// Smoke test for /api/postprocess.
// Usage:
//   BASE_URL=https://adlab-amber.vercel.app node scripts/smoke-postprocess.mjs [url] [level]
//
// Default video: a 1080p public Google sample. Default level: "fast".

const DEFAULT_URL =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4";

const url = process.argv[2] || DEFAULT_URL;
const level = process.argv[3] || "fast";
const base = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");

console.log(`[smoke-postprocess] POST ${base}/api/postprocess level=${level}`);
const t0 = Date.now();
const res = await fetch(`${base}/api/postprocess`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ url, level }),
});
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
const text = await res.text();
console.log(`[smoke-postprocess] ${res.status} in ${elapsed}s:`);
console.log(text.length > 1500 ? text.slice(0, 1500) + "..." : text);
if (!res.ok) process.exit(1);
const data = JSON.parse(text);
if (!data.url) {
  console.error("[smoke-postprocess] no url in response");
  process.exit(1);
}
console.log("[smoke-postprocess] OK — out:", data.url);
console.log("  trace:", JSON.stringify(data.trace));
