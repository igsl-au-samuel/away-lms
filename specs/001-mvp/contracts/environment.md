# Contract: configuration and environment

Names only. Values live in `.env.local` (gitignored), Cloudflare (Workers Builds
variables + Worker secrets), GitHub Actions secrets or the Supabase dashboard. The
committed `.env.example` lists exactly the app variables below (Constitution II).

## App (`.env.example`)

| Variable | Where it's used | Secret? | Notes |
|----------|-----------------|---------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | no | Inlined at build time |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server | no | `sb_publishable_…`. Safe because of RLS |
| `NEXT_PUBLIC_SITE_URL` | server | no | Base for email redirect links |
| `SUPABASE_SECRET_KEY` | server only (🔑 actions, demo script) | **yes** | `sb_secret_…`. A Worker secret. Never `NEXT_PUBLIC_` |

Local values come from `supabase status` once the local stack is running.

## Outside the app

| Setting | Where | Notes |
|---------|-------|-------|
| Disable sign-ups | Supabase dashboard → Auth, plus `supabase/config.toml` | ADR 0006 |
| Custom SMTP (Brevo host, port 587, login, SMTP key, sender) | Supabase dashboard → Auth → SMTP | Never in the repo |
| Site URL + redirect allow-list | Supabase dashboard → Auth → URL config | Production URL and `*.workers.dev` previews |
| Email templates (invite, recovery) using `{{ .TokenHash }}` | `supabase/templates/*.html` (committed, no secrets) plus the dashboard | ADR 0006 |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` | GitHub Actions secrets | Only for the migration deploy job (Phase 2) |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions secrets, only if deploys don't come from Workers Builds | Phase 2 |
