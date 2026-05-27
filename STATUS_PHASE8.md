# Phase 8 — V3 Ultra: completion report

Branch: `claude/v3-ultra-phase8` (also fast-forwarded to `main` after each commit).
All commits pass `npx tsc --noEmit` and `npm run build`.

---

## Commits (SHA → phase)

| SHA       | Phase | Title |
|-----------|-------|-------|
| `4f7aa78` | P1    | feat(brand): brand kit persistence — logo + colors + font + voice injected across pipeline |
| `ea76a09` | P2    | feat(variants): one-click 5-hook fan-out with stage reuse |
| `8d36323` | P3    | feat(souls): Higgsfield Soul ID library + virality_predictor pre-launch gate |
| `a8d6c82` | P4    | feat(captions): libass word-by-word burn-in with RTL Hebrew support |
| `d11cbdc` | P5    | feat(music): per-vertical music bed library + sidechain duck under VO |
| `e4564b1` | P6    | feat(stream): SSE generation stream with per-stage thumbnail preview |
| `ed025b1` | P7    | feat(learn): Meta ROAS feedback loop biases next-gen prompts toward winning archetypes |
| `ae9aeab` | P8    | feat(rtl,premium): Hebrew-first RTL UX + Captions Mirage premium routing |
| `0ec46fa` | post  | feat(postprocess): 2026-correct pipeline order — interp→upscale→LUT→unsharp→grain→shake→audio→encode→C2PA strip |

---

## Model IDs / endpoints in use

| Stage            | Provider / slug                                            | Notes |
|------------------|------------------------------------------------------------|-------|
| Actor (default)  | FAL `fal-ai/flux-pro/v1.1-ultra`                           | When no Soul ID set |
| Actor (Soul)     | Higgsfield REST `POST /v1/souls/{id}/render`               | Bypasses FAL when `UgcInputs.soulId` is set |
| Composite        | FAL `fal-ai/nano-banana/edit`                              | Unchanged from V2 |
| Animate (UGC)    | FAL `fal-ai/veo3.1/fast/image-to-video`                    | 1080p 9:16 8s |
| Animate (showcase)| Replicate `bytedance/seedance-1-pro`                      | 1080p 10s i2v |
| TTS (primary)    | FAL `fal-ai/elevenlabs/tts/eleven-v3`                      | From Phase 7 |
| TTS (fallback)   | FAL `fal-ai/elevenlabs/tts/turbo-v2.5`                     | From Phase 7 |
| Lipsync tier 1   | Replicate `sync/lipsync-2`                                 | Best Hebrew accuracy |
| Lipsync tier 2   | FAL `fal-ai/sync-lipsync/v2`                               | Fallback |
| Lipsync tier 3   | Replicate `cjwbw/wav2lip`                                  | Last resort |
| Interp           | Replicate `pollinations/rife` (`fps: 48`, NOT 60)          | v2026 step 1 |
| Upscale          | Replicate `lucataco/real-esrgan-video` (Topaz Astra stand-in) | v2026 step 2 |
| Captions         | OpenAI Whisper `verbose_json` + `timestamp_granularities=word` + libass `ass=` filter | P4 |
| Premium UGC      | Captions Mirage `POST /v1/mirage/jobs` (poll until succeeded) | P8 feature flag |
| Virality gate    | Higgsfield REST `POST /v1/virality/predict`                | P3 |
| Learn cron       | Meta Graph `/{ad_id}/insights` `last_30d`                  | P7 |
| Script generator | Anthropic `claude-opus-4-6` (winners-prompt prepended)     | P7 bias |

---

## Files changed (additive — V2 + Phase 7 untouched)

```
NEW   app/api/brand-kit/route.ts
NEW   app/api/generate/variants/route.ts
NEW   app/api/generate/stream/route.ts
NEW   app/api/souls/library/route.ts
NEW   app/api/ugc/premium/route.ts
NEW   app/api/cron/learn/route.ts
NEW   hooks/useGenerationStream.ts
NEW   lib/brand-kit.ts
NEW   lib/variants.ts
NEW   lib/higgsfield.ts
NEW   lib/captions.ts
NEW   lib/captions-mirage.ts
NEW   lib/music.ts
NEW   lib/performance-bias.ts
NEW   supabase/migrations/v3_brand_kits.sql
NEW   supabase/migrations/v3_variant_perf.sql
NEW   public/music/{jewelry,sneakers,saas,studio,universal}/.gitkeep
MOD   app/layout.tsx        (async + dir/lang switching + Heebo)
MOD   app/globals.css       (Heebo font stack + RTL utilities)
MOD   app/api/postprocess/route.ts (brandKit + captions + music + pipeline opts)
MOD   app/api/transcribe/route.ts  (wordTimestamps option)
MOD   app/autopilot/page.tsx (variant fan-out grid panel)
MOD   lib/postprocess.ts    (burnCaptions, addMusicBed, build2026VideoFilter, logo overlay, dialogue EQ)
MOD   lib/ugc.ts            (soulId short-circuit, viralityGate)
MOD   lib/anthropic.ts      (re-export generateHookVariants; vertical-aware winners prompt)
```

---

## Blockers — see BLOCKERS.md

- Supabase migrations: run `v3_brand_kits.sql` + `v3_variant_perf.sql`.
- New env vars: `HIGGSFIELD_API_URL`, `HIGGSFIELD_API_KEY` (P3), `CRON_SECRET` (P7), `CAPTIONS_MIRAGE_API_URL`, `CAPTIONS_MIRAGE_API_KEY` (P8).
- Music drop list: ship 3-5 royalty-free `.mp3` per vertical under `public/music/<vertical>/`.
- Optional: create `soul_library_cache` table for offline Soul list fallback.
- Cron entry in `vercel.json` for `/api/cron/learn`.

