import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNicolaPrompt, assertNoBuzzwords, buildVeoJson } from "../nicola-prompt.ts";
import { runQualityGate } from "../quality-gate.ts";

const goodBlocks = {
  aspect: "9:16" as const,
  shot: "cinematic close-up" as const,
  subject: "Israeli male cyclist, 32",
  wardrobe: "black sun sleeves, neon green helmet",
  cameraPosition: "camera pushed extremely close to the face",
  frameEdges: "helmet rim cropping the top of the frame",
  atmosphere: "sweat droplets, fine road dust, condensation on sunglasses",
  lighting: "golden-hour sunlight cutting across",
  dualTone: "warm rim light with cool blue shadow reflections",
  lens: "85mm f/1.4" as const,
};

test("buildNicolaPrompt assembles 14 blocks in order", () => {
  const p = buildNicolaPrompt(goodBlocks);
  assert.match(p, /Ultra-photorealistic RAW/);
  assert.match(p, /9:16 cinematic close-up/);
  assert.match(p, /85mm f\/1\.4/);
  assert.match(p, /no text\.$/);
});

test("buildNicolaPrompt rejects generic subject", () => {
  assert.throws(() => buildNicolaPrompt({ ...goodBlocks, subject: "a person" }), /too generic/);
});

test("assertNoBuzzwords throws on banned terms", () => {
  assert.throws(() => assertNoBuzzwords("masterpiece, 8k, stunning"), /buzzword/);
});

test("runQualityGate fails on missing lens", () => {
  const r = runQualityGate({
    prompt: "Ultra-photorealistic RAW 9:16 cinematic close-up of Israeli cyclist, no text, shallow depth of field, sweat dust condensation ice particles reflections, warm golden cool blue dual tone. ".repeat(2),
    mode: "t2i",
    platform: "ig_reel",
    isRealProduct: false,
    aspect: "9:16",
  });
  assert.equal(r.ok, false);
  assert.ok(r.failures.some((f) => f.includes("lens")));
});

test("runQualityGate blocks t2v on real product", () => {
  const r = runQualityGate({
    prompt: "Ultra-photorealistic RAW 9:16 hero wide of Israeli model 85mm, shallow depth of field, sweat dust condensation ice reflections, warm golden cool blue, no text. ".repeat(3),
    mode: "t2v",
    platform: "ig_reel",
    isRealProduct: true,
    aspect: "9:16",
  });
  assert.equal(r.ok, false);
  assert.ok(r.failures.some((f) => f.includes("switch to i2v")));
});

test("runQualityGate rejects Hebrew in prompt", () => {
  const r = runQualityGate({
    prompt: "Israeli cyclist 85mm shallow depth of field sweat dust condensation ice reflections warm golden cool blue no text ".repeat(2) + "אריזה",
    mode: "t2i",
    platform: "ig_reel",
    isRealProduct: false,
    aspect: "9:16",
  });
  assert.equal(r.ok, false);
  assert.ok(r.failures.some((f) => f.includes("Hebrew")));
});

test("buildVeoJson sets ≤8s duration + brand_safe", () => {
  const j = buildVeoJson({
    brand: "Montier",
    brandValues: ["craft", "warmth", "premium"],
    concept: "Jewelry box opens, chain bursts out, snaps into place",
    description: "Photorealistic cinematic shot of a velvet box on marble. A sealed Montier-branded box wiggles then bursts open in a gold shimmer releasing a moissanite chain that snaps precisely into place. No text.",
    colors: ["champagne", "ivory", "deep onyx"],
    materials: ["velvet", "polished marble"],
    environment: "minimalist marble showroom",
    setting: "marble pedestal in soft studio light",
    subject: "Montier velvet jewelry box",
    beats: ["00-02s: box settles on marble", "02-05s: lid bursts open with gold shimmer", "05-08s: chain snaps into hovering arc"],
    accentColor: "warm champagne gold",
    motion: "box wiggles, lid pops, chain bursts out, snaps into final arc",
    mood: "warm champagne",
    niche: "jewelry",
  });
  const out = j.output as Record<string, unknown>;
  assert.equal(out.duration_seconds, 8);
  assert.equal(out.safety, "brand_safe");
});
