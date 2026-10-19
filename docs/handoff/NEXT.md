# Handoff → Session 57: find why /mcp uses over 10 ms CPU on Free

**Model:** sonnet · **Effort:** high. Start from a fresh branch off `main` (after PR #259 merges): `fix/mcp-cpu`.

## Goal
Find the cause of the CPU overrun and cut it, or decide it is acceptable. Measured on version
78cfac19 (#246): 24 of 26 `/mcp` requests over the 10 ms Free limit, median 34.5 ms, P90 335 ms,
worst 475 ms. All returned normally, Errors count 0 (unexplained). The biggest costs came during
the connect handshake (`initialize`, `notifications/initialized`), so don't assume cold starts.

## Done when
- A cause is named with evidence, or "not found" with what was ruled out.
- If fixable: the fix is small and tested. First remedy in `REMOTE-MCP.md` ("Checks done in the
  plan", CPU): build the `McpServer` once per isolate; only the session is per request.
  Other suspects: `getClaims` / JWKS verification, supabase-js client creation, tool registration.
- `docs/spec/REMOTE-MCP.md` and the ROADMAP CPU item updated. Lint, typecheck, `npm test` pass.
- Re-measuring needs a deploy and Cloudflare Observability: that is Sam's step. Say so and hand
  Sam the exact thing to measure; don't claim a number you didn't see.

## Files to open
- `src/app/mcp/route.ts`, `src/server/mcp/` (tools, session provider), `src/proxy.ts`
- `docs/spec/REMOTE-MCP.md` (Decision 1 measurements, CPU risk paragraph)

## Respect
- Public repo: no secrets or tokens. Authorization stays in Postgres. Budget is $0.
- `next build` OOMs on Sam's machine; use `npm test` and `build:worker` only if memory allows.
- The CPU numbers are small samples; keep saying so.

## Don't touch
Hosted Supabase and Cloudflare settings. The consent page and sign-in.
Sam's step 6 clean-up (disconnect connector, demo logins off) is still unconfirmed: ask, don't assume.
