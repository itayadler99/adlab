#!/bin/bash
# Phase 9 production smoke test.
#
# Run this from a machine/network that can actually reach the prod deploy.
# NOTE: it could NOT be run from the Claude Code cloud environment that
# generated it — that environment's network policy blocks adlab-amber.vercel.app
# (HTTP 403 "Host not in allowlist"). See STATUS_PHASE9.md / BLOCKERS.md.
set -e
BASE="https://adlab-amber.vercel.app"
AUTH="-u :montier2026"

echo "== /api/health =="
curl -s $AUTH "$BASE/api/health" | jq -r '.ready' | grep -q true

echo "== /api/showcase/start =="
r=$(curl -s $AUTH "$BASE/api/showcase/start" -X POST -H "Content-Type: application/json" \
  -d '{"productTitle":"Diamond Tennis","productImageUrl":"https://placehold.co/1080x1080.jpg","hook":"glow up"}')
echo "$r" | jq -e '.stage' || (echo "SHOWCASE FAIL: $r" && exit 1)

echo "== /api/generate =="
r=$(curl -s $AUTH "$BASE/api/generate" -X POST -H "Content-Type: application/json" \
  -d '{"prompt":"jewelry box opens"}')
echo "$r" | jq -e '.id' || (echo "GENERATE FAIL: $r" && exit 1)

echo "ALL GREEN"
