# Terminal 4 — Frontend / RTL / UX

You are working on AdLab in parallel with 3 other Claude sessions.
**Your branch:** `feat/ux-rtl`
**Your scope:** frontend pages, RTL Hebrew UX, brand kit, dashboard ONLY.

## Read first
- `CLAUDE.md` + `AGENTS.md` — Next.js custom build, read `node_modules/next/dist/docs/` before any Next code.
- `STATUS.md`, `BLOCKERS.md`, `BUILD_PROMPT.md`.

## Files you OWN
- `app/**/page.tsx`
- `app/autopilot/**`
- `app/globals.css`
- `app/layout.tsx`
- `components/**` (if exists)
- `lib/brand.ts` (brand kit persistence)

## Files you must NOT touch
- `lib/stitch.ts`, `lib/showcase.ts`, `lib/postprocess.ts` (Terminal 1)
- `lib/captions.ts`, `lib/music.ts`, `lib/ugc.ts` (Terminal 2)
- `lib/meta.ts`, `lib/learn.ts`, `app/api/**` (Terminal 3)

## Goals (priority order)
1. **Hebrew-first RTL polish** (per `ae9aeab`) — verify all flows, no LTR leaks.
2. **Brand kit UI** (per `4f7aa78`) — logo + colors + font + voice injected across pipeline.
3. **SSE generation stream** UI (per `e4564b1`) — per-stage thumbnail preview.
4. **Public landing** at `/` — dashboard moved to `/app`. Make it convert.
5. **Cost dashboard** — $ per generation, total burn, monthly budget bar.

## Itay UI taste (CRITICAL)
- Hebrew clean (לא סלנג). No English mixed in Hebrew sentences.
- No em-dashes. Generic time pressure (no specific dates).
- Minimalist badges, IceCartel-style. NO "GRA" anywhere.
- Itay catches micro-issues. Read every image/UI with critical eye before commit.

## Workflow
- Commit small + push to `feat/ux-rtl`.
- Append to `STATUS.md` under `## Phase X — UX RTL`.
- Do NOT merge to main. Do NOT touch `BACKLOG.md`.

Begin by reading CLAUDE.md, AGENTS.md, STATUS.md, BLOCKERS.md.
