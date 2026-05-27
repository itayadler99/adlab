# Phase 7 — Final Realism Gap Closure

Autonomous cloud task. Owner asleep. Three items, ship each as a separate commit, push to main after each.

## Item 1 — Fix broken English text on ad images

**Problem:** Current image generation (flux-pro / flux-dev) produces hallucinated English text on overlays — gibberish letters, malformed words. Unsellable.

**Fix:**
- For ANY image with rendered text (headlines, badges, CTA), route to `fal-ai/nano-banana/edit` (Gemini 2.5 Flash Image) instead of flux. Nano Banana handles text accurately.
- Fallback chain: `nano-banana/edit` → `fal-ai/recraft/v3` (also text-accurate) → `flux-pro/v1.1-ultra` (last resort, no text).
- Find image-gen callsites in `lib/images.ts`, `lib/autopilot.ts`, `lib/ugc.ts`, `app/api/images/route.ts`. Add a `hasText: boolean` hint param; when true, force the nano-banana route.
- Prompt anchor for text images: `"Render text EXACTLY as: '{exact_text}'. Do not stylize, abbreviate, or substitute letters."`

**Commit:** `fix(images): route text-bearing images through nano-banana to kill broken English`

## Item 2 — Upgrade ElevenLabs voice to v3

**Current:** `fal-ai/elevenlabs/tts/turbo-v2.5` in UGC pipeline.
**Target:** `fal-ai/elevenlabs/tts/eleven-v3` (better emotion, breath, pauses).

**Fix:**
- `lib/ugc.ts` and any TTS callsite: swap model id `turbo-v2.5` → `eleven-v3`.
- Keep `turbo-v2.5` as fallback if v3 endpoint returns 4xx.
- For Hebrew voiceover, use a Hebrew voice id (research v3-compatible Hebrew voices via the FAL voice list endpoint). If unsure, default to a multilingual voice id from the v3 catalog.
- Add `voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.4, use_speaker_boost: true }` for the emotional UGC delivery.

**Commit:** `feat(ugc): upgrade ElevenLabs TTS to v3 with emotion tuning + fallback`

## Item 3 — Replace lipsync with sync-labs/lipsync-2

**Current:** `fal-ai/sync-lipsync/v2`.
**Target:** Replicate `sync/lipsync-2` (or `sync-labs/lipsync-2`). $0.05/sec, best 2026 Hebrew phoneme accuracy.

**Fix:**
- `lib/ugc.ts` lipsync stage: try Replicate `sync/lipsync-2` first.
- Fallback chain: Replicate `sync/lipsync-2` → existing `fal-ai/sync-lipsync/v2` → Replicate `cjwbw/wav2lip`.
- Verify the Replicate model exists and the input schema. Use `replicate.run("sync/lipsync-2", { input: { video: videoUrl, audio: audioUrl } })` or whatever the current schema requires.

**Commit:** `feat(ugc): swap lipsync to sync-labs/lipsync-2 for Hebrew phoneme accuracy`

## Acceptance per item

After EACH commit:
- `npx tsc --noEmit` must pass.
- `npm run build` must succeed.
- Push to main immediately.
- Append progress line to `STATUS.md` under a `## Phase 7` heading.

## Final step

After all three items are pushed, write `STATUS_PHASE7.md` summarizing:
1. Three commits with SHAs.
2. Any model IDs that needed adjustment.
3. Any blockers added to `BLOCKERS.md` (e.g., new Replicate model needs paid plan).
4. Smoke-test instructions for owner.

## DO NOT

- Don't break existing pipelines. Keep fallback chains intact.
- Don't add new env vars unless absolutely necessary. If you must, document them in `BLOCKERS.md` with `vercel env add` commands.
- Don't refactor unrelated code. Three surgical changes only.
