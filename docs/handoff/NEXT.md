# Handoff → next session: remove the timing logs, then demo rehearsal

**Model:** sonnet · **Effort:** low. Phase 6 is done (PR `docs/phase-6-wrap-up`). What's left is in Phases 4 and 5.

## State
- Journey, metrics, concept map and presentation are in `docs/journey/` and `docs/presentation/index.html`.
- Temporary `[mcp-timing]` log is still live in `src/server/mcp/handler.ts` (counter `seq`, `marks`, second `log(`)
  plus one test line. Sam reads cpuTimeMs by `seq` in Cloudflare Observability first.
- Demo logins are deliberately ON (deviates from ADR 0004). Human approval on `main` is still OFF.

## Do
1. Ask Sam for the Observability reading (or his OK to skip it). Record it in `docs/spec/REMOTE-MCP.md` in one or two lines.
2. Remove the timing code and its test line on `fix/remove-mcp-timing`; lint, typecheck, unit pass; PR referencing #246.
3. Tick the ROADMAP Phase 4 item.
4. Then Phase 5 with Sam: rehearse the remote MCP demo in Claude chat, rehearse one `@claude` run on a
   `status:ready` issue (#176, #228–#231), record a backup, update `docs/DEMO.md` "Notes to update after rehearsal".
5. Last step before the demo: turn human approval back on for `main` (Sam, in GitHub settings).

## Don't touch
Hosted Supabase and Cloudflare settings, consent page, sign-in. No secrets (public repo). `next build` OOMs on Sam's machine.
