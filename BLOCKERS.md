# BLOCKERS — required to flip on the new pipeline

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