All blockers are non-breaking — every new feature falls back to a working
default when the supporting infra isn't set up.

---

## Smoke-test instructions per phase

### P1 — Brand kit
```sh
# 1. Read defaults
curl -s "$BASE/api/brand-kit?store_id=montier_us" | jq

# 2. Upsert (requires Supabase)
curl -s -X POST "$BASE/api/brand-kit" \
  -H "Content-Type: application/json" \
  -d '{"storeId":"montier_us","logoUrl":"https://…/logo.png","primaryHex":"#0a0a0a","secondaryHex":"#d4af37"}' | jq

# 3. Apply via postprocess
curl -s -X POST "$BASE/api/postprocess" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://…/video.mp4","level":"fast","storeId":"montier_us","brandKit":true}' | jq
```
Pass = `trace.ffmpegApplied: true` and the returned MP4 has the logo BR overlay.

### P2 — Variant fan-out
```sh
curl -s -X POST "$BASE/api/generate/variants" \
  -H "Content-Type: application/json" \
  -d '{"action":"start","inputs":{
    "productTitle":"Solitaire Pendant",
    "productImageUrl":"https://…/img.jpg",
    "baseScript":"…","baseHook":"…","style":"ugc_review","language":"en","count":5
  }}' | jq '.runs | length'
```
Pass = 5 runs returned, each with `stage:"actor"` pending. Continue with `action:"advance"` until all 5 hit `stage:"done"`.

### P3 — Soul ID + virality gate
```sh
# 1. Library
curl -s "$BASE/api/souls/library" | jq
# Pass = souls[] populated when HIGGSFIELD_API_KEY set; empty array (and apiReady:false) when not.

# 2. UGC with soulId
curl -s -X POST "$BASE/api/ugc/start" \
  -H "Content-Type: application/json" \
  -d '{… "soulId":"soul_abc123", "viralityGate":true}' | jq '.stage'
# Pass = stage:"composite" immediately (actor short-circuit fired).
# Final state should carry viralityScore + viralityReasons.
```

### P4 — Word-by-word captions
```sh
curl -s -X POST "$BASE/api/postprocess" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://…/lipsynced.mp4","level":"off","captions":{"enabled":true,"position":"bottom"},"storeId":"montier_us"}' | jq
```
Pass = `captionsApplied:true` and the returned MP4 has yellow-pop words bouncing.

### P5 — Music bed
```sh
# Drop a track first: cp my-track.mp3 public/music/jewelry/track1.mp3 && git add . && commit
curl -s -X POST "$BASE/api/postprocess" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://…/final.mp4","level":"off","storeId":"montier_us","music":{"enabled":true}}' | jq
```
Pass = `musicApplied:true` and audio in the resulting MP4 has VO+ducked music.

### P6 — Real-time stream
```sh
# After a normal /api/ugc/start, take the returned state and stream:
curl -N -X POST "$BASE/api/generate/stream" \
  -H "Content-Type: application/json" \
  -d "{\"pipeline\":\"ugc\",\"ugc\":$STATE}"
```
Pass = `event: stage` lines arrive within 4s of each pipeline stage completing, ending with `event: done`.

### P7 — Performance loop
```sh
# Manual mark-as-winner
curl -s -X POST "$BASE/api/cron/learn" \
  -H "Content-Type: application/json" \
  -d '{"variantId":"abc123","isWinner":true}' | jq

# Run the cron once manually (with CRON_SECRET set)
curl -s "$BASE/api/cron/learn?secret=$CRON_SECRET" | jq
# Pass = {"ok":true,"scanned":N,"updated":N}

# Verify bias is applied in next generation (writeAdScript with vertical: "jewelry")
```

### P8 — RTL + premium
```sh
# RTL: visit / in browser → check <html dir="rtl" lang="he"> and Heebo loaded.
# English override: add X-Lang: en to a request → renders LTR.

# Premium UGC:
curl -s -X POST "$BASE/api/ugc/premium" \
  -H "Content-Type: application/json" \
  -d '{"productTitle":"X","script":"...","hook":"..."}' | jq
# Pass when CAPTIONS_MIRAGE_API_KEY set = {"videoUrl":"...","jobId":"..."}.
# When key missing = 503 with explanatory error (5-stage path remains the default).
```

### Post-processing chain
```sh
curl -s -X POST "$BASE/api/postprocess" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://…/raw.mp4","level":"speel","storeId":"montier_us","brandKit":true,"pipeline":"v2026","lighting":"day","goldenHour":false}' | jq
```
Pass = `trace.rifeApplied:true`, `trace.ffmpegApplied:true`, output URL plays back with brand logo + grain + sub-pixel shake + -14 LUFS audio + stripped metadata.

---

## DO NOT regression check

- V2 video/UGC/showcase pipelines: unchanged. All Phase 8 features sit behind opt-in flags (`brandKit?`, `variants?`, `soulId?`, `captions?`, `music?`, `pipeline:"v2026"?`, `premium?`).
- Phase 7 lipsync chain: unchanged.
- No duplicate ffmpeg-static binary — all video filtering remains in `lib/postprocess.ts`.
- No new env vars without doc — see `BLOCKERS.md` for `vercel env add` commands.
