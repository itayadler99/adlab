# Phase 7 — Final Realism Gap Closure (autonomous session)

Branch: `claude/nifty-knuth-qjV0O` (session policy requires development on
this branch; the BUILD_PROMPT says "push to main" — owner can fast-forward
`main` to this branch's HEAD). Each item below is its own commit, pushed
to origin. Typecheck + build pass after each commit.

## Commits

| # | SHA | Title |
|---|-----|-------|
| 1 | `dd2ebe1` | `fix(images): route text-bearing images through nano-banana to kill broken English` |
| 2 | `555b687` | `feat(ugc): upgrade ElevenLabs TTS to v3 with emotion tuning + fallback` |
| 3 | `8b58c1a` | `feat(ugc): swap lipsync to sync-labs/lipsync-2 for Hebrew phoneme accuracy` |

## Item 1 — Text-bearing images → nano-banana

- Files: `lib/images.ts`, `lib/autopilot.ts`.
- Added `hasText?: boolean` + `productImageUrl?: string` to
  `SalesImageInput`. Sales images default to `hasText: true`.
- Routes the FAL chain `nano-banana/edit` (when a real product photo is
  provided) → `nano-banana` (text-only) → `recraft/v3` → `flux-pro/v1.1-ultra`
  → Replicate `ideogram-v2` (no-FAL fallback).
- Every prompt now carries `Render text EXACTLY as: "..."` for headline,
  bullets, and brand so the model does not paraphrase or substitute letters.
- `ImageJob.id` is now provider-tagged (`fal:<endpoint>:<requestId>` vs
  plain Replicate id). `pollImage` dispatches accordingly. No
  client-facing schema change — the existing `/api/poll?kind=image` route
  still works with both providers.

## Item 2 — ElevenLabs v3

- File: `lib/ugc.ts`.
- `FAL.tts` is now `fal-ai/elevenlabs/tts/eleven-v3`; `FAL.ttsFallback`
  retains `fal-ai/elevenlabs/tts/turbo-v2.5`.
- v3 submit uses the nested shape:
  `voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.4, use_speaker_boost: true }`.
  Submit-side failures fall through to `turbo-v2.5` with the legacy flat
  fields in-band.
- Hebrew still routes via `ELEVENLABS_VOICE_HE` env override against the
  multilingual Rachel default — v3 inherits the public voice library, so
  no v3-specific Hebrew voice id was hardcoded.

## Item 3 — Lipsync → sync-labs/lipsync-2

- File: `lib/ugc.ts`.
- Tiered fallback chain (each tier survives the next tier's submit AND
  poll failures in-band):
  1. Replicate `sync/lipsync-2` — `{ video, audio, sync_mode: "cut_off" }`
  2. FAL `sync-lipsync/v2` — the previous default
  3. Replicate `cjwbw/wav2lip` — last resort, `{ face, audio }`
- `UgcState.pending` now carries `provider: "fal" | "replicate"`
  (optional, backwards compatible). `advanceUgc` polls the correct
  provider; `lipsyncTier` lives on the state so the chain survives
  client round-trips.
- Added `pollReplicateJob` to unwrap Replicate's heterogeneous video
  output shapes (`string`, `string[]`, `{ video }`, `{ url }`).

## Model IDs adjusted

- `fal-ai/elevenlabs/tts/turbo-v2.5` → `fal-ai/elevenlabs/tts/eleven-v3`
  (kept the v2.5 endpoint as `FAL.ttsFallback`).
- `fal-ai/sync-lipsync/v2` was demoted from primary lipsync endpoint to
  tier 2 of the chain. Replicate `sync/lipsync-2` is the new tier 1.
- For text-bearing sales images: `ideogram-ai/ideogram-v2` (Replicate)
  was demoted from primary image endpoint to the final fallback when
  FAL is not configured.

## Blockers added

`BLOCKERS.md` now lists two new sections — both are smoke tests rather
than hard blockers, because the fallback chains keep the pipeline alive
in either failure mode:

1. **Replicate `sync/lipsync-2` access.** Uses the existing
   `REPLICATE_API_TOKEN` — no new env var. If the Replicate account isn't
   on a plan that includes this model, the pipeline auto-falls through to
   FAL `sync-lipsync/v2` then `cjwbw/wav2lip`. Curl test is in
   `BLOCKERS.md`.
2. **ElevenLabs v3 access via FAL.** Pipeline auto-falls back to
   `turbo-v2.5` if the v3 endpoint returns 4xx. Curl test in
   `BLOCKERS.md`.

No new env vars were introduced.

## Smoke-test instructions for owner

1. Fast-forward `main` to `claude/nifty-knuth-qjV0O`:
   ```sh
   git fetch origin claude/nifty-knuth-qjV0O
   git checkout main && git merge --ff-only origin/claude/nifty-knuth-qjV0O
   git push origin main
   ```
2. Deploy on Vercel (or wait for the auto-deploy on main).
3. **Item 1 — sales images:** Trigger an autopilot run via the
   `/autopilot` page with a real competitor. When the image cards
   appear, confirm the rendered headline / bullet text matches the
   prompt verbatim (no gibberish letters). The `id` field in the
   `/api/poll?kind=image` response will start with `fal:` for the
   nano-banana / recraft / flux paths and be a plain Replicate id only
   if the FAL chain fully rejected the request.
4. **Item 2 — TTS:** Pick a UGC-style competitor so the autopilot
   routes to UGC mode. When the TTS stage runs, check Vercel function
   logs for either `[ugc] elevenlabs v3 submit failed, falling back to
   turbo-v2.5` (means v3 isn't enabled — see BLOCKERS.md curl test)
   or no warning at all (v3 is working). The audio file should sound
   noticeably more natural — pauses, breath, emotion.
5. **Item 3 — Lipsync:** Same UGC run. The lipsync stage will start with
   Replicate `sync/lipsync-2`. Vercel logs will show
   `[ugc] replicate sync/lipsync-2 submit failed, falling back to fal
   sync-lipsync v2` if Replicate rejects, or nothing if it works. The
   final video lip movement should match Hebrew phonemes better than
   the previous FAL-only output.
6. **Regression check on showcase/video modes:** These paths are
   unchanged and should keep working — only the sales image generation,
   UGC TTS, and UGC lipsync stages were touched.

If any tier fails in a way the fallback can't catch (e.g. all three
lipsync providers down), the existing `state.failed` path surfaces the
error to the UI with `{ stage: "failed", error: "..." }` exactly as
before.
