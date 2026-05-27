#!/usr/bin/env node
// Smoke test for the stitch fallback chain.
// Usage:
//   node scripts/smoke-stitch.mjs [url1] [url2] ...
// or against a deployed app:
//   BASE_URL=https://adlab-amber.vercel.app node scripts/smoke-stitch.mjs
//
// With no urls, uses two known-good Google-hosted sample MP4s.

const DEFAULT_URLS = [
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
];

const urls = process.argv.slice(2).filter((a) => /^https?:\/\//.test(a));
const payload = { urls: urls.length ? urls : DEFAULT_URLS, clipSeconds: 8 };

const base = process.env.BASE_URL || "http://localhost:3000";
const url = `${base.replace(/\/$/, "")}/api/stitch`;

console.log("[smoke] POST", url, "urls:", payload.urls.length);
const t0 = Date.now();
const res = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload),
});
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
const text = await res.text();
console.log(`[smoke] ${res.status} in ${elapsed}s:`);
console.log(text.length > 2000 ? text.slice(0, 2000) + "..." : text);
if (!res.ok) process.exit(1);
let data;
try { data = JSON.parse(text); } catch { process.exit(1); }
if (!data.url) {
  console.error("[smoke] no url in response");
  process.exit(1);
}
console.log("[smoke] OK — tier:", data.trace?.tier, "url:", data.url);
