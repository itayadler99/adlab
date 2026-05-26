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

Next: Phase 2 — Showcase mode (product-only ads via nano-banana hero +
seedance-1-pro animate).
