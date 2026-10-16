# 0006 Auth: Supabase email + password, admin invites, Brevo SMTP

**Status:** accepted · 2026-10-16

## Context
The spec asks for email + password sign-in, accounts created only through an admin
invite, password reset, and deactivation that blocks sign-in (FR-001, FR-003, FR-004,
FR-006). Supabase's built-in mailer is for testing only: it sends to the project
team's own addresses, a few per hour. Real invites need a custom SMTP server.

## Decision
- **Supabase Auth**, email + password. **Public sign-ups are disabled** in the
  project settings. In the local `supabase/config.toml` that's
  `[auth] enable_signup = false`.
- **Invite:** the admin's Server Action first calls `whoami()` with the admin's own
  session and refuses unless the caller is an active admin. It then uses the server-only
  Supabase secret key to call `auth.admin.inviteUserByEmail`. After that it calls
  `admin_create_profile` (security definer, admin-only). A user with no profile row has
  no role, so policies give them nothing, even if sign-up were switched back on by
  mistake.
- **Email links** use the SSR `token_hash` pattern (`/auth/confirm` → `verifyOtp`),
  then go to `/set-password`. Password reset follows the same route.
- **Deactivation** is enforced twice. The database helper `private.current_role()`
  returns null for inactive users, so every policy and function denies them even while
  an old JWT is still valid. Auth also bans the user (`ban_duration`), so they can't
  sign in or refresh. Reactivation removes the ban.
- **Sign-in errors** use one generic message for wrong password, unknown email and
  banned account.
- **SMTP: Brevo Free** (300 emails a day, no payment method, one verified sender
  address, so no domain is needed). The credentials are entered only in the Supabase
  dashboard and never touch the repo or app env. Locally, the Supabase CLI captures
  emails in its built-in mail viewer (Mailpit), so local work needs no Brevo.
- The secret key (`SUPABASE_SECRET_KEY`) lives only in server code (`import
  'server-only'`) and in Cloudflare secrets. It never reaches the browser.

## Consequences
- Sam creates a free Brevo account and verifies one sender address before the auth
  issue ships. This is a new service, approved 2026-10-16.
- With custom SMTP, Supabase still rate-limits auth emails (about 30 an hour by
  default, adjustable). That's plenty for this team.
- Invites need the secret key in a Server Action. The key is used only after a
  database-side admin check, and an integration test covers it.
