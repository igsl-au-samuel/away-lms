# 0004 Demo employees pad the real team (supersedes 0003)

**Status:** accepted · 2026-10-16 · supersedes [0003](0003-shared-instance-demo-partition.md)

## Context
ADR 0003 planned a separate demo team (its own manager and admin) sealed off from
real data inside one instance. During planning Sam explained what the demo data is
really for. The real team is small (about 4 Australian staff), so demo data is there to
pad that team with fictional employees, which makes the calendar and approval queue
look like a real team's. Sam is the admin, and the role passes to the manager later.
A separate demo manager or admin isn't needed.

A strict partition would also put a demo/real condition into every RLS policy and
double the policy tests. That's the main cost ADR 0003 accepted.

## Decision
- One instance, **one team**. Demo users are **employees only** (a database check:
  `is_demo → role = 'employee'`).
- Demo employees show up on the real calendar and in the real approval queue,
  labelled "Demo". The real manager and admin decide their requests.
- Demo employees can sign in, so the employee view can be shown. Their passwords are
  entered when the demo is loaded and are never committed. The admin can disable and
  re-enable every demo login in one action.
- There is **no data partition**. A demo login sees colleagues exactly as any employee
  does: names, dates and status (FR-024a), and nothing more.
- Load, reset and remove touch only demo users and the rows that belong to them
  (their requests and allowance overrides). Real rows never reference demo users,
  because demo users can't decide requests or change allowances.
- Spec FR-029–FR-032, US6-6 and the edge cases were updated to match.

## Consequences
- RLS gets much simpler: the policies are role-based only, with no partition column.
- Anyone given a demo password can see real colleagues' names and leave dates. To
  limit that: demo passwords are shared only in presentations, logins are switched
  off when not presenting, and leave type and notes stay private by role.
- SC-007 (a reset never changes real data) still needs an automated test.
- Revisit if demo logins must go to people outside the team. A sealed demo team, or
  a second Supabase project, is the fallback.
