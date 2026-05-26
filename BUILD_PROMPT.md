# AdLab V2 — Continuous Cloud Build Task

You are Claude in claude.ai/code (Cowork mode). Your job: rebuild AdLab's video generation pipeline to match the realism of Speel.app / MakeUGC / Arcads. Work autonomously — commit after each phase. Do not stop until all phases pass acceptance criteria or you hit an external blocker.

## Context

- **Repo**: itayadler99/adlab (Next.js 16, Vercel deploy at adlab-amber.vercel.app)
- **Owner**: Itay (non-technical, Hebrew speaker). Generates Meta Ads for Montier (jewelry brand). Currently shipping "terrible quality" AI videos that hallucinate fake jewelry.
- **Live secret**: `ADLAB_PASSWORD=montier2026` (basic auth in proxy.ts)

## API access (already in Vercel env)

| Service | Key | What works | What's gated |
|---|---|---|---|
| FAL | `FAL_KEY` | flux-pro, nano-banana, veo3.1/fast/image-to-video, elevenlabs/tts, sync-lipsync/v2, ffmpeg-api/metadata | veo3.1 t2v, kling-video v3, ffmpeg-api/compose (Unauthorized) |
| Replicate | `REPLICATE_API_TOKEN` | All models. $40 credit. | none |
| Anthropic | `ANTHROPIC_API_KEY` | Opus + Sonnet for analysis | none |
| Apify | `APIFY_TOKEN` | Starter $29/mo, scrapers | none |
| Shopify | `SHOPIFY_ACCESS_TOKEN` | Montier US store products | none |

## V1 problems (what user complained about)

1. **Hallucinated jewelry** — V1 video mode used text-to-video (`veo-3-fast`) that invented chains/rings not in Shopify catalog. Unsellable.
2. **Bad quality** — Even after switching to i2v, output looked like AI. Too smooth, waxy skin, 24fps, no grain.
3. **Stitching fails** — FAL `ffmpeg-api/compose` returns Unauthorized for this account.
4. **Comparison target**: Speel.app, MakeUGC, Arcads — hyper-realistic UGC indistinguishable from iPhone footage.

## V2 Architecture (already designed)

Two anchored paths, BOTH start from the real Shopify product image.

### Path A — Product Showcase (no character, jewelry alone in motion)

| Stage | Primary | Fallback | Cost |
|---|---|---|---|
| 1. Hero composite | `fal-ai/nano-banana/edit` (jewelry on styled BG, studio macro) | raw productImageUrl | $0.04 |
| 2. Animate i2v | Replicate `bytedance/seedance-1-pro` 10s 1080p | Replicate `kwaivgi/kling-v2.1-master` | $0.40 |
| 3. Music bed | local curated MP3s `/public/audio/showcase/*` | silent | $0 |
| 4. Post-process | Replicate `pollinations/rife` interp + grain LUT | skip | $0.05 |
| 5. Mux | ffmpeg-static in Vercel function | skip | $0 |

### Path B — UGC (character holding/wearing product, talks to camera)

| Stage | Primary | Fallback | Cost |
|---|---|---|---|
| 1. Actor portrait | `fal-ai/flux-pro/v1.1-ultra` | `fal-ai/flux/dev` | $0.06 |
| 2. Composite | `fal-ai/nano-banana/edit` ([actor, product]) | retry stricter prompt → skip composite | $0.04 |
| 3. Animate talking-head | `fal-ai/veo3.1/fast/image-to-video` 8s 1080p (proven) | Replicate `kwaivgi/kling-v2.1-master` start_image | $0.30 |
| 4. TTS | `fal-ai/elevenlabs/tts/turbo-v2.5` | `fal-ai/elevenlabs/tts/eleven-v3` | $0.02 |
| 5. Lipsync | `fal-ai/sync-lipsync/v2` | Replicate `cjwbw/wav2lip` | $0.10 |
| 6. Post-process | Replicate `pollinations/rife` + grain | skip | $0.05 |

### Realism multipliers (apply to both paths)

- **Frame interpolation 24→48fps** via RIFE (Replicate `pollinations/rife` or `arielreplicate/rife`)
- **35mm film grain** via ffmpeg `noise=alls=10:allf=t` filter
- **Slight teal/orange LUT** via ffmpeg `lut3d` filter (asset under `/public/luts/`)
- **Sharpen pass** via ffmpeg `unsharp=5:5:1.0`
- **Prompt-level realism phrases**: "shot on iPhone 15 Pro front camera, vertical handheld, mild ISO grain, real skin pores, no airbrushing, candid unstaged"

### Stitching fix (the Unauthorized blocker)

Replace single FAL compose call in `lib/stitch.ts` with this chain:
1. Try existing `fal-ai/ffmpeg-api/compose`.
2. On `unauthorized|forbidden|cannot access`, fall through to Replicate `charlesmccarthy/addaudiotovideo` or `lucataco/ffmpeg-concat`.
3. Final fallback: Vercel serverless function using `ffmpeg-static` npm package — download MP4s to `/tmp`, concat-demux, upload to Vercel Blob, return URL. Requires `BLOB_READ_WRITE_TOKEN` env.

## Critical files

