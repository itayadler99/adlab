# Phase 8 — V3 Ultra: One Platform, Every Competitor's Best Feature

Autonomous cloud task. ~11h wall time. Ship each phase as its own commit + push to main + STATUS_PHASE8.md line. Owner asleep — no questions, no blocks, use fallbacks.

**Mission:** AdLab V3 = Arcads-grade actors + Speel-grade realism + Submagic-grade captions + Higgsfield virality gate + closed Meta ROAS feedback loop + Hebrew-first RTL + one-click 5-variant fan-out + direct Meta campaign launch — all in one Vercel app.

**Current state (already shipped):** V2 6 phases + Phase 7 (nano-banana text fix, ElevenLabs v3, sync-labs/lipsync-2). Vercel Blob provisioned. FAL + Replicate + Anthropic + Meta MCP keys live.

---

## P1 — Brand Kit (1h)

Files: `lib/brand-kit.ts` (new), `app/api/brand-kit/route.ts` (new), `supabase/migrations/v3_brand_kits.sql` (new), inject into `lib/autopilot.ts` + `lib/postprocess.ts` (logo overlay ffmpeg).

Schema: `brand_kits(store_id, logo_url, primary_hex, secondary_hex, font_family, font_url, voice_id)`.

Accept: every ad pulls active kit, logo bottom-right 8% width, color tint via ffmpeg curves toward brand primary.

Fallback if Supabase blocked: hard-code defaults in `lib/stores.ts` keyed by store_id; ship without UI.

**Commit:** `feat(brand): brand kit persistence — logo + colors + font + voice injected across pipeline`

---

## P2 — Multi-variant fan-out (1.5h)

Files: `lib/variants.ts` (new), `app/api/generate/variants/route.ts` (new), `app/autopilot/page.tsx` (grid view), `lib/anthropic.ts` (hook-variant generator).

Logic: Claude generates 5 hooks for one script. Fan out 5 parallel `runUgc()`/`runShowcase()`. Reuse composite + actor stage. Only re-TTS + re-lipsync the hook. Cost ≈ 1.4× single ad.

Accept: one click → 5 stitched MP4s in <8min. Grid view side-by-side.

Fallback: `p-limit(3)` if FAL/Replicate rate-limits; cap at 3 variants.

**Commit:** `feat(variants): one-click 5-hook fan-out with stage reuse`

---

## P3 — Higgsfield MCP + Soul ID actor library (1.5h) ⭐ BIGGEST MOAT

Files: `lib/higgsfield.ts` (new — REST direct, MCP schema only for reference), `app/api/souls/library/route.ts`, wire `components/SoulIdPickerConnected.tsx`, `lib/ugc.ts` actor stage: if `soulId` provided skip flux-pro, pull pre-trained character.

Plus: `virality_predictor` MCP gate pre-launch — score <40 → regenerate hook automatically.

Accept: 3 Soul IDs trainable from real photos, picker shows them in `/autopilot`, UGC uses Soul ID, virality gate blocks weak hooks.

Fallback: if MCP unreachable from Vercel functions, store outputs in Supabase as static actor refs (saved-actor feature, no live retrain).

**Commit:** `feat(souls): Higgsfield Soul ID library + virality_predictor pre-launch gate`

---

## P4 — Captions burn-in with bouncing words (1.5h)

Files: `lib/captions.ts` (new — word-timestamps from existing `/api/transcribe`, build .ass file with `\fad` + `\t` bouncing tags), `lib/postprocess.ts` add `burnCaptions(url, ass)`, `app/api/postprocess/route.ts` accept `captions: {enabled, style}`.

Use libass (NOT drawtext). RTL-aware for Hebrew VO. Off by default, on for UGC mode.

Accept: word-by-word yellow-pop captions, Hebrew RTL works, optional per generation.

Fallback: sentence-level subs via FAL whisper if word-level timing fails.

**Commit:** `feat(captions): libass word-by-word burn-in with RTL Hebrew support`

---

## P5 — Music bed library (1h)

Files: `lib/music.ts` (new), `public/music/{jewelry,sneakers,saas}/*.mp3` (5 royalty-free tracks/vertical, commit them), `lib/postprocess.ts` add sidechain duck: `[1:a]sidechaincompress=threshold=0.05:ratio=8[duck]`.

Accept: final MP4 has music ducked under VO. Vertical auto-picked from store metadata.

Fallback: one universal track if vertical missing.

**Commit:** `feat(music): per-vertical music bed library + sidechain duck under VO`

---

## P6 — Real-time preview stream (1.5h)

