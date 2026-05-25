# Changelog

- 2026-05-25 — Add /api/cron/check-winners endpoint that scans Meta ROAS and alerts via webhook on ROAS > 3
- 2026-05-25 — Convert / to public landing page, move dashboard to /app
- 2026-05-25 — Implement approve workflow: drafts queue with owner approval before Meta launch
- 2026-05-25 — Add cost dashboard page with per-generation estimates, total burn, and monthly budget bar
- 2026-05-25 — feat(/spy): one-click pipeline — paste FB Ad Library URL → fetch video → transcribe → score
- 2026-05-25 — feat(/launch): pull existing Meta campaigns into dropdown with clone-and-edit support
- 2026-05-25 — Add Variations button to /generate: re-render same script with different model/style
- 2026-05-25 — Add Apify Actor wrapper in lib/apify.ts and Scrape URL button to /spy page
- 2026-05-25 — Auto-extract thumbnail from generated video using first-frame extraction via Replicate (andreasjansson/first-order-model or ffmpeg) stored as thumbnail_url in db
