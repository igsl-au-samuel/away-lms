# Away

Internal leave management for our team, built as a live demonstration of an
AI-native SDLC: spec → issues → agent builds → automated verification →
human-approved merge → deploy.

Stack: Next.js 16 on Cloudflare Workers (OpenNext) · Supabase (Postgres, Auth, RLS) ·
Brevo SMTP for auth emails · GitHub Actions CI. Roles: employee, manager, admin.

## Local setup

Needs Node 24, Docker Desktop and Git Bash (Windows). No cloud accounts are required.

```bash
npm ci
npx supabase start             # Postgres, Auth, Studio, Mailpit
npx supabase db reset          # migrations + reference seed
cp .env.example .env.local     # fill from `npx supabase status`
npm run seed:local -- --password <pw>   # local admin, manager and employees
npm run dev
```

The full walkthrough and the automated gates are in
[specs/001-mvp/quickstart.md](specs/001-mvp/quickstart.md).

## Google Calendar sync

Approved leave is copied to one shared Google calendar (ADR 0013). It is off until configured.

1. Copy `supabase/functions/.env.example` to `supabase/functions/.env` and fill it in. Share the
   calendar with the service account ("Make changes to events").
2. Store the function URL and shared secret in Vault (run once per environment; the secret must equal
   `CALENDAR_SYNC_SECRET`):
   ```sql
   select vault.create_secret('<function url>', 'calendar_sync_url');
   select vault.create_secret('<shared secret>', 'calendar_sync_secret');
   ```
   Locally the URL is `http://host.docker.internal:55321/functions/v1/calendar-sync`.
3. Locally run `npx supabase functions serve calendar-sync --env-file supabase/functions/.env --no-verify-jwt`.
   On hosted, run `supabase secrets set` for the four variables. CI deploys the function.

## npm scripts

| Script | What it does |
|--------|--------------|
| `dev` · `build` · `start` | Next.js dev server, production build, production server |
| `lint` · `typecheck` | ESLint, `tsc --noEmit` |
| `test` | Unit tests (Vitest) |
| `test:integration` | Integration tests against the local Supabase stack |
| `test:e2e` | Playwright end-to-end and accessibility tests (needs `E2E_PASSWORD`) |
| `build:worker` · `preview:worker` · `deploy:worker` | OpenNext build, local Workers preview, deploy |
| `db:start` · `db:reset` · `db:test` · `db:lint` | Local Supabase start, reset, pgTAP tests, lint |
| `seed:local` | Create local test users (refuses non-local Supabase URLs) |
| `demo:load` | Load demo employees and leave |
| `types:gen` | Regenerate `src/lib/database.types.ts` from the local schema |

`node scripts/check-client-bundle.mjs` fails if secrets appear in the built client output.
CI runs it after the build.

## More

Claude chat connector (remote MCP): [mcp/README.md](mcp/README.md#remote-claude-chat) · Roadmap: [docs/ROADMAP.md](docs/ROADMAP.md) · Decisions: [docs/decisions/](docs/decisions/) ·
Journey log: [docs/journey/JOURNAL.md](docs/journey/JOURNAL.md)
