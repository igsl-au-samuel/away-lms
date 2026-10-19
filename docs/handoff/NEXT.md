# Handoff → Session 56: finish #247 after #246

**Model:** sonnet · **Effort:** low. Branch `docs/remote-mcp` (draft docs committed, not pushed).

## Goal
Sam finishes #246 (deploy, CPU time, connect Claude chat, run the demo). Then close out #247.

## Done when
- `docs/spec/REMOTE-MCP.md`: replace the `TODO(#246)` with the measured CPU numbers and whether
  `MCP_LIMITER` was accepted on Free; add a "Checks done" line for the #246 results.
- If the binding was rejected: remove the `ratelimits` entry in `wrangler.jsonc` (that is source
  outside docs; do it as its own small PR) and say so in the Limits text of `mcp/README.md`.
- `docs/DEMO.md` remote script matches what Sam actually ran; fix any step that differed.
- `docs/ROADMAP.md`: tick the #247 and #246 items.
- Lint, typecheck, `npm test` pass. Push, PR says `Closes #247`. Journal, then next-step.

## Respect
- Public repo: no secrets, no tokens; the Client ID is the only OAuth value allowed.
- `next build` OOMs on Sam's machine; docs need no build.

## Don't touch
Hosted Supabase and Cloudflare settings. The consent page and sign-in.
