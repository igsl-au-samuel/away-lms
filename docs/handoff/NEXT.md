# Handoff → Session 29: Phase 9 polish (T162–T165)

**Model:** sonnet · **Effort:** medium

## State
US6 is done: T140–T161 ticked. Branch `feat/t140-admin-demo` (on top of `feat/t135-profile`, on top of PR #212 → #211 → #210) is committed locally and not pushed; neither branch has a PR yet. Lint, typecheck, unit 111, integration 24, pgTAP 415 and e2e 12 pass. Session 28 also fixed `/calendar` widening the page at 390 px (commit `8b65981`).

## Goal
Phase 9 agent tasks in `specs/001-mvp/tasks.md`: T162 (axe a11y e2e), T163 (390 px mobile e2e: the admin pages and `/calendar` have 0 px page overflow now), T164 (client-bundle secret check in CI), T165 (README). T166–T168 are 🧑 manual: write instructions only.

## Done when
T162–T165 ticked; all gates pass; a11y violations found by T162 are fixed or opened as issues.

## Files to open
`specs/001-mvp/tasks.md` (Phase 9 only) · `playwright.config.ts` · `tests/e2e/fixtures.ts` · `.github/workflows/ci.yml` · `README.md` · `specs/001-mvp/quickstart.md`

## Decisions to respect
- `@axe-core/playwright` is free (OSS). Ask before adding any other dependency.
- Branch from `feat/t140-admin-demo`. PRs are stacked, not merged. Ask Sam before pushing or opening PRs for #t135/#t140.
- Demo loader stays under ~45 Worker subrequests per reset (Workers Free limit 50). Check it on a preview during T166.

## Local environment gotchas
- `next build` can run out of memory: add `experimental: { cpus: 2 }` to `next.config.ts`, don't commit it.
- Playwright: `set -a; . ./.env.local; set +a`, `--workers=1`. Kill any leftover `next start` on port 3100 first, or Playwright reuses a stale build.
- `npm run db:reset` deletes seeded users: rerun `npm run seed:local -- --password "$E2E_PASSWORD"`.
- `npm run demo:load` loads 6 demo users locally; the admin e2e removes them afterwards.
- Use the Write tool for files under `src/app/(app)/`. Shell heredocs with quotes can also fail in Git Bash.
- Locators: use `{ exact: true }` and scope to a table or region, because sr-only name copies cause strict-mode clashes.

## Don't
Touch Cloudflare or T017.
