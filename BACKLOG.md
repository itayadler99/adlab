# AdLab Backlog

Auto-builder picks the TOP unchecked item every 12 hours.

- [x] Auto-extract thumbnail from generated video (use Replicate frame extraction or first-frame)
- [x] Apify Actor wrapper in `lib/apify.ts` for Facebook Ad Library scraping; `/spy` gets a "Scrape URL" button
- [ ] `/generate`: "Variations" button — re-render same script with different model/style
- [ ] `/launch`: pull existing Meta campaigns into a dropdown, clone-and-edit
- [ ] `/spy`: paste Facebook Ad Library URL → auto-fetch video URL → auto-transcribe → auto-score (one click pipeline)
- [ ] Cost dashboard: estimate $ per generation, total burn, monthly budget bar
- [ ] Approve workflow: drafts queue, owner approves before Meta launch
- [ ] Public landing page at `/` (move dashboard to `/app`) — convert to real SaaS
- [ ] `/api/cron/check-winners` endpoint scans Meta ROAS, alerts on ROAS > 3 via webhook
- [ ] Add Sora-2 video option once REST is exposed (currently MCP-only)
- [ ] Add Soul ID picker (Higgsfield character avatars) once REST API opens up
- [ ] Add A/B test launcher: 1 script → 2 video models → 2 Meta adsets, auto-compare ROAS after 5 days
- [ ] Auto-write 3 headline variants per launch (Itay copy style: no em-dashes, generic time pressure)
- [ ] Multi-store support: dropdown for Montier US / Sneakers / Studio / Treyzer
- [ ] Add Klaviyo integration: push winning ads as email templates
