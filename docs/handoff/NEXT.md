# Handoff → Session 58: ship the temporary timing logs, then Release items

**Model:** sonnet · **Effort:** medium. Branch `fix/mcp-cpu` (cut from `docs/remote-mcp`; PR #259 was still open). Uncommitted: docs + `src/server/mcp/handler.ts` + one test line.

## State
- CPU overrun **accepted by Sam** (no Workers Paid). Cause: first-use setup per fresh Free isolate
  (`docs/spec/REMOTE-MCP.md`, Decision 1). Samples are small.
- Temporary `[mcp-timing] seq=N client_ms verify_ms total_ms` log added in `handler.ts`. `seq` = requests
  served by that isolate; compare cpuTimeMs by `seq`. The ms values are weak (Workers' clock only moves on I/O).
- Demo logins deliberately ON for testing (deviates from ADR 0004). Connector disconnected.

## Do
1. Commit on `fix/mcp-cpu` (`fix:`/`docs:` conventional), open the PR stacked on #259 or retarget to `main` once #259 merges. Reference #246.
2. Sam deploys and reads `[mcp-timing]` lines + cpuTimeMs in Observability after a few connect cycles. Then
   remove the counter, `marks` and the second `log(` from `handler.ts` and the test line (ROADMAP item).
3. Next roadmap items: human approval back on for `main`; rehearse remote MCP with Claude chat.

## Sam's later checks (on ROADMAP)
One week after team use: Errors card + non-ok outcomes such as `exceededCpu`. Before real colleagues:
demo logins off or change the demo password.

## Don't touch
Hosted Supabase and Cloudflare settings, consent page, sign-in. No secrets (public repo). `next build` OOMs on Sam's machine.