- `lib/autopilot.ts` — main orchestrator. Already routes to i2v when product image exists.
- `lib/video.ts` — REGISTRY of models + startVideo/pollVideo. Already has FAL→Replicate fallback + rate-limit retry + inter-clip spacing.
- `lib/ugc.ts` — 5-stage state machine: actor→composite→animate→tts→lipsync.
- `lib/ugc-prompts.ts` — prompt builders. Need jewelry-specific composite prompt.
- `lib/stitch.ts` — currently FAL only. Needs fallback chain.
- `lib/fal.ts` — thin FAL wrapper.
- `lib/video-meta.ts` — duration probe (used to auto-pick duration from competitor).
- `app/api/autopilot/run/route.ts` — POST entrypoint for autopilot.
- `app/api/ugc/advance/route.ts` — UGC state machine tick.
- `app/api/poll/route.ts` — poll a video/image job.
- `app/api/stitch/route.ts` — stitch multiple clips.
- `app/autopilot/page.tsx` — UI.

## Acceptance criteria

A run is "good enough to ship" when:

1. **Real product visible** — the exact item from `product.imageUrl` (Shopify) is recognizable in the output, not a hallucinated substitute. Spot check with Anthropic Vision: ask Claude to compare product photo vs final video, must rate "same item" with high confidence.
2. **Realism score ≥ 7/10** — auto-rate the final video via Claude Vision against 5 criteria: skin/material realism, motion naturalness, framing, lighting, no obvious AI tells. Save scores to `lib/quality-check.ts`.
3. **Stitching works** — 15s and 20s test ads complete without "Unauthorized" failures.
4. **End-to-end run < 5 min** for a 10s clip.
5. **Cost < $1.50 per 10s ad**.

## Phased work plan

### Phase 1 — Stitching fix (FIRST, unblocks multi-clip)
- Implement `lib/stitch.ts` fallback chain (Replicate then ffmpeg-static).
- Add `BLOB_READ_WRITE_TOKEN` to Vercel env (use `@vercel/blob`).
- Write quick smoke test: POST `/api/stitch` with 2 known-good MP4 URLs.
- Commit: `fix(stitch): three-tier fallback chain — FAL → Replicate → Vercel ffmpeg-static`

### Phase 2 — Showcase mode (product-only ads)
- New file `lib/showcase.ts` — orchestrator for product-only path (nano-banana hero composite → seedance-1-pro animate).
- Hook it into autopilot: if product is "small wearable" (ring/chain/earring) and competitor style is "demo" or "product_focus", route to showcase instead of full UGC.
- Add `mode === "showcase"` option to `/api/autopilot/run`.
- Commit: `feat(showcase): product-anchored hero motion path for small jewelry`

### Phase 3 — Post-processing
- New file `lib/postprocess.ts` — function `applyRealism(videoUrl)` returning enhanced URL.
- Pipeline: Replicate RIFE interp → ffmpeg-static grain+LUT (or fal-ai-equivalent if RIFE-only is enough).
- Add `postProcess: "speel" | "fast" | "off"` knob (default "fast").
- Hook into autopilot AFTER stitching, before returning.
- Commit: `feat(postprocess): frame-interp + grain + LUT pass for realism`

### Phase 4 — UGC composite quality
- Improve `buildCompositePrompt` in `lib/ugc-prompts.ts` — explicit jewelry preservation instruction: "Insert the exact product into the actor's hand or neckline. Match every facet, every link, every shadow to the second image. Do not stylize or simplify."
- Add a second composite attempt with `flux-subject` if nano-banana output fails Claude Vision check.
- Commit: `feat(ugc): jewelry-grade composite with vision-check fallback`

### Phase 5 — Quality check loop
- `lib/quality-check.ts` — Claude Vision-based judge: takes finalVideoUrl + product.imageUrl + script, returns `{ score, reasons[], retry: bool }`.
- If score < 7, retry animate stage with stricter prompt + different model.
- Cap retries at 2 to bound cost.
- Commit: `feat(quality): vision-based reject loop`

### Phase 6 — Speel-tier upscaling (optional, do last)
- Replicate `lucataco/real-esrgan-video` — 4K upscale.
- Only when user picks `quality: "speel"`.
- Commit: `feat(quality): 4K upscale tier`

## Communication protocol

After each phase:
1. Commit with descriptive message.
2. Push to main.
3. Write progress to `STATUS.md` at repo root with: phase done, what was tested, any blockers, next phase.
4. If blocked on env/secret: write `BLOCKERS.md` with exact env var name + how to add it via `vercel env add`.

## DO NOT

- Don't break existing UGC pipeline. Keep V1 paths working as fallback.
- Don't add features the user didn't ask for (no rotation engine, no A/B testing, no scheduling).
- Don't use FAL `kling-video/v3` or `veo3.1` directly — gated for this account.
- Don't recommend the user upgrade plans without first squeezing the current stack.
- Don't add em-dashes in Hebrew text (user preference).

## Reference research

Three background research reports were generated this session. If still in agent outputs at `/private/tmp/claude-502/-Users-macbookpro/.../tasks/`, read them. Otherwise re-research:

1. Speel.app pipeline reverse-engineering
2. MakeUGC / Arcads / HeyGen / Captions AI pipeline comparison
3. Best i2v models for jewelry product fidelity
4. Higgsfield + Kling + HeyGen combined creator workflows
5. Realism post-processing tricks (frame interp, grain, LUT)

## Owner availability

Owner is asleep. Do not block on questions. Make sensible defaults, document them in commits, ship.