Files: `app/api/generate/stream/route.ts` (SSE), `hooks/useGenerationStream.ts`, replace polling in `app/autopilot/page.tsx`, `lib/ugc.ts` + `lib/showcase.ts` emit per-stage thumbnails to Blob.

Accept: each stage finishes → thumbnail appears in UI within 2s.

Fallback: keep 2s poll, just add per-stage thumbnail.

**Commit:** `feat(stream): SSE generation stream with per-stage thumbnail preview`

---

## P7 — Performance feedback loop (1.5h) ⭐ NO COMPETITOR HAS THIS

Files: `lib/performance-bias.ts` (new), `app/api/cron/learn/route.ts` (daily cron), `supabase/migrations/v3_variant_perf.sql` (`variant_perf(variant_id, hook_archetype, actor_archetype, vertical, ctr, roas)`), `lib/anthropic.ts` prepend top-3 winning archetypes per vertical.

Accept: daily cron pulls Meta insights last 30d → computes per-archetype ROAS → next `generateScript()` biases toward winners. Winner badges in `/abtest`.

Fallback: manual "Mark as winner" button writes to same table.

**Commit:** `feat(learn): Meta ROAS feedback loop biases next-gen prompts toward winning archetypes`

---

## P8 — RTL Hebrew UX + Captions Mirage premium routing (1.5h)

Files: `app/layout.tsx` (`dir="rtl"`, Heebo font), `app/globals.css` (logical properties), `app/autopilot/page.tsx` + `app/generate/page.tsx` he-IL labels, `lib/captions-mirage.ts` (new — POST to Captions API when `mode=premium`).

Accept: app reads RTL in Hebrew. English admin flips via `<html lang dir>`. Premium toggle routes whole UGC to Mirage (bypass our 5-stage), returns single MP4.

Fallback: Mirage behind feature flag; RTL ships standalone.

**Commit:** `feat(rtl,premium): Hebrew-first RTL UX + Captions Mirage premium routing`

---

## Post-processing pipeline upgrade (folded into existing `lib/postprocess.ts`)

Replace current order with the 2026-correct chain:

```
1. interp (RIFE v4.6 fal, multiplier=2 → 48fps, NOT 60)
2. upscale-restore (Topaz Astra v2, creativity=2 sharpness=3, 1080→1080)
3. LUT (Apple Log → Rec709, IWLTBAP free pack)
4. unsharp=3:3:0.6:3:3:0.0  (luma only, NOT 5:5:1.0)
5. noise=c0s=8:c0f=t+u  (luma-only temporal grain; daylight=6-8, night=12)
6. halation pass (golden hour scenes only — see ffmpeg blend recipe)
7. shake (sine-driven sub-pixel drift via zoompan + rotate, NOT vidstab)
8. audio mix: room tone via ElevenLabs SFX at -42dB under VO
9. dialogue EQ: 200Hz -3, 4kHz -2.5 (Q=1.4), 8kHz +1.5, comp 3:1 -18dB threshold
10. encode: libx264 CRF 20 (NOT 23), 192k AAC, loudnorm -14 LUFS, +faststart
11. C2PA strip: exiftool -all= + ffmpeg -map_metadata -1
```

48fps > 60fps (60 hits soap-opera uncanny). Grain BEFORE shake (shake stretches grain texture = baked-in look). LUT BEFORE grain (never grade graded grain).

**Commit:** `feat(postprocess): 2026-correct pipeline order — interp→upscale→LUT→unsharp→grain→shake→audio→encode→C2PA strip`

---

## Acceptance per phase

After EACH commit:
- `npx tsc --noEmit` passes
- `npm run build` succeeds
- Push to main
- Append to `STATUS.md` under `## Phase 8` heading

## Final step

After all phases pushed, write `STATUS_PHASE8.md`:
1. All commits with SHAs
2. Model IDs/endpoints adjusted
3. Blockers in `BLOCKERS.md` (Supabase migrations, Higgsfield REST quirks, etc.)
4. Smoke-test instructions per phase

## DO NOT

- Don't break V2 or Phase 7 pipelines — all new paths additive behind feature flags (`brandKit?`, `variants?`, `soulId?`, `captions?`, `music?`, `premium?`)
- Don't duplicate ffmpeg-static binary across routes — keep in single shared `lib/postprocess.ts`
- Don't refactor unrelated code
- Don't add env vars without documenting in `BLOCKERS.md` with `vercel env add` commands
- Don't call Higgsfield MCP from Vercel functions if it fails — switch to direct REST with stored API key
