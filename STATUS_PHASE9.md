# STATUS — Phase 9 (Production Hardening)

## ⛔ NOT COMPLETE — BLOCKED. Success is NOT claimed.

Phase 9's single overriding acceptance criterion is:

> do NOT claim success unless `scripts/smoke-prod.sh` passes against
> `https://adlab-amber.vercel.app` with basic auth `:montier2026`.

That criterion **could not be met**, and per the task's own DO-NOT rules I am
not claiming otherwise.

## Root cause of the block: network policy of the execution environment

This Phase 9 run executed inside the Claude Code cloud environment. That
environment's outbound network policy is an **allowlist** that does not include
any of the hosts Phase 9 depends on. Measured directly:

```
$ curl -s -u :montier2026 -w 'HTTP %{http_code}\n' https://adlab-amber.vercel.app/api/health
Host not in allowlist
HTTP 403

$ for h in api.replicate.com queue.fal.run api.elevenlabs.io; do curl -s -o /dev/null -w "$h %{http_code}\n" https://$h; done
api.replicate.com    403   (Host not in allowlist)
queue.fal.run        403   (Host not in allowlist)
api.elevenlabs.io    403   (Host not in allowlist)

$ curl -s -o /dev/null -w '%{http_code}\n' https://registry.npmjs.org
200   (only npm + GitHub-via-MCP are reachable)
```

The TLS handshake to Vercel completes (real `*.vercel.app` cert), but a
filtering proxy returns `403 Host not in allowlist` for the body. This is the
environment's configured policy, not a transient error or a local sandbox
issue (confirmed identical with the sandbox disabled).

Consequences for Phase 9 specifically:

1. **The mandatory `scripts/smoke-prod.sh` cannot run here** — prod is unreachable.
2. **The FAL→Replicate swaps cannot be verified, or even safely written.**
   The task says to point every callsite at Replicate slugs such as
   `google/nano-banana`, `google-deepmind/veo-3-fast`, `sync/lipsync-2`,
   `lucataco/xtts-v2`, and an as-yet-unidentified Replicate ffmpeg-concat model.
   `api.replicate.com` is blocked, so I cannot confirm any of those slugs exist
   or what their input schemas are. Writing them blind risks shipping invalid
   model IDs — i.e. *breaking* prod — which is exactly what the task forbids.
3. **The safety net is gone.** The task's protection against bad commits is
   "run the smoke test after each push; if it fails, revert." With prod
   unreachable, that loop cannot operate, so no production-integration commit
   can be validated before it would reach the owner.

Given all three, the responsible action was to **not** push unverifiable
FAL→Replicate code changes. No source files (`lib/images.ts`, `lib/showcase.ts`,
`lib/ugc.ts`, `lib/stitch.ts`, `lib/autopilot.ts`, `app/api/images/route.ts`)
were modified.

## What WAS delivered (low-risk, owner-runnable)

- `scripts/smoke-prod.sh` — the Phase 9 smoke test verbatim from the build
  prompt, executable. **Run it from any machine/network that can reach the
  deploy** (your laptop, a CI runner without the allowlist). It is the
  acceptance gate; it just needs an unblocked network.
- This `STATUS_PHASE9.md` and a new BLOCKERS.md section documenting the policy.

## To actually complete Phase 9

The work is well-scoped and the codebase patterns are clear
(`lib/video.ts` already shows the FAL-with-Replicate-fallback shape). It needs
to run somewhere with outbound access to `*.vercel.app`, `api.replicate.com`,
`queue.fal.run`, and `api.elevenlabs.io`. Either:

- **(a)** Re-launch this task in a Claude Code environment whose network policy
  allowlists those hosts (or uses an unrestricted policy), or
- **(b)** Run the implementation locally where those hosts are reachable, using
  `scripts/smoke-prod.sh` as the gate after each commit, reverting on red.

Once unblocked, the per-item plan from `BUILD_PROMPT_PHASE9.md` (Items 1–5) is
implementable as documented, and `scripts/smoke-prod.sh` + `npx tsc --noEmit`
+ `npm run build` are the acceptance bar.

## Endpoints still depending on FAL

Unchanged from before this phase — the swaps were **not** performed (see above).
FAL is still referenced by `lib/fal.ts`, `lib/images.ts`, `lib/showcase.ts`,
`lib/ugc.ts`, `lib/stitch.ts`, `lib/video.ts`, `lib/video-meta.ts`,
`lib/postprocess.ts`. None could be migrated without Replicate reachability.

## Branch note

The build prompt names branch `claude/phase9-prod-hardening`, but the harness
configured this session to develop on `claude/inspiring-cerf-tJCuz` with an
explicit "never push to a different branch without permission" rule. These docs
were committed to `claude/inspiring-cerf-tJCuz` to respect that rule. Say the
word and I'll move them to `claude/phase9-prod-hardening`.
