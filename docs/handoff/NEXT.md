# Handoff → Session 04: Plan the MVP (architecture, data model, ADRs)

**Model:** opus · **Effort:** high · **Plan mode** · Schema + auth design.

## Before you start
Branch `docs/mvp-spec` (spec, constitution, ADRs 0002–0003) must be merged into `main`
first. Ask Sam whether it has been. If not, branch `docs/mvp-plan` off `docs/mvp-spec`.

## Goal
Run `/speckit-plan` for `specs/001-mvp`. This produces `plan.md`, `research.md`,
`data-model.md`, `contracts/` and `quickstart.md`, and the plan must pass the
Constitution Check.

## Decide and record (ADR each)
1. Stack: confirm or change the tentative stack in CLAUDE.md (Next.js TS · Vercel Hobby · Supabase).
2. Auth: email + password with admin invites and no public sign-up. Supabase's
   built-in mailer is heavily rate-limited, so pick a free SMTP for invite and reset
   emails. Ask Sam before adding any service.
3. RLS model: roles, colleague privacy (FR-024a), and the demo/real partition (ADR 0003, FR-029–032).
   Decide how policies get tested.
4. Holidays, working days and timezones: holiday data source for QLD, NSW and HK, and where counting runs.

## Files to open
`specs/001-mvp/spec.md` · `.specify/memory/constitution.md` · `docs/design/DIRECTION.md`
· `docs/decisions/0003-shared-instance-demo-partition.md` · `docs/ROADMAP.md`

## Decisions to respect
- All the clarifications in the spec (see its `## Clarifications` section).
- $0 budget. The repo is public: no secrets, and demo passwords stay out of git.
- ADR numbering: the next free number is 0004. Check `docs/decisions/` before writing one.

## Don't
- Don't run `/speckit-tasks` or `/speckit-implement`, write app code, or link Vercel/Supabase.

## Done when
The plan artifacts and ADRs are committed and pushed, and ROADMAP's architecture line
is ticked → `session-journal` → `next-step`.
