# Handoff → Session 20: US1 pgTAP tests, then auth implementation (T064–T071, T078)

**Model:** sonnet · **Effort:** medium

## State
T060–T063 are written but red, uncommitted, on `feat/t054-clients-tokens`. Lint passes. Typecheck and
`tests/unit/schemas-auth.test.ts` fail only because `src/lib/schemas.ts` and `src/server/admin-users.ts` don't exist.
Not yet run against the local stack: `test:integration` and e2e need Docker and `npm run seed:local -- --password <pw>`.
Commit T060–T063 first (`test: …`), and open the PR for the earlier commits.

## Goal
1. T064–T070 pgTAP tests (confirm they fail or pass against existing migrations).
2. T071: add `zod` (free), `src/lib/schemas.ts` exporting `signInSchema`, `setPasswordSchema`, `passwordResetSchema`;
   `src/actions/auth.ts`; add `invalid_credentials` to `src/lib/errors.ts`. T062 must pass.
3. T078: `src/server/admin-users.ts`. T061 must pass.
Done when lint, typecheck, `npm test`, `npm run test:integration`, `supabase test db` pass.

## Files to open
`specs/001-mvp/tasks.md` (T064–T071, T078) · `tests/integration/auth.test.ts` · `tests/unit/schemas-auth.test.ts`
· `src/lib/errors.ts` · `supabase/migrations/20261017001300_admin_people_rpcs.sql`

## Decisions to respect
- Signature contract from the tests: `inviteUser({ admin, user }, { email, full_name, role, region_code })` and
  `setUserActive({ admin, user }, id, active)` return `ActionResult`. `admin` = secret client, `user` = signed-in admin client.
- `inviteUser` must delete the auth user when `admin_create_profile` fails. `setUserActive` bans with `876000h`, unbans with `none`.
- `.env.local` is loaded via `process.loadEnvFile`. Tests use relative imports and read `E2E_PASSWORD`.
- e2e expects `/sign-in` with Email/Password labels, a "Sign in" button, a `role="alert"` containing "Invalid email or password", and `/dashboard` showing name and role.

## Don't
Touch Cloudflare, T017, or the migrations.
