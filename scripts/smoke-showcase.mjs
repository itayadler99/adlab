#!/usr/bin/env node
// Smoke test for the showcase pipeline.
// Usage:
//   BASE_URL=https://adlab-amber.vercel.app PRODUCT_URL=https://... \
//     node scripts/smoke-showcase.mjs "moissanite tennis chain"
//
// Polls /api/showcase/advance every 5s until done or 5 minutes elapse.
// Prints which animate model produced the final clip + quality score.

const base = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const productUrl =
  process.env.PRODUCT_URL ||
  // Default to a known-good public Shopify CDN image (Montier sample).
  "https://cdn.shopify.com/s/files/1/0648/1819/2826/files/montier_sample.jpg";
const productTitle = process.argv[2] || "Sample Jewelry Piece";

const start = {
  productTitle,
  productImageUrl: productUrl,
  hook: "Touch your neck once. People notice.",
  durationSec: 10,
};

console.log("[smoke-showcase] POST /api/showcase/start");
const startRes = await fetch(`${base}/api/showcase/start`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(start),
});
const startText = await startRes.text();
console.log(`[smoke-showcase] start ${startRes.status}: ${startText.slice(0, 400)}`);
if (!startRes.ok) process.exit(1);
let state = JSON.parse(startText);

const deadline = Date.now() + 5 * 60_000;
while (state.stage !== "done" && state.stage !== "failed" && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 5000));
  const t0 = Date.now();
  const res = await fetch(`${base}/api/showcase/advance`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(state),
  });
  const text = await res.text();
  try { state = JSON.parse(text); } catch {
    console.error("[smoke-showcase] advance returned non-json:", text.slice(0, 300));
    process.exit(1);
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `[smoke-showcase] stage=${state.stage} model=${state.animateModel || "-"} elapsed=${elapsed}s hero=${!!state.artifacts?.heroImageUrl} video=${!!state.artifacts?.videoUrl}`
  );
}

if (state.stage === "done") {
  console.log("[smoke-showcase] OK");
  console.log("  video:", state.artifacts.videoUrl);
  console.log("  model:", state.animateModel);
  console.log("  quality:", state.qualityScore, "reasons:", (state.qualityReasons || []).join(" · "));
  process.exit(0);
}
console.error("[smoke-showcase] FAIL stage=" + state.stage + " error=" + (state.error || "timeout"));
process.exit(1);
