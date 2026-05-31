#!/usr/bin/env node
// Smoke test for the showcase sequence orchestrator.
// Usage:
//   BASE_URL=https://adlab-amber.vercel.app PRODUCT_URL=https://... \
//     node scripts/smoke-sequence.mjs "ring" 20
//
// Drives /api/showcase/sequence/start and then ticks
// /api/showcase/sequence/advance every 8s until done. Last step
// optionally calls /api/stitch on the produced clip URLs.

const base = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const productUrl =
  process.env.PRODUCT_URL ||
  "https://cdn.shopify.com/s/files/1/0648/1819/2826/files/montier_sample.jpg";
const productTitle = process.argv[2] || "Sample Jewelry";
const totalSec = parseInt(process.argv[3] || "20", 10);
const clipSec = parseInt(process.env.CLIP_SEC || "10", 10);

console.log(`[smoke-sequence] start  product="${productTitle}" totalSec=${totalSec} clipSec=${clipSec}`);

const startBody = {
  productTitle,
  productImageUrl: productUrl,
  hook: "Touch your neck once. People notice.",
  totalSec,
  clipSec,
};

const startRes = await fetch(`${base}/api/showcase/sequence/start`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(startBody),
});
const startText = await startRes.text();
console.log(`[smoke-sequence] start ${startRes.status}: ${startText.slice(0, 500)}`);
if (!startRes.ok) process.exit(1);
let state = JSON.parse(startText);

const deadline = Date.now() + 12 * 60_000;
while (state.stage === "running" && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 8000));
  const t0 = Date.now();
  const res = await fetch(`${base}/api/showcase/sequence/advance`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(state),
  });
  const text = await res.text();
  try { state = JSON.parse(text); } catch {
    console.error("[smoke-sequence] advance returned non-json:", text.slice(0, 300));
    process.exit(1);
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const activeIdx = state.clips.length - 1;
  const active = state.clips[activeIdx];
  console.log(
    `[smoke-sequence] clip ${activeIdx + 1}/${state.plannedClips} stage=${active?.stage} animateModel=${active?.animateModel || "-"} qualityScore=${active?.qualityScore ?? "-"} clipUrls=${state.clipUrls.length} +${elapsed}s`
  );
}

if (state.stage !== "done") {
  console.error(`[smoke-sequence] FAIL stage=${state.stage} error=${state.error || "timeout"}`);
  process.exit(1);
}
console.log("[smoke-sequence] sequence OK — clips:", state.clipUrls);

// Optional stitch step. Skip with STITCH=0.
if (process.env.STITCH !== "0" && state.clipUrls.length > 1) {
  console.log("[smoke-sequence] POST /api/stitch");
  const stitchRes = await fetch(`${base}/api/stitch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ urls: state.clipUrls, clipSeconds: clipSec }),
  });
  const stitchText = await stitchRes.text();
  console.log(`[smoke-sequence] stitch ${stitchRes.status}: ${stitchText.slice(0, 600)}`);
  if (!stitchRes.ok) process.exit(1);
  const stitchData = JSON.parse(stitchText);
  console.log("[smoke-sequence] FINAL:", stitchData.url, "tier:", stitchData.trace?.tier);
}
