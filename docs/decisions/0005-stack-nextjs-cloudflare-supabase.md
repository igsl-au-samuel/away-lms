# 0005 Stack: Next.js on Cloudflare Workers, Supabase

**Status:** accepted · 2026-10-16

## Context
CLAUDE.md listed a tentative stack: Next.js (TypeScript) on Vercel Hobby with
Supabase. Checking the free tiers during planning showed that Vercel Hobby is limited
to non-commercial personal use, and Vercel counts any deployment that brings
financial gain to someone involved as commercial
([fair use guidelines](https://vercel.com/docs/limits/fair-use-guidelines)). An
internal tool for Sam's work team is a grey area. Sam chose a host whose free tier
allows commercial use.

## Decision
- **App:** Next.js 16 (App Router, React 19, Server Components and Server Actions) in
  TypeScript **6.0.x**. TypeScript 7 is out, but typescript-eslint supports only
  `<6.1`, so we stay on 6.0 until it catches up.
- **Hosting:** Cloudflare Workers **Free**, using the OpenNext adapter
  (`@opennextjs/cloudflare`, Node.js runtime) and deployed with Wrangler. Workers
  Builds (Git integration) gives a preview URL for every PR branch.
- **Data and auth:** Supabase Free (Postgres 17, Auth, RLS) through `@supabase/ssr`
  and `@supabase/supabase-js`. Schema changes are SQL migrations in
  `supabase/migrations/`, run with the Supabase CLI.
- **Local:** the Supabase CLI stack in **Docker Desktop**, which Sam installs before
  the first build session. Sam chose this over CI-only so that policy tests run in
  seconds on his machine.
- **CI:** GitHub Actions (lint, typecheck, unit tests, database and policy tests on a
  local Supabase stack, e2e smoke tests, OpenNext build).
- Unchanged and out of MVP scope: Google Calendar API and the LMS MCP server in
  `/mcp` (Phase 4).

## Consequences
- **10 ms CPU per request** on Workers Free
  ([limits](https://developers.cloudflare.com/workers/platform/limits/)). Waiting on
  the network doesn't count, so the design keeps the work in Postgres (counting,
  balances, queue) and keeps server rendering light. Heavy dependencies are avoided.
  If real pages keep hitting the limit, Netlify Free is the fallback (it also allows
  commercial use), and Next.js keeps that move cheap.
- 100,000 requests a day is far more than a team of about 15 needs.
- OpenNext doesn't support every Next.js feature yet (for example Node middleware
  from 15.2 onwards). The skeleton task checks that sessions refresh in `proxy.ts`
  and falls back to edge `middleware.ts` if they don't.
- **Supabase Free pauses after 7 days without activity**
  ([pricing](https://supabase.com/pricing)), and a holiday break could trigger that.
  A scheduled GitHub Action makes one cheap read every 3 days (Phase 2).
- Vercel is no longer used. ROADMAP Phase 2 and CLAUDE.md now say Cloudflare.
- Every service on this list is free and needs no payment method. Cloudflare Workers
  Free asks for none.
