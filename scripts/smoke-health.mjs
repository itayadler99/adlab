#!/usr/bin/env node
// Smoke test for /api/stitch/health.
// Confirms which fallback tiers are wired in the deployed environment.
//
// Usage:
//   BASE_URL=https://adlab-amber.vercel.app node scripts/smoke-health.mjs
//
// Exit codes:
//   0 — at least one tier reachable (autopilot can run).
//   1 — service down / no tier reachable.

const base = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const res = await fetch(`${base}/api/stitch/health`);
const text = await res.text();
console.log(`[smoke-health] ${res.status} from ${base}/api/stitch/health`);
console.log(text);
if (!res.ok) {
  console.error("[smoke-health] FAIL — service unreachable or no tier wired");
  process.exit(1);
}
const data = JSON.parse(text);
if (!data.reachable) {
  console.error("[smoke-health] FAIL — every stitch tier is down");
  process.exit(1);
}
const tiers = [];
if (data.health.fal.configured) tiers.push("fal");
if (data.health.replicate.configured) tiers.push("replicate");
if (data.health.ffmpegStatic.available && data.health.blob.configured) tiers.push("ffmpeg-static+blob");
console.log("[smoke-health] OK — tiers wired:", tiers.join(", "));
