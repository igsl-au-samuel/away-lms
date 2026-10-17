# Handoff → Session 21: US1 auth UI + admin users + balances migrations (T072–T077, T079–T084)

**Model:** sonnet · **Effort:** medium

## State
T060–T071 and T078 done and committed on `feat/t054-clients-tokens` (tick in `specs/001-mvp/tasks.md`).
Lint, typecheck, `npm test` (37) and `npm run test:integration` (7) pass. `.env.local` exists locally (gitignored).
pgTAP T064–T069 are red on purpose: `get_balances`, the allowance policies and `admin_set_allowance` don't exist yet.
Nothing pushed; no PR open yet for the branch.

## Goal
1. Push the branch and open the PR (`gh pr create`).
2. T081–T083 migrations so `supabase test db` goes green, then T084 `npm run types:gen`.
3. T072–T077, T079–T080: `/auth/confirm` route, sign-in / forgot / set-password pages, `(app)` layout + nav,
   forbidden page + admin layout, `src/actions/admin-users.ts`, users page. T063 e2e should pass.
Split across two sessions if context passes ~60%: migrations first, UI second.

## Files to open
`specs/001-mvp/tasks.md` (T072–T084) · `specs/001-mvp/contracts/database-api.md` · `docs/design/DIRECTION.md`
· `src/actions/auth.ts` · `src/server/admin-users.ts` · `tests/e2e/signin.spec.ts`

## Decisions to respect
- `[auth.email] enable_signup` must stay `true` in `supabase/config.toml` (false disables all password sign-in); public signup is blocked by `[auth] enable_signup = false`.
- Error codes: P0001 with the code as message; add `type_uncapped` to `src/lib/errors.ts` with T083.
- Email templates link to `/auth/confirm?token_hash=…&type=invite|recovery&next=/set-password` (T072 must serve this).
- `signIn` redirects to `/dashboard` on success; e2e expects that route, but T087 plans `(app)/page.tsx` — reconcile.

## Don't
Touch Cloudflare, T017, or existing migrations (add new ones only).
