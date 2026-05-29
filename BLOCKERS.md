# BLOCKERS — required to flip on the new pipeline

## ⛔ Phase 9: execution-environment network allowlist blocks all verification

The Phase 9 cloud run could not reach **any** of the hosts it needed. The
environment enforces an outbound allowlist; everything Phase 9 touches returns
`HTTP 403 "Host not in allowlist"`:

- `adlab-amber.vercel.app` (prod — required for `scripts/smoke-prod.sh`)
- `api.replicate.com` (required to verify/route the new primary models)
- `queue.fal.run`, `api.elevenlabs.io`

Only `registry.npmjs.org` (and GitHub via MCP) are reachable. Because prod and
Replicate are unreachable, the mandatory smoke test cannot run and the
FAL→Replicate swaps cannot be verified — so they were intentionally **not**
written (shipping unverifiable model slugs risks breaking prod, which the task
forbids). See `STATUS_PHASE9.md`.

**Unblock:** run the task in an environment whose network policy allowlists
`*.vercel.app`, `api.replicate.com`, `queue.fal.run`, `api.elevenlabs.io`
(or an unrestricted policy), then use `scripts/smoke-prod.sh` as the gate.

## BLOB_READ_WRITE_TOKEN (Vercel Blob)

Tier 3 of the stitch fallback (`lib/stitch.ts`) uploads the stitched MP4
to Vercel Blob. Without this token tier 3 throws, and stitching only
works if FAL or Replicate succeeds first.

How to provision:

```sh
# 1. Create a Blob store (one-time, in the Vercel dashboard or CLI):
vercel blob create adlab-stitch

# 2. Pull the auto-generated token name (Vercel exposes it as
#    BLOB_READ_WRITE_TOKEN by default when you attach a store to a project).
#    If not auto-attached:
vercel env add BLOB_READ_WRITE_TOKEN production
# paste the token value when prompted

vercel env add BLOB_READ_WRITE_TOKEN preview
vercel env add BLOB_READ_WRITE_TOKEN development
```

After adding, redeploy with `vercel --prod` (or push to main) so the
runtime picks up the new env.

## Replicate `sync/lipsync-2` model access (Phase 7)

The new UGC lipsync tier 1 is `sync/lipsync-2` on Replicate (~$0.05/sec,
best 2026 Hebrew phoneme accuracy). The model is on Replicate's hosted
catalog so no extra env vars are needed beyond `REPLICATE_API_TOKEN`,
but verify a real prediction succeeds the first time the pipeline
runs in production:

```sh
# Quick check (replace token):
curl -s -X POST https://api.replicate.com/v1/models/sync/lipsync-2/predictions \
  -H "Authorization: Bearer $REPLICATE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"input":{"video":"<small mp4>","audio":"<small mp3>"}}' | jq
```

If Replicate returns 402 / "not enabled for this account" the pipeline
will auto-fall through to FAL `sync-lipsync/v2` and then Replicate
`cjwbw/wav2lip`, so no hard breakage — just upgrade the Replicate plan
if you want the v2 quality.

## ElevenLabs v3 access (Phase 7)

UGC TTS now defaults to `fal-ai/elevenlabs/tts/eleven-v3`. If the FAL
account isn't enabled for v3 yet, the pipeline falls back to
`turbo-v2.5` automatically. To verify v3 is live:

```sh
curl -s -X POST https://queue.fal.run/fal-ai/elevenlabs/tts/eleven-v3 \
  -H "Authorization: Key $FAL_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text":"hello","voice":"21m00Tcm4TlvDq8ikWAM","voice_settings":{"stability":0.5,"similarity_boost":0.75,"style":0.4,"use_speaker_boost":true}}' | jq
```

A 200 / queued response means v3 is live; 4xx falls through to turbo.

## Vercel function size

`ffmpeg-static` ships a ~77 MB binary. With it externalized via
`serverExternalPackages` it still ends up in the deployed function
bundle. Hobby tier caps function size at 50 MB unzipped, Pro at 250 MB.
If deploy fails with "Function size exceeds the maximum", upgrade or
strip the tier-3 fallback (then we live with FAL+Replicate only).

---

## Phase 8 V3 ultra additions

### Supabase migrations to run

The Phase 8 schemas need to be applied before the brand-kit / variant_perf
features have any persistence. Apply via the Supabase SQL editor or psql:

```sh
psql "$SUPABASE_DB_URL" -f supabase/migrations/v3_brand_kits.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/v3_variant_perf.sql
```

Both tables degrade gracefully when missing:
- `getBrandKit()` falls back to hard-coded defaults in `lib/brand-kit.ts`.
- `topArchetypes()` returns `[]` and the script generator runs without bias.
- `upsertVariantPerf()` is a no-op when the table is missing.

Also: the `lib/higgsfield.ts` Soul cache writes to a `soul_library_cache`
table. That table is intentionally not in the migrations bundle — create it
manually only if you want the offline cache:

```sql
create table if not exists soul_library_cache (
  id text primary key,
  souls jsonb,
  cached_at timestamptz default now()
);
```

### New env vars (P3, P7, P8)

```sh
# Higgsfield REST (P3) — required for live Soul training/rendering & virality_predictor.
# When unset, the pipeline falls back to flux-pro for actor stage and a neutral
# 50 score for virality.
vercel env add HIGGSFIELD_API_URL production
vercel env add HIGGSFIELD_API_KEY production

# Cron secret (P7) — guards GET /api/cron/learn.
vercel env add CRON_SECRET production

# Captions Mirage premium (P8) — premium UGC bypass route.
vercel env add CAPTIONS_MIRAGE_API_URL production   # defaults to https://api.captions.ai/v1
vercel env add CAPTIONS_MIRAGE_API_KEY production
```

### Music bed drop list (P5)

The directories `public/music/{jewelry,sneakers,saas,studio,universal}/`
ship empty (`.gitkeep` only). Drop 3-5 royalty-free `.mp3` tracks into each
vertical and commit. Recommended sources:

- Universal: Bensound, Pixabay Music (CC0)
- Jewelry: ambient luxury — search "luxury ambient" on Pixabay
- Sneakers: hip-hop bed loops
- SaaS: lo-fi corporate
- Studio: cinematic ambient

`pickMusicTrack(vertical)` random-picks per generation; falls through to
`universal/` then null when empty.

### Higgsfield MCP vs REST quirks (P3)

Vercel functions had flaky MCP reachability in prior testing, so
`lib/higgsfield.ts` talks REST directly (`HIGGSFIELD_API_URL`/`KEY`).
The MCP schema names are kept in code comments as a reference — the
adapter only needs `/v1/souls`, `/v1/souls/train`, `/v1/souls/{id}/render`,
and `/v1/virality/predict`.

### Cron schedule for /api/cron/learn (P7)

Add to `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/learn?secret=<CRON_SECRET>", "schedule": "0 6 * * *" }
  ]
}
```

Runs daily at 06:00 UTC. Verify with:

```sh
curl -s "https://<deploy-url>/api/cron/learn?secret=$CRON_SECRET" | jq
# expected: {"ok":true,"scanned":N,"updated":N}
```

### Topaz Astra v2 not on Replicate

The 2026-correct chain calls for Topaz Astra v2 at the upscale step.
Topaz lacks a Replicate slug; we substitute `lucataco/real-esrgan-video`
in `lib/postprocess.ts`. Quality is close-but-not-identical — if a
Topaz REST endpoint ships later, swap `UPSCALE_MODEL` and we're done.
