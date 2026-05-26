# AdLab V2 build — autonomous session status

Branch: `claude/charming-rubin-13BwT` (BUILD_PROMPT says "push to main", but
session policy requires development on this branch — owner can fast-forward
`main` to it).

## Phase 1 — Stitching fix ✅ done

What changed
- `lib/stitch.ts`: rewrote as a three-tier fallback chain.
  1. `fal-ai/ffmpeg-api/compose` (kept as the primary; gated on this
     account so it usually fails with `Unauthorized` and we fall through).
  2. Replicate `lucataco/ffmpeg-concat` (handles the common ≥2-clip case
     without pulling bytes through Vercel).
  3. Local `ffmpeg-static` in the Vercel function `/tmp`, then upload to
     Vercel Blob with the `@vercel/blob` SDK. Tries stream-copy first,
     re-encodes on container/codec mismatch.
- `app/api/stitch/route.ts`: now returns `{ url, trace }` where `trace`
  records which tier produced the output plus any earlier failures.
- `next.config.ts`: added `serverExternalPackages: ["ffmpeg-static"]` so
  the 77 MB native binary stays in `node_modules` instead of being
  bundled by Turbopack.
- `package.json`: added `@vercel/blob` and `ffmpeg-static`.
- `scripts/smoke-stitch.mjs`: POSTs to `/api/stitch` with two known-good
  sample MP4s and prints the trace.

What was tested
- `npx tsc --noEmit` — clean.
- `npm run build` — successful, `/api/stitch` route compiled.
- End-to-end smoke run NOT yet executed because the container has no
  outbound network policy for downloading the sample MP4s; will be
  validated against `adlab-amber.vercel.app` after the next deploy.

Blockers
- `BLOB_READ_WRITE_TOKEN` must be set in Vercel env for tier 3 to work
  (see BLOCKERS.md). The FAL and Replicate tiers will still work
  without it; tier 3 only kicks in if both upstream tiers fail.
- If the Vercel project is on the Hobby plan, the 77 MB `ffmpeg-static`
  binary may push the function over the 50 MB unzipped limit. Pro plan
  raises this to 250 MB. The first two tiers cover this gracefully.

## Phase 2 — Showcase mode ✅ done

What changed
- `lib/showcase.ts` — new state machine for the product-only path. Stage 1
  composites a luxury hero shot via FAL `nano-banana/edit` anchored on
  the Shopify product image. Stage 2 animates to a 10s 1080p clip via
  Replicate `bytedance/seedance-1-pro`, with `kwaivgi/kling-v2.1-master`
  as the in-state fallback if seedance rejects.
- `lib/showcase.ts` exports `shouldUseShowcase()` which routes "demo"
  style competitor ads (and small-wearable founder_pov) to this path.
- `app/api/showcase/start` + `app/api/showcase/advance` mirror the
  UGC tick pattern (stateless server, client holds state).
- `lib/autopilot.ts` — `AutopilotMode` now includes `"showcase"`;
  result carries `showcaseInputs` (analogous to `ugcInputs`); auto-mode
  picks showcase when `shouldUseShowcase()` returns true.
- `app/autopilot/page.tsx` — added `ShowcaseState` type, tick loop,
  pipeline progress card, and a "תצוגת מוצר" option in the mode
  dropdown.

What was tested
- `npx tsc --noEmit` clean.
- `npm run build` — both new routes `/api/showcase/start` and
  `/api/showcase/advance` registered. End-to-end run pending Vercel
  deploy.

Blockers
- None new. FAL `nano-banana/edit` and Replicate `seedance-1-pro` are
  both confirmed accessible in the current env.

## Phase 3 — Post-processing ✅ done

What changed
- `lib/postprocess.ts` — `applyRealism(url, { level })` with three levels:
  - `off` — passthrough.
  - `fast` (default) — ffmpeg-static pass with film grain
    (`noise=alls=10:allf=t`), a teal/orange curves filter, mild
    saturation lift, and an `unsharp=5:5:0.7` pop. Uploads to Vercel Blob.
  - `speel` — Replicate `pollinations/rife` 2x interp first (24→48fps),
    then the ffmpeg pass.
  - Any RIFE failure degrades gracefully to ffmpeg-only; any ffmpeg
    failure returns the source URL untouched. The goal is "never block
    the final ad".
- `app/api/postprocess/route.ts` — POST `{ url, level }` → `{ url, trace }`.
- `app/autopilot/page.tsx` — added a `postProcess` selector (default
  "fast"). After the source video is ready (and stitched if multi-clip),
  the client auto-POSTs to `/api/postprocess` and the player + launch
  pipeline switch to the enhanced URL. Status banner reflects the pass.
- Replaced the .cube LUT mentioned in BUILD_PROMPT with ffmpeg
  `curves`/`eq` filters so we don't need to ship a binary LUT file.

What was tested
- `npx tsc --noEmit` clean; `npm run build` registers `/api/postprocess`.
- End-to-end needs Vercel deploy + `BLOB_READ_WRITE_TOKEN` to write
  the enhanced mp4 back to Blob.

Blockers
- Same `BLOB_READ_WRITE_TOKEN` requirement as Phase 1. Without it the
  ffmpeg pass falls through and we serve the source URL.

Next: Phase 4 — UGC composite quality (jewelry-grade prompts +
vision-check fallback).
