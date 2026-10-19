# Remote LMS MCP server: plan

Issue #233 · Spec: [`REMOTE-MCP.md`](REMOTE-MCP.md) · ADR [0014](../decisions/0014-remote-mcp-supabase-oauth.md).
Plan only. The checks the spec asked for are written up in the spec's "Checks done" section.

## Result of the checks
Nothing blocks the build. Two things to watch:
- **Rate-limit binding on Workers Free is unproven.** No price or plan limit is documented, but
  Cloudflare never says "Free" either. The design has an in-memory fallback (#243), and Sam sees
  at the first preview deploy whether it's accepted.
- **CPU is the real risk.** Workers Free gives 10 ms of CPU per invocation. It can only be
  measured on a deploy (#246). Worker size has room: gzip 1996 KiB now against a 2764.8 KiB gate.

## Build order

```text
#236 M0 (Sam) ─────────────────────────────────────────────┐
#237 B1 move core ─┬─► #239 B3 tools ─┐                      │
#238 B2 token ─────┘                  ├─► #242 B6 route ─┬─► #243 B7 rate limit ─┐
                  #240 B4 oauth+auth ─┤                  └─► #244 B8 int. tests ─┤
#237 ─► #240 ─► #241 B5 consent page ─┘ (B5 is not needed by B6)                   │
#236 ─► #245 M1 (Sam) ──────────────────────────────────────────────────────────────┤
                                                              #246 M2 (Sam) ◄──────┘
                                                              #247 B9 docs ◄─ #246
```

| # | Task | Ready now | Labels |
|---|---|---|---|
| #236 | M0: enable the hosted OAuth server, look at JWT keys | yes | `manual` |
| #237 | B1: move the core to `src/server/mcp` | yes | |
| #238 | B2: preview-token module | yes | |
| #239 | B3: `preview_decision` and `confirmation` on writes | after #237, #238 | |
| #240 | B4: OAuth server on locally, bearer-token checks | after #237 | |
| #241 | B5: consent page and sign-in `next` | after #240 | `accessibility` |
| #242 | B6: `/mcp` route, metadata, proxy exclusion, size gate | after #239, #240 | |
| #243 | B7: rate limit | after #242 | |
| #244 | B8: remote integration tests (refusals first) | after #239, #240, #242 | |
| #245 | M1: register the client, set Cloudflare variables | after #236 | `manual` |
| #246 | M2: preview check, connect Claude chat, demo script | after all of the above | `manual` |
| #247 | B9: docs, roadmap, journal | after #246 | `documentation` |

Only #236, #237 and #238 carry `status:ready`. The rest get it when what blocks them merges.

## Design notes that the issues rely on
- **Core location:** `src/server/mcp/` (`tools.ts`, `format.ts`, `session.ts` types and
  `loadViewer`, `confirmation.ts`, `auth.ts`, `rate-limit.ts`). `mcp/` keeps only the stdio entry,
  env reading and the password provider.
- **Token check:** `db.auth.getClaims(token)` gives signature and expiry. The route adds `iss`,
  `aud` and the `client_id` allowlist. Same code for asymmetric or legacy keys.
- **Per request:** a new `McpServer` and a new supabase-js client carrying the user's bearer. The
  `McpServer` may later be built once per isolate if CPU is tight (the session is the only
  per-request part).
- **Discovery:** the 401 names `/.well-known/oauth-protected-resource/mcp`. The same JSON is also
  served at the bare path.
- **`preview_decision`:** reads `approval_queue()` and picks the row, so no new RPC and no new
  pgTAP. If review shows a gap (for example the queue omits something the preview must show), a
  new RPC gets pgTAP refusal tests first, in its own issue.
- **Tests without a browser:** `oauthTokenFor()` runs authorize, approve and token exchange
  against local Supabase using the user's own session. The consent UI is tested separately in
  Playwright (#241).
- **Gates:** size (#242, gzip under 2.7 MiB) and CPU (#246, median under about 7 ms). If either
  fails, the fix is a smaller request or the separate-Worker fallback, written as a new issue,
  never a paid plan.

## Tests, in order of importance
1. **Authorisation refusals** (#244): no token, web-session token, other client, employee on
   manager tools, own-request decisions, deactivated user, decided request, other people's data
   through `team_calendar`.
2. **Write guard** (#238, #239, #244): every bad `confirmation` is refused with zero RPC calls
   and zero rows written.
3. **Token checks** (#240): unit, with a generated key; integration, with real OAuth tokens.
4. **Route behaviour** (#242): methods, 401 before any Supabase call, metadata, log redaction.
5. **Consent page** (#241): e2e, accessibility, deactivated user cannot approve.
6. **Happy paths** (#244): employee submit, manager approve, the demo sequence.
7. **Manual** (#246): connect Claude chat to a preview and run the demo, then disconnect.

No new pgTAP: there are no new policies or RPCs. The access-matrix rows that the remote path
touches (10 to 20) are already covered by pgTAP; #244 proves they hold through the MCP route.

## Security checklist
Tick each line in #247, with the test or PR that proves it.

- [ ] No secret key in the MCP code path; the route refuses a privileged key (#242).
- [ ] Every request is checked in order: bearer, signature and expiry, `iss`, `aud`, `client_id`
      allowlist (#240). An empty allowlist rejects all.
- [ ] 401 responses are identical for every cause and carry `WWW-Authenticate` (#240).
- [ ] Web-session tokens and tokens from other clients are refused (#240, #244).
- [ ] Authorization is only RLS and RPCs; the tool list does not change by role (#239, #244).
- [ ] Writes need a `confirmation` bound to user, tool and arguments; bad ones are refused before
      any RPC (#238, #239).
- [ ] `MCP_CONFIRM_SECRET` is a Cloudflare secret, 32+ characters, not in the repo (#245).
- [ ] Dynamic client registration is off locally and hosted (#240, #236).
- [ ] The consent page shows the redirect host and the user, refuses inactive profiles, and
      validates `next` with `safeNext` (#241).
- [ ] Rate limit before verification (per IP) and after (per user) (#243).
- [ ] Logs hold tool name, user id, outcome and duration only (#242).
- [ ] Errors use the app's copy; no stack, SQL or token text reaches a client (#242).
- [ ] `/mcp` and `/.well-known/*` are excluded from the session proxy (#242).
- [ ] A deactivated user is refused on the next call (#244).
- [ ] No `.env*`, token, Client Secret or key in the repo, issues or docs (#247).
- [ ] The Client ID is the only OAuth value in the repo, and it isn't a secret (#245, #247).

## Sam's manual steps (all `manual` issues)
0. **#236:** hosted Supabase: look at JWT signing keys, enable the OAuth server, consent path
   `/oauth/consent`, dynamic registration off, site URL.
1. **#245:** register the public client (both Claude callback URLs), then set
   `MCP_ALLOWED_CLIENT_IDS` and the secret `MCP_CONFIRM_SECRET` in Cloudflare.
2. **#246:** read CPU time on a preview, connect Claude chat, run the demo as employee and
   manager, disconnect.

## Not in this plan
Admin tools, `cancel_request`, "connected apps" revoke page, elicitation, other tenants (spec).
