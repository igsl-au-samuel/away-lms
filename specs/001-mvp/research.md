# Research: Away MVP

Phase 0 output for [plan.md](plan.md). Every Technical Context unknown is resolved
here. The bigger decisions have ADRs (0004–0008), and this file links to them rather
than repeating them.

## R1. Hosting: Vercel Hobby or something else

- **Decision:** Cloudflare Workers Free with `@opennextjs/cloudflare` (1.20.x, Node.js
  runtime), deployed by Wrangler 4. PR previews come from Workers Builds'
  non-production branch builds. → [ADR 0005](../../docs/decisions/0005-stack-nextjs-cloudflare-supabase.md)
- **Rationale:** Vercel Hobby is non-commercial only, and an internal work tool is a
  grey area. Workers Free has no such limit and asks for no payment method. OpenNext
  supports every Next.js 16 minor.
- **Alternatives:** Vercel Hobby (best Next.js fit, but the licence risk), Netlify
  Free (allows commercial use, 300 build minutes; kept as the fallback),
  `@cloudflare/next-on-pages` (edge runtime only, superseded by OpenNext).
- **Watch:** 10 ms CPU per request. Keep computation in Postgres, keep the dependency
  list small, and check the CPU time of real pages in the skeleton task.

## R2. Next.js and TypeScript versions

- **Decision:** Next.js 16.4.x, React 19, TypeScript 6.0.x, ESLint 10 with
  typescript-eslint 8.x, Vitest 5, Playwright 1.64, zod 4 for input parsing.
- **Rationale:** typescript-eslint's peer range is `typescript >=4.8.4 <6.1.0`.
  TypeScript 7.0 (the native port) would break lint. OpenNext's peer range is
  `next >=16.4.1`.
- **Alternatives:** TypeScript 7 with no type-aware lint (rejected: lint is a merge
  gate).

## R3. Session handling with @supabase/ssr on OpenNext

- **Decision:** `@supabase/ssr` cookie sessions. A request hook refreshes the
  session; try Next 16's `proxy.ts` first, and if OpenNext rejects Node proxy, use
  edge `middleware.ts`. Server Components read the user with `auth.getUser()` (a
  verified call), never with `getSession()` alone.
- **Rationale:** this is Supabase's recommended SSR pattern. OpenNext notes that
  Node middleware isn't supported yet, so the skeleton task proves which hook works.
- **Alternatives:** client-only auth (rejected: the server needs the session for
  Server Actions).
- **Outcome (2026-10-17, T007):** Node `src/proxy.ts` works. With a pass-through proxy
  matching every route except static assets, `npm run build:worker` succeeded (OpenNext
  bundled it as "Node.js middleware") and `opennextjs-cloudflare preview` served `/` with
  200 and an unknown path with 404. OpenNext warns that Node middleware is experimental
  and that Windows may fail unpredictably, so this was only run locally on Windows.
  No fallback to `middleware.ts` needed. Re-check on a real Workers Builds preview
  (T010/T011) and when the Supabase session refresh is added.

## R4. Auth emails: SMTP provider

- **Decision:** Brevo Free SMTP relay (300 a day, one verified sender, no domain). →
  [ADR 0006](../../docs/decisions/0006-auth-invites-brevo-smtp.md)
- **Alternatives:** Resend (needs a domain to reach other people), Gmail SMTP with an
  app password (uses a personal address and a sensitive secret), Supabase's built-in
  mailer (sends only to the project team, a few an hour).

## R5. Where authorization lives

- **Decision:** RLS on every table for reads. Security definer RPCs for business
  writes and computed reads, each checking the caller with `private.*` role helpers.
  A security definer `team_calendar()` gives colleague privacy at column level. →
  [ADR 0007](../../docs/decisions/0007-rls-model-and-policy-tests.md)
- **Rationale:** RLS can hide rows but not columns. Writes need values computed on
  the server (working days, the decider, over-balance) and race-safe transitions.
  RPCs return stable error codes for the UI.
- **Alternatives:** RLS insert/update policies plus triggers that overwrite fields
  (equally secure, but the rules end up split across policies, triggers and column
  grants). Server-only access through the secret key (rejected: it moves the control
  out of the database, against Constitution III). Roles in custom JWT claims
  (rejected: a change waits for the token to refresh, and it adds an auth hook).

## R6. Policy testing

- **Decision:** pgTAP through `supabase test db` against the local stack (Docker
  locally, `supabase/setup-cli` in CI). A local helper switches between `anon` and
  `authenticated` and sets `request.jwt.claims`. Each test file runs in a rolled-back
  transaction.
- **Alternatives:** the `basejump-supabase_test_helpers` dbdev package (a third-party
  install for about 20 lines we can write ourselves). JS integration tests only
  (slower, harder to cover every case). PGlite (no Supabase `auth` schema or roles).

## R7. Holiday data source

- **Decision:** a committed seed for 2026–2027 from official government lists (QLD
  including Ekka, NSW statutory, HK general holidays). It is applied by the seed
  migration and editable by the admin afterwards. →
  [ADR 0008](../../docs/decisions/0008-holidays-working-days-timezones.md)
- **Alternatives:** the `date-holidays` npm package at runtime (adds weight to the
  Worker, and its QLD show-day rules are by locality), the data.gov.au Australian
  Holidays dataset and the HK 1823 JSON fed through an import job (that's the backlog
  "Holiday import" item).

## R8. Working-day counting and timezones

- **Decision:** count in SQL (`generate_series` over the dates, skipping
  Saturday/Sunday and the region's holidays). Store dates as plain `date`. Work out
  "today" from the viewer's IANA timezone with `Intl`. → ADR 0008
- **Alternatives:** count in TypeScript (two implementations for preview and submit
  that could drift, and a client could fake it). Use Temporal (not available on
  every target yet).

## R9. Days precision

- **Decision:** `numeric(5,1)` for allowances, working days and balances.
- **Rationale:** allowances such as 7.5 days are common, and the backlog half-day
  item then needs no change of type. Whole-day requests still produce whole numbers.

## R10. Demo data mechanics

- **Decision:** demo employees only, flagged `profiles.is_demo`. An admin-only Server
  Action loads or resets them. It checks the caller is an admin, then uses the secret
  key to delete demo auth users (which cascades to profiles, requests and overrides)
  and creates new ones with the password the admin types in. One action bans or
  unbans every demo user. The same module powers `npm run demo:load` for local use. →
  [ADR 0004](../../docs/decisions/0004-demo-employees-pad-real-team.md)
- **Alternatives:** SQL seed with hard-coded passwords (rejected: FR-031). A separate
  partition (superseded by ADR 0004).

## R11. Supabase Free pause

- **Decision:** a scheduled GitHub Actions workflow calls a cheap public RPC
  (`health()`) every 3 days using the publishable key (Phase 2 pipeline task).
- **Rationale:** projects pause after 7 days without activity, and a holiday break
  would leave the team without the app.

## R12. Allowance change log scope

- **Decision:** log every per-user override (user, type, year, old value, new value,
  who, when, reason). Also log changes to a leave type's default, with `user_id`
  null meaning everyone. Everyone sees the default-change rows, and per-user rows
  follow FR-008a.
- **Rationale:** FR-008a says "every allowance change". A changed default changes
  every user's allowance.
