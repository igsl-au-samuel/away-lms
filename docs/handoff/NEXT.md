# Handoff → Session 59: after the demo, finish Release items and the presentation

**Model:** sonnet · **Effort:** medium (opus/medium for the presentation only). Fresh session off `main`.

## State
- Sam's casual manager demo is 2026-10-21: invite the manager (Admin → Users, role Manager), approve Sam's leave,
  trigger `@claude` on #230 live. Sam is Employee on the work email; `hangyutse@gmail.com` is Admin.
- #260 (timing logs), #261 (`docs/journey/JOURNEY.md` first draft), #262 (journal s09) merged. #263 (journal s58) open.
- Temporary `[mcp-timing]` logs are deployed in `src/server/mcp/handler.ts`.

## Do
1. Add the demo outcome to the "Live demo" section of `docs/journey/JOURNEY.md` (what was shown, delays, errors, how handled).
2. Sam reads `[mcp-timing]` + cpuTimeMs in Observability after a few connect cycles; then remove the counter,
   `marks` and the second `log(` in `handler.ts` plus the test line in `tests/unit/mcp-route.test.ts`.
3. Sam: demo logins off or change the demo password; human approval back on for `main`; rehearse remote MCP with Claude chat.
4. Interactive HTML presentation (Phase 6) from `JOURNEY.md`. Re-run the ccusage project match for fresh numbers.
5. Tick `docs/ROADMAP.md`: runbook (`docs/DEMO.md` exists, check it), autonomous run, journey document, metrics.

## Don't touch
Hosted Supabase and Cloudflare settings, consent page, sign-in. No secrets (public repo). `next build` OOMs on Sam's machine.
The Supabase tool points at the local Docker DB, not hosted.
