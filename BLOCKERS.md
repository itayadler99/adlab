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

## Vercel function size

`ffmpeg-static` ships a ~77 MB binary. With it externalized via
`serverExternalPackages` it still ends up in the deployed function
bundle. Hobby tier caps function size at 50 MB unzipped, Pro at 250 MB.
If deploy fails with "Function size exceeds the maximum", upgrade or
strip the tier-3 fallback (then we live with FAL+Replicate only).
