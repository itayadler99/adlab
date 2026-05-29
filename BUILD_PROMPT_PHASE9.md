# Phase 9 — Production Hardening: Replace FAL with Replicate primary, self-verify against prod

Autonomous cloud task. Owner asleep, computer off. **DO NOT report success unless prod smoke-test passes.**

## Root cause

Production has invalid `FAL_KEY` — direct test returns `{"detail":"invalid key credentials"}` HTTP 401. Owner cannot rotate it manually. **EVERY FAL endpoint in the codebase must fall back to Replicate or fail gracefully.** Replicate token is valid and works.

Hard evidence (do not re-verify, trust this):
```
$ curl -X POST https://queue.fal.run/fal-ai/nano-banana/edit -H "Authorization: Key <key>" -d '{...}'
{"detail":"invalid key credentials"} HTTP 401
$ curl -u :montier2026 https://adlab-amber.vercel.app/api/showcase/start ...
{"error":"Unauthorized"} HTTP 500
```

## Items

### Item 1 — Replace FAL nano-banana with Replicate google/nano-banana

**Where:** `lib/images.ts`, `lib/showcase.ts`, `lib/ugc.ts`, `app/api/images/route.ts`.

**New primary endpoint:** Replicate `google/nano-banana` (Gemini 2.5 Flash Image). Schema:
```
input: { prompt: string, image_input?: string[] }  // image_input for edit mode
```

**Fallback chain order (write into every callsite):**
1. Replicate `google/nano-banana` (primary, was previously labeled fallback for text)
2. FAL `fal-ai/nano-banana/edit` (current primary; demote to tier 2 — likely still 401 until FAL_KEY rotated)
3. Replicate `bria/eraser` for background-only edits
4. FAL `fal-ai/flux-pro/v1.1-ultra` for text-free synthesis (last resort)

For text-bearing images (badges, headlines, CTA): `google/nano-banana` is still the answer — same model behind both FAL and Replicate.

**Commit:** `fix(images): Replicate google/nano-banana primary — work around invalid FAL_KEY`

### Item 2 — Replace FAL Veo 3.1 with Replicate google-deepmind/veo-3-fast

**Where:** `lib/ugc.ts` (animate stage), `lib/autopilot.ts` (model picker).

**Replicate model:** `google-deepmind/veo-3-fast` (i2v). Schema:
```
input: { prompt: string, image: string, duration_seconds?: number }
```

Keep existing `bytedance/seedance-1-pro` and `kwaivgi/kling-v2.1-master` as alternates.

**Commit:** `fix(animate): route Veo 3.1 Fast through Replicate to bypass FAL`

### Item 3 — Replace FAL ElevenLabs TTS with direct ElevenLabs API

**Where:** `lib/ugc.ts` (tts stage).

**New path:** Direct `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream` with `model_id: "eleven_v3"`. Needs `ELEVENLABS_API_KEY` env. If not set, fall back to Replicate `lucataco/xtts-v2` (multilingual TTS).

Document in BLOCKERS.md: `vercel env add ELEVENLABS_API_KEY production` if owner wants v3 quality.

**Commit:** `fix(tts): direct ElevenLabs API + Replicate xtts-v2 fallback`

### Item 4 — Replace FAL sync-lipsync v2 with Replicate sync/lipsync-2

**Where:** `lib/ugc.ts` (lipsync stage).

Already partially done in Phase 7. **Reverse the fallback order**: Replicate `sync/lipsync-2` PRIMARY (already), FAL `fal-ai/sync-lipsync/v2` REMOVED entirely (broken auth), Replicate `cjwbw/wav2lip` fallback.

**Commit:** `fix(lipsync): drop FAL sync-lipsync — Replicate-only chain`

### Item 5 — Replace FAL stitch + FAL ffmpeg-api with Replicate + Vercel ffmpeg-static

**Where:** `lib/stitch.ts`.

Drop FAL tier entirely. Order: Replicate ffmpeg model → Vercel ffmpeg-static (tier 3 from Phase 1). If Replicate has no concat model, skip directly to ffmpeg-static.

Look up: `lucataco/ffmpeg-concat` was 404 in Phase 1 — find a real Replicate concat model. Candidates: `chenxwh/video-stitch`, `meta/musicgen` (no), search Replicate explorer programmatically.

**Commit:** `fix(stitch): drop FAL — Replicate + ffmpeg-static only`

### Item 6 — Add prod smoke-test script + run after each commit

Create `scripts/smoke-prod.sh`:
```bash
#!/bin/bash
set -e
BASE="https://adlab-amber.vercel.app"
AUTH="-u :montier2026"

echo "== /api/health =="
curl -s $AUTH "$BASE/api/health" | jq -r '.ready' | grep -q true

echo "== /api/showcase/start =="
r=$(curl -s $AUTH "$BASE/api/showcase/start" -X POST -H "Content-Type: application/json" \
  -d '{"productTitle":"Diamond Tennis","productImageUrl":"https://placehold.co/1080x1080.jpg","hook":"glow up"}')
echo "$r" | jq -e '.stage' || (echo "SHOWCASE FAIL: $r" && exit 1)

echo "== /api/generate =="
r=$(curl -s $AUTH "$BASE/api/generate" -X POST -H "Content-Type: application/json" \
  -d '{"prompt":"jewelry box opens"}')
echo "$r" | jq -e '.id' || (echo "GENERATE FAIL: $r" && exit 1)

echo "ALL GREEN"
```

After EACH commit + push, wait for Vercel deploy (poll `npx vercel ls --prod` until newest deploy is `Ready`), then run `bash scripts/smoke-prod.sh`. If it fails, **revert the commit and try another approach.** Do NOT push broken state to user.

### Item 7 — Final acceptance bar

Before writing `STATUS_PHASE9.md`:
1. `bash scripts/smoke-prod.sh` exits 0 in production
2. `npx tsc --noEmit` passes locally  
3. `npm run build` passes locally
4. A real Shopify product image (pull from /api/products) goes through full UGC pipeline end-to-end and returns a stitched MP4 URL that downloads as valid video

If any of these fail after 3 attempts per commit, log the failure to `STATUS_PHASE9.md` and **flag it explicitly** — do not pretend it works.

## Acceptance after all commits

Write `STATUS_PHASE9.md`:
- SHAs per commit
- Smoke test output (full curl logs)
- Any model IDs swapped + why
- Endpoints still depending on FAL (if any — should be ZERO)
- Real prod URL of one successful end-to-end MP4

## DO NOT

- Don't claim success without smoke-test proof
- Don't push broken code to main; if a commit's smoke test fails, revert
- Don't add env vars beyond `ELEVENLABS_API_KEY` (optional); the working keys exist in prod
- Don't keep FAL_KEY-dependent code paths "for completeness" — strip them; FAL_KEY is dead until owner rotates
