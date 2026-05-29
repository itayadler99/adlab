# Terminal 1 — Video Pipeline

You are working on AdLab in parallel with 3 other Claude sessions.
**Your branch:** `feat/video-pipeline`
**Your scope:** video pipeline ONLY.

## Read first
- `CLAUDE.md` + `AGENTS.md` — Next.js custom build, read `node_modules/next/dist/docs/` before any Next code.
- `STATUS.md` — current phases progress.
- `BLOCKERS.md` — known blockers (FAL_KEY invalid, BLOB_TOKEN, network allowlist).
- `BUILD_PROMPT.md` — V2 spec.

## Files you OWN (edit freely)
- `lib/stitch.ts`
- `lib/showcase.ts`
- `lib/postprocess.ts`
- `lib/quality-check.ts`
- `app/api/stitch/**`
- `app/api/showcase/**`
- `scripts/smoke-stitch.mjs` + new smoke scripts

## Files you must NOT touch
- `lib/captions.ts`, `lib/music.ts`, `lib/ugc.ts` (Terminal 2)
- `lib/meta.ts`, `lib/learn.ts`, `app/api/cron/**` (Terminal 3)
- `app/**/page.tsx`, `app/autopilot/**`, `app/globals.css` (Terminal 4)

## Goals (priority order)
1. **Fix FAL_KEY blocker.** Either get FAL working in prod OR fully strip FAL paths and make Replicate primary everywhere in stitch/showcase/postprocess.
2. **Smoke test stitch + showcase end-to-end on prod.** Document in STATUS.md.
3. **Quality-check loop.** `lib/quality-check.ts` — Claude Vision judge, retry if <7/10 (from BUILD_PROMPT phase 5).
4. **Optional 4K upscale** via `lucataco/real-esrgan-video` (phase 6).

## Workflow
- Commit small + push to `feat/video-pipeline` every meaningful change.
- Append progress to `STATUS.md` under a `## Phase X — video pipeline` heading.
- Do NOT merge to main. Owner merges.
- Do NOT touch `BACKLOG.md`.
- If blocked on env var or external service, append to `BLOCKERS.md` and continue with what you can.

Begin by reading CLAUDE.md, AGENTS.md, STATUS.md, BLOCKERS.md, then propose plan.
