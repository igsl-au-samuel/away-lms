# 0003 One shared instance for real and demo data, partitioned

**Status:** accepted · 2026-10-16

## Context
Away is both the team's real leave tool and the live demo. A separate demo instance
(Supabase Free allows two projects) was offered; Sam chose a single shared instance.
The deployed URL and the repo are public, so demo accounts must not open a path to
real people's data.

## Decision
One instance. Demo users and their requests carry a demo flag and a visible "Demo"
label. Demo and real data are partitioned at the data level: demo users see and act
only on demo data, real users only on real data. The real admin can manage demo
accounts. Leave types and public holidays are shared reference data. Demo load,
reset and remove touch only demo-flagged rows. Demo passwords are supplied when the
demo data is loaded, never committed. The admin can disable all demo accounts in one
action. (Spec FR-029–FR-032.)

## Consequences
- One deployment and one database to run, which keeps free-tier usage small.
- Every RLS policy also has to include the demo partition, which means more policy
  tests (SC-005, SC-007).
- If a partition bug ships, it exposes real data, so these tests are required for
  merge.
- Revisit if the team grows or the demo audience gets wider: a split instance remains
  the fallback.
