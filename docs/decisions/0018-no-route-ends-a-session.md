# 0018 No route ends a session

**Status:** accepted · **Decided by:** Sam, 2026-11-17

**Context:** `src/app/auth/sign-out/route.ts` ended the session on GET, so any page
could sign a user out with an embedded image, and a prefetched `<Link>` to it would do
the same without an attacker visiting at all (#217). Its only two callers were the app
layout's redirect for a signed-in account with no active profile, and one step of
`tests/e2e/admin.spec.ts` that cleared cookies on the following line anyway. The nav bar
has always used the `signOut` Server Action, never the URL.

**Decision:** Delete the route rather than restrict it to POST. Sign-out happens in a
Server Action (`src/actions/auth.ts`), where Next.js checks the request origin for us,
and from no URL at all. The profile-less account now lands on `/sign-in?error=no_profile`,
and `tests/e2e/smoke.spec.ts` asserts the old path is 404 for both GET and POST.

**Consequences:** Nothing is left to defend at that path, so the fix cannot be undone by
someone relaxing an origin check later — but anyone who wants a sign-out link must use the
Server Action instead of adding a route back. The profile-less session is now made inert by
the layout on every request rather than cleared by a redirect: its cookie survives until the
next sign-in replaces it, and grants nothing, because every page under `src/app/(app)` fails
the same profile check first.
