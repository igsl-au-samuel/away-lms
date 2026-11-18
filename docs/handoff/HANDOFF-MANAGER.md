# Away LMS — handoff for a new lane (manager's machine)

Prepared 2026-11-18 03:44Z, against `origin/main` at `edc93794d`. Every state claim below was
measured at that time; **re-measure before you act on it** — this repo moves.

**How to use this file.** Part A is a human checklist; an agent cannot do it for you. Part B is the
document to paste into a brand-new Qoder chat on your machine — it is self-contained and assumes the
reader has never seen this conversation. Part C records what Sam already decided, and what is still
genuinely his. Nothing here is secret — the repo is public — but production access is not in it.

---

## Part A — setup on your machine (do this before opening the chat)

You need, each signed in with **your own** accounts:

1. Qoder Desktop, signed in, with enough allowance to run a build session.
2. Node 24 (`node -v`), Git, GitHub CLI (`gh`), Docker Desktop running.
3. `gh auth login` → then **confirm which account you actually are**, and that it has **write**
   access:
   ```bash
   gh api user --jq .login            # expect your handle
   gh api repos/igsl-au-samuel/away-lms --jq .permissions
   ```
   Checked from Sam's machine on 2026-11-18 as the repo owner: your role is **write** (`push`,
   `triage`, `pull` true; `admin` and `maintain` false). Write is enough to open and squash-merge a
   PR here, because protection requires zero approving reviews and does not let you bypass checks.
   What write does **not** cover: changing branch protection, deleting the repo, and editing the
   Actions secrets — those need Sam (`admin`). Verify this again yourself; a check by someone else is
   not a check by you.
4. Clone and bring up the local stack (no cloud account needed — local dev is entirely fake data):
   ```bash
   git clone https://github.com/igsl-au-samuel/away-lms.git
   cd away-lms
   npm ci
   npx supabase start                 # Postgres, Auth, Studio, Mailpit in Docker
   npx supabase db reset              # migrations + reference seed
   cp .env.example .env.local         # fill values from `npx supabase status`
   npm run seed:local -- --password <pw>
   npm run dev                        # http://localhost:3000
   ```
   Windows: use **Git Bash**, not PowerShell, for anything with `&&`, quoting or heredocs.
5. Sanity gate before you touch a feature:
   ```bash
   npm run lint && npm run typecheck && npm test
   ```
   If any of these is red on a clean clone, **stop and report it** — you did not break it, and
   fixing it is a separate conversation.
