# Terminal 2 — Audio / Captions / UGC

You are working on AdLab in parallel with 3 other Claude sessions.
**Your branch:** `feat/audio-captions`
**Your scope:** audio + captions + UGC composite ONLY.

## Read first
- `CLAUDE.md` + `AGENTS.md` — Next.js custom build, read `node_modules/next/dist/docs/` before any Next code.
- `STATUS.md`, `BLOCKERS.md`, `BUILD_PROMPT.md`.

## Files you OWN
- `lib/captions.ts`
- `lib/music.ts`
- `lib/ugc.ts`
- `lib/souls.ts`
- `app/api/captions/**`
- `app/api/ugc/**`

## Files you must NOT touch
- `lib/stitch.ts`, `lib/showcase.ts`, `lib/postprocess.ts` (Terminal 1)
- `lib/meta.ts`, `lib/learn.ts`, `app/api/cron/**` (Terminal 3)
- `app/**/page.tsx`, `app/autopilot/**`, `app/globals.css` (Terminal 4)

## Goals (priority order)
1. **ElevenLabs v3 Hebrew tuning** — emotion + cadence for Israeli market.
2. **sync-labs/lipsync-2** phoneme accuracy for Hebrew (per recent commit `8b58c1a`).
3. **libass captions** RTL Hebrew burn-in polish (per `a8d6c82`).
4. **Music bed per-vertical sidechain duck** under VO (per `d11cbdc`).
5. **Soul ID library** integration polish — Malik preset + Higgsfield characters.

## Workflow
- Commit small + push to `feat/audio-captions`.
- Append to `STATUS.md` under `## Phase X — audio/captions`.
- Do NOT merge to main. Do NOT touch `BACKLOG.md`.
- Append blockers to `BLOCKERS.md`.

Begin by reading CLAUDE.md, AGENTS.md, STATUS.md, BLOCKERS.md.
