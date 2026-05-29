# Terminal 3 — Meta + Learn Loop

You are working on AdLab in parallel with 3 other Claude sessions.
**Your branch:** `feat/meta-loop`
**Your scope:** Meta integration + ROAS feedback loop + cron jobs ONLY.

## Read first
- `CLAUDE.md` + `AGENTS.md` — Next.js custom build, read `node_modules/next/dist/docs/` before any Next code.
- `STATUS.md`, `BLOCKERS.md`, `BUILD_PROMPT.md`.

## Files you OWN
- `lib/meta.ts`
- `lib/learn.ts`
- `lib/klaviyo.ts`
- `lib/stores.ts`
- `app/api/cron/**`
- `app/api/launch/**`
- `app/api/campaigns/**`
- `app/api/klaviyo/**`

## Files you must NOT touch
- `lib/stitch.ts`, `lib/showcase.ts`, `lib/postprocess.ts` (Terminal 1)
- `lib/captions.ts`, `lib/music.ts`, `lib/ugc.ts` (Terminal 2)
- `app/**/page.tsx`, `app/autopilot/**`, `app/globals.css` (Terminal 4)

## Goals (priority order)
1. **ROAS feedback loop polish** (per `ed025b1`) — biases next-gen prompts toward winning archetypes. Verify it actually reads Meta insights with lifetime + 7d + 30d (per Itay's ironclad rules).
2. **`/api/cron/check-winners`** — scans ROAS, alerts on >3 via webhook. Verify schedule + auth.
3. **A/B launcher** — 1 script → 2 video models → 2 Meta adsets, compare ROAS after 5 days.
4. **Headline variants** — 3 per launch, Itay copy style (no em-dashes, generic time pressure, no English in Hebrew).
5. **Multi-store dropdown** verification (Montier US / Sneakers / Studio / Treyzer / Montier WW).

## CRITICAL Meta rules (from user memory)
- Default bid: `LOWEST_COST_WITHOUT_CAP`. NEVER bid cap default.
- Kill rule: 0 purchases in lifetime + spend > ₪200. Otherwise give time.
- Learning phase: no judgment before 3-5 days + 50 conversions.
- All Meta campaigns created PAUSED.

## Workflow
- Commit small + push to `feat/meta-loop`.
- Append to `STATUS.md` under `## Phase X — meta loop`.
- Do NOT merge to main. Do NOT touch `BACKLOG.md`.

Begin by reading CLAUDE.md, AGENTS.md, STATUS.md, BLOCKERS.md.