6. **Access handover — what Sam does on his side, and how you prove it worked.** Do not assume any
   of it transferred; verify each row. Local development needs none of this, so you can start
   building while it is being arranged — but M3 and Phase V cannot.

   | Resource | Sam's action | Your verification |
   |---|---|---|
   | GitHub repo | Role is already **write**. He should raise it to **maintain**, because a secret rotation is blocked otherwise | `gh api repos/igsl-au-samuel/away-lms --jq .role_name` → `maintain`, then `gh api repos/igsl-au-samuel/away-lms/actions/secrets --jq '.secrets[].name'` → lists `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` (names only; values are never readable) |
   | Supabase project | Organization → Team → invite your GitHub email, role **Admin** (a project you can only see, not administer, will block you at the first edge function) | `npx supabase login` then `npx supabase projects list` → the project appears with its ref |
   | Hosted database **read** | Nothing beyond the project invite — the dashboard SQL Editor is enough; no password, no tunnel | In SQL Editor: `select count(*) from audit_log;` then `select version from supabase_migrations.schema_migrations order by version desc limit 5;` — the newest version must match the newest file in `supabase/migrations/` |
   | CI's Supabase credential | The `SUPABASE_ACCESS_TOKEN` secret is a **personal** access token minted at `dashboard.supabase.com → Account → Tokens`, so it belongs to whoever minted it. Either he swaps it for one you minted, or he stays the rotator forever | After the swap, run **Deploy DB** from Actions → *Run workflow*. It is idempotent: the log should end at `Remote database is up to date`. That single run proves the whole credential path without touching a row |
   | Supabase Edge Function | None beyond the project invite | The same Deploy DB run ends with `functions deploy calendar-sync`; a merge redeploys it, so a broken token breaks the function too, not just the schema |
   | Cloudflare Workers | Invite to the account, with Workers edit (the account is the one the **Workers Builds: away** check links to on any PR) | Open a preview URL from a merged PR; then confirm you can see the `away` service's Settings → Variables |
   | Brevo (auth email) | Invite to the organization, or agree who fixes deliverability | Only needed when an invite or password-reset email fails to arrive. Not blocking |
   | Qoder | Nothing — skills, connectors and automations are per machine and per account | His two automations are switched off; if you want a status digest, build your own |

   **The one genuinely load-bearing row is the CI token.** A green `Deploy DB` is not evidence the
   schema changed — only a quoted `Applying migration <version>` line, or the explicit "up to date",
   is. When that token was invalid, migrations silently stopped reaching production for four weeks
   (#366) and CI stayed green the whole time.

7. Optional: create your own gitignored `CLAUDE.local.md` / `AGENTS.local.md` for personal
   preferences (model choice, journaling, handoff style). Both are ignored by design; **never commit
   them** — the repo is public, and a personal address or key in a committed file has to be scrubbed
   out of history afterwards (that is exactly what issue #346 is still holding).

---

## Part B — paste this into a new Qoder chat

```text
You are a builder lane on Away, a leave management system. Work the repo, not your assumptions.

REPO: https://github.com/igsl-au-samuel/away-lms (public). Stack: Next.js on Cloudflare Workers
(OpenNext), Supabase Postgres + Auth, RLS with security-definer functions in a `private` schema,
pgTAP for database policy tests, Vitest unit + integration, Playwright e2e.
PRECEDENCE: docs/TEAM.md wins over everything; then CLAUDE.md; then AGENTS.md. Read docs/TEAM.md
before your first change. .qoder/rules does not exist in this repo.

## 0. Verify state before you assert it (this is the house rule)
The repo moves fast and documents lag it. Before repeating any status claim, measure it:
  git fetch origin && git log --oneline -5 origin/main
  gh pr view <n> --json mergeable,mergeStateStatus,baseRefName,isDraft
  gh pr checks <n>
Read `docs/` with `git show origin/main:docs/ROADMAP.md` — your local checkout may be days behind.
`mergeable: UNKNOWN` means GitHub has not computed it yet, NOT that there is a conflict: re-query
after ~30s. Never publish a count you did not just measure. If you publish a number and later find
it wrong, retract it in the same place, fast.

## 1. Where the project is (measured 2026-11-18 03:44Z, tip edc93794d)
- Phases 0-6 of the MVP are done and deployed. Feature 002 (transaction audit) slices 1, 2, 2b and 3
  are on `main`: `audit_log` with triggers on profiles / leave_requests / allowance_overrides /
  leave_types, append-only, the backfill, `allowance_changes` dropped, and the `/history` page live.
- Slice 4 (admin Audit page + search + CSV export) is NOT on `main`. It exists only as a pull-request
  tower (see §3).
- CI on `main` was green; the `Deploy DB` workflow for the last merge completed `success`. Note the
  standard here: a green Deploy DB does not prove the hosted schema changed — the proof is the
  `Applying migration <name>` line in that run's log. Check it if you merge a migration.
- `main` is protected: PR required, 0 approving reviews, **squash only**, the six checks
  (`lint typecheck unit build e2e integration db`) bind admins, `strict` (up-to-date branches) is
  deliberately OFF. Consequence: a green PR can be stale — re-check CI immediately before merging.
- Never push to `main` directly. Never use `@claude` on GitHub: those Action runs spend Sam's
  subscription, which is at its limit, and the review bot has been broken since #359.

## 2. The current operating mode: a deliberate fast sprint (Sam's decision, 2026-11-18)
Goal: clear the backlog as fast as possible by deferring test **authoring** to one endgame sweep.
  DEFER to Phase V: new pgTAP rows, new access-matrix rows, new unit/e2e specs, axe + phone-width
  coverage for new UI, isolation sweeps, "pin the wording" tests.
  REQUIRED INLINE, never deferred (these are not ceremony, they are evidence):
    a) the existing suite stays green — you cannot merge an untested PR anyway, the six checks bind
       admins. A PR that breaks an existing test is not fast, it is deferred work with interest.
    b) anything changing leave-day counting or balance maths: prove it by RUNNING it against seeded
       data and pasting the numbers into the PR body.
    c) anything touching grants, RLS policies or security-definer functions.
    d) any migration rewriting an audited table must state, in the PR body, how it avoids writing
       false audit entries (the A079 rule; patterns are in specs/002-transaction-audit/quickstart.md
       "Notes for migrations").
    e) any destructive drop or rename: Sam runs the production parity query FIRST. Without his
       written approval on the issue, do not land it.
  BATCHING: 2-4 related issues per PR, `Closes #n` for each. No PR-per-task. No docs PR whose only
  content is re-reading status notes.
  THE LEDGER is issue #443 "Verification sweep plan (deferred from the fast sprint)". It is a GitHub
  thread, NOT a repo file (shared files conflict between lanes). Every PR you merge adds one comment:
    PR + issues closed | what was NOT verified | risk HIGH/MED/LOW | symptom if it is broken |
    the test to write later and the file it belongs in.
  HIGH items also get a line in your milestone report. Merging without a ledger entry is how a fast
  sprint becomes an untraceable one.

## 3. The resume list — do not rebuild what already exists
As of the timestamp above, 14 PRs are open (15 counting the one that carries this document, #444).
Verify, then merge in this order. Six of them are a
**tower** (each one's base is the previous branch), and because merge is squash-only, each child
loses its parent's commits from the diff and must be **re-targeted onto `main` (and re-based) after
its parent merges**. Do not merge a child while it still points at a branch that is already gone:
  #427 feat/331-audit-filters      (DRAFT, base main)          A066 + A070
  #431 feat/336-audit-filter-bar   (base = #427's branch)      A071
  #435 feat/337-audit-admin-page   (base = #431's branch)      A072
  #436 feat/339-admin-audit-tab    (base = #435's branch)      A074
  #437 feat/338-audit-csv-export   (base = #436's branch)      A073
  #440 test/341-audit-a11y-phone   (base = #437's branch)      A076
Straight off `main`:
  #430 (A067 audit admin e2e)  #397 (A052 my-history keyset paging)  #432 (#231 requests status
  filter)  #428 (#423 bottom-bar clip detector)  #442 (#369 seed:local)  #438 (phone-width axe pass)
  #421 + #433 (docs)
Two of these (#430, #440) are **test-authoring** PRs — they predate the fast-sprint rule and are
already written, so merge them rather than duplicating. Back-fill #443's missing entries first: the
ledger currently has **zero comments**, and #425 (protected: audit search + CSV SQL, already merged
as `edc9379`) was never recorded — that is a HIGH item that exists only in git history.
After the tower is merged, slice 4 is complete, the audit feature is DONE, and the roadmap boxes for
slices 2b/3/4 get ticked **once**, in a single docs PR.

**Nothing else is moving on Sam's side.** His three builder lanes are stopped, and he is switching off
his two scheduled automations (a 30-minute fleet digest and a 30-minute exception watchdog; both are
read-only against GitHub, but each run spends his allowance — the watchdog alone takes ~5 minutes a
run). So: no replies are coming on #361, nobody will nudge you, and you should not wait on a lane.
One piece of work exists ONLY on his laptop — issue #228 (dashboard "days until each upcoming leave")
had an uncommitted edit to `src/lib/dates.ts` and never got a branch commit or a PR, so **treat #228
as unclaimed** and rebuild it if you want it. Everything else is on GitHub.

## 4. Protected areas — you MAY merge them, with four gates (Sam ratified this 2026-11-18)
docs/TEAM.md lists them: authentication and roles/permissions, leave balance calculations, the audit
log, database schema and migrations, secrets/config/CI/deployment. The written convention is "never
self-merged, both of us look". Sam is not working in parallel any more, so he has explicitly moved
that authority to you. Gates, all four required before you press squash-merge:
  1. all six checks green **on the current head SHA, re-checked after any merge landed behind you**
     (`strict` is off, so GitHub will not stop a stale-green PR — you have to);
  2. you have read the diff yourself, not only Claude's summary;
  3. the ledger comment on #443 is written (what wasn't verified, risk, symptom, test to write later);
  4. for a migration touching an audited table, the PR body says how it avoids false audit entries,
     and for any destructive drop/rename Sam's production parity result is recorded on the issue
     BEFORE the drop — no exception to this one, it is the only gate that cannot be reconstructed later.
Then open a small docs PR amending docs/TEAM.md §4 to say protected areas are merged by whoever
holds the lane, with the four gates above. Right now the doc still claims both people look, so the
first reader of this repo will get a wrong impression of who pressed the button.
Only ONE open migration at a time — and you are the only migration lane now, so that rule is about
your own queue, not about waiting on anyone.
Merging a migration has a live side effect: the `Deploy DB` workflow applies it to the **production**
database within ~90 seconds. `npx supabase db push` also targets remote by default — use
`--local --dry-run` first. If a deploy breaks production, revert the PR on GitHub; do not fix forward
on `main`.

## 5. Known landmines — do not spend your time rediscovering these
- The `review` check is meaningless: the Claude review Action has been broken since #359 and runs
  with `continue-on-error`. Green review ≠ anyone read the diff. It is not a merge blocker either.
- Infra reds are not feature reds: the Google Fonts fetch at build (#376) and the `supabase start`
  port bind (#429) redden `e2e` and `db` independently of your code. Re-run once; if it repeats,
  report as infra and move on. Do not fix infra inside a feature PR.
- `npm run db:reset` drops the Postgres container. On Sam's machine three lanes share one container
  so he cannot run it locally; on yours it is yours alone, so you CAN — say which you did, because a
  CI-read sweep and a laptop-read sweep are different evidence.
- Never assert a table is globally empty in a test; assert only on rows you created. A totals delta
  proves a test ran, not that it can fail. `test.fail` annotations turn a red into "N passed", so
  publish the measured numbers before you merge one.
- A11y coverage has three blind spots that have each bitten: empty vs populated state, phone viewport
  (a fixed bottom bar clips at 360px and document-level overflow checks cannot see it), and
  element-level state. If you add UI, note the blind spot in the ledger instead of testing it.
- `next-step` and `session-journal` skills are NOT available in Qoder (they live in `.claude/skills`,
  which this runtime does not load). So definition-of-done item 3 in CLAUDE.md cannot be produced
  here. Say that plainly when you report DoD — never fake the block, never silently skip it.
- Stale issues are a real category here: several are done-but-open (e.g. #225 / #177 Google Calendar
  sync, which docs/ROADMAP.md Phase 4 already ticks as built and tested end to end). Verify against
  the code and propose closing rather than building.

## 6. Milestones, in order
M0  Merge the resume list → audit feature complete. Back-fill #443 for #425.
M1  UI quick wins on data that already exists: #228 #229 #176 #216 #213 #214 #215 (batch into 1-2 PRs).
M2  #180 reports + CSV export — reuse slice 4's audit_search / audit_export_csv / filter-bar / export
    route pattern pointed at leave_requests. This one is cheap because slice 4 exists.
M3  Schema features, strictly one migration at a time, in this order: #175 withdraw/cancel,
    #179 attachments, #173 half-days, #178 accrual + carry-over. #178 is the riskiest item in the
    repo: restating balances is the same shape as retiring `allowance_changes`. If #178 cannot be
    done with a production parity check, STOP and escalate — do not defer that one.
M4  Stale-issue sweep (see §5) and the docs tick.
Phase V (endgame, one lane, once): db:reset + db:test + db:lint → typecheck + unit + integration +
e2e → axe every route in both schemes + phone width → write the deferred tests from #443 highest-risk
first → per-role access-matrix rows for every new read path → production deploy + re-run the parity
queries the ledger names → full suite on the deployed preview. Budget it honestly: proof was ~62% of
the lines written on the audit feature. Deferring it does not delete it.

## 7. Still Sam's to decide, even though you have full authority
Anything destructive to production data or schema (a drop, a truncate, a backfill that restates
people's balances). Anything with a cost — plan, seat, token, storage. Ownership or rotation of
accounts and secrets. Rewriting `main` history (A081, #346, open on exactly that decision). Roadmap
order, the data model, real staff data, security or compliance. If Sam is unreachable because of the
usage limit, **stop and leave the item in place** rather than approximating his decision: the repo
tolerates a paused question far better than a merged irreversible one. You are now the only lane, so
claim work by assigning yourself the issue — an unassigned issue looks unclaimed to whoever reads it
next, including you tomorrow.

## 8. Report back (every milestone, and whenever asked)
Measured numbers only: issues closed, PRs merged (count), elapsed wall clock, #443 comment delta,
HIGH items outstanding, anything you stopped on and why. No narration of intentions.

FIRST ACTIONS, in order:
1. §0 verification, then every row of the Part A step 6 access table. A row you cannot verify is a
   blocker to name now, in writing, not one to discover at Phase V.
2. Merge **#444** — the PR carrying this document. Docs-only, all six checks, nothing destructive, and
   it is the rehearsal for the whole gate loop: re-check CI at the current tip, read the diff yourself,
   squash-merge, watch the Deploy DB run say `Remote database is up to date`, and file a #443 entry
   even though nothing was deferred. If any step of that feels unclear, ask Sam to watch you do it once.
3. Back-fill #443 for **#425** (protected, already merged, already applied to production, no entry).
4. Merge the tower bottom-up — #427 → #431 → #435 → #436 → #437 → #440 — re-targeting each child onto
   `main` and re-basing it after its parent merges, and re-checking its checks before pressing squash.
5. Report M0 with measured numbers, then start M1.
```

---

## Part C — answered, and what is still genuinely unknown

Answered by Sam on 2026-11-18, so they are decided, not open:

- Your repo role is **write** (verified above); merge is yours, including protected areas, under the
  four gates in §4.
- **You take over.** Sam's lanes do not run in parallel with yours. If his usage limit is lifted he
  either stays out of your way or hands back explicitly — a lane appearing mid-sprint means the
  migration queue and #443 need re-reading, not trusting.
- Windows + Git Bash is the assumed shell for every command here.
- He intends you to have everything he has — Part A step 6 is how to make that concrete.

Still unknown, and only Sam can say:

1. Who mints the CI `SUPABASE_ACCESS_TOKEN`. Part A step 6 gives both options; the one that keeps Sam
   as the permanent rotator is the one that fails quietly the first time he is unavailable.
2. Whether his Supabase invite lands as **Admin** or something lesser, and whether your GitHub role is
   raised from `write` to `maintain` (needed to rotate a secret without asking).
3. Who owns the Qoder automations during the handover. If his are switched off and you want a digest,
   create your own — do not assume a report you have not scheduled is coming.
4. Whether the roadmap tick and the docs PR in §4 get written by you or held for Sam's review, since
   they change the working agreement rather than the app.
