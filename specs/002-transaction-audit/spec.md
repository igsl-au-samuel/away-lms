# Feature Specification: Transaction audit log

**Feature Branch**: `docs/spec-002-transaction-audit`

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Transaction audit: an append-only audit log for Away. Scope is the audit log only; a balance ledger (why my balance is X) is a later feature 003, built together with carry-forward, and balance maths does not change. One append-only record of who did what, to what, when, with before/after values and a comment. Nobody can edit or delete entries, including admins. Entries are written by the database itself so the app, the MCP assistant and direct database access cannot skip it. Events: request submitted, approved, declined; allowance set or removed (absorbing the existing allowance change log); user created, role, region or active status changed; leave-type setting changes. Existing history is backfilled. Visibility: admin sees all, employee sees their own, manager sees their own plus requests they can decide. Entries are kept forever, including for deleted users, with a name snapshot. UI: an admin Audit page (filters and CSV export) and a 'My history' list."

## Context

Away already records some history: each request keeps its decider, outcome and
comment (001 FR-020), and a small log records allowance changes (001 FR-008a). Nothing
records the rest. If a role is changed, a user is deactivated or a leave type is edited,
there is no trail. When someone asks "who approved that?" or "why did my allowance
change?", the answer depends on someone's memory.

This feature adds one trustworthy record of everything that changes leave, people and
leave-type settings. It answers *who did what, to what, when, and what changed*. It is
deliberately not a balance ledger. Explaining *why a balance is X* (a running ledger)
comes later as feature 003, together with carry-forward. Balance calculation does not
change here.

## Clarifications

### Session 2026-11-02 (decisions made with Sam before this spec)

- Q: Audit log only, or also a balance ledger? → A: Audit log only. A ledger is feature
  003, built together with carry-forward. Balance maths is untouched.
- Q: Who may edit or delete entries? → A: Nobody, including admins.
- Q: Who writes entries? → A: The database itself, so no route into the data (the web
  app, the MCP assistant, direct database access) can skip it.
- Q: Which events? → A: Request submitted, approved, declined; allowance set or removed
  (this absorbs the existing allowance change log); user created, role changed, region
  changed, active status changed; leave-type setting changes.
- Q: What happens to existing history? → A: It is backfilled from existing requests and
  allowance changes.
- Q: Who sees what? → A: Admin sees all. Employee sees their own. Manager sees their
  own plus requests they can decide.
- Q: How long are entries kept? → A: Forever, including for deleted users, with a name
  snapshot.
- Q: Which screens? → A: An admin Audit page (filters and CSV export) and a "My history"
  list.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Every change leaves an unalterable record (Priority: P1)

Whenever a leave request is submitted, approved or declined, an allowance is set or
removed, a user is created or has their role, region or active status changed, or a
leave-type setting is changed, one entry is recorded. It states who did it (and in
which role at that moment), what was done, to which thing and person, when, what the
values were before and after, and any comment. Nobody can alter or remove an entry.
This holds however the change was made: through the web app, through the MCP assistant
or directly in the database.

**Why this priority**: Without the trustworthy record there is nothing for any screen
to show. It is also the part that cannot be added later without gaps, so it comes first.

**Independent Test**: Make each kind of change by each route (web app, MCP assistant,
direct database change) and check that exactly one matching entry exists per change.
Then try to edit and delete entries as employee, manager and admin and confirm every
attempt is refused and the entry is unchanged.

**Acceptance Scenarios**:

1. **Given** an employee submits a request, **When** it is saved, **Then** one entry
   records the employee as actor and subject, the action "request submitted", the
   request, and its dates and type as the after-values.
2. **Given** a manager approves a request with a comment, **When** the decision is
   saved, **Then** one entry records the manager as actor (with the manager role), the
   requester as subject, the before status (pending), the after status (approved) and
   the comment.
3. **Given** an admin sets an employee's allowance for a year, **When** it is saved,
   **Then** one entry records the old and new days. Removing the override records the
   new value as "none" and states that the default now applies.
4. **Given** an admin changes a user's role, region or active status, **When** it is
   saved, **Then** one entry records the before and after values. Creating a user
   records one "user created" entry.
5. **Given** an admin changes a leave-type setting (for example its default allowance),
   **When** it is saved, **Then** one entry records the before and after values.
6. **Given** any entry, **When** an employee, manager or admin tries to edit or delete
   it, **Then** the attempt is refused and the entry is unchanged.
7. **Given** a change made by direct database access or by the MCP assistant, **When**
   it is saved, **Then** an entry exists exactly as if the web app had made it.
8. **Given** a change that is rejected (for example an invalid decision), **When** the
   attempt ends, **Then** no entry is recorded, because nothing changed.

---

### User Story 2 - Everyone can see their own history (Priority: P2)

A signed-in user opens "My history" and sees, newest first, every entry that involves
them: things they did and things done to them. Examples are their submitted requests,
the decisions on them, allowance changes to their entitlement and changes to their
role or region. A manager's list also includes the entries for requests they are
allowed to decide.

**Why this priority**: This is how most people use the feature day to day, and it
makes the record visible to the people it is about. It needs no admin tooling.

**Independent Test**: Sign in as an employee, a manager and an admin in turn. Check
that each sees exactly the entries their role allows and no others, and that an
employee never sees a colleague's entries.

**Acceptance Scenarios**:

1. **Given** an employee with entries of their own and a colleague with entries of
   theirs, **When** the employee opens "My history", **Then** they see only their own.
2. **Given** a manager, **When** they open "My history", **Then** they see their own
   entries plus entries for requests they can decide (employee and admin requests),
   and nothing about other managers' requests.
3. **Given** a request was approved by someone since removed from the system, **When**
   the requester opens "My history", **Then** the entry still appears and shows the
   approver's name as it was at the time.
4. **Given** a user with no entries yet, **When** they open "My history", **Then**
   they see a clear empty state.
5. **Given** many entries, **When** the user scrolls or pages, **Then** older entries
   load without losing order.

---

### User Story 3 - Admin investigates with the Audit page (Priority: P3)

The admin opens an Audit page showing every entry for everyone. They filter by person
(actor or subject), action, entity, date range and role, and export the filtered
result as a CSV file for sharing or archiving.

**Why this priority**: It is the admin's investigation and compliance tool, valuable
but dependent on the record (P1). "My history" (P2) already serves individuals.

**Independent Test**: With a mix of entries from several people and kinds of change,
apply each filter alone and in combination, and confirm only matching entries show.
Export, and confirm the file has the same rows and values as the screen.

**Acceptance Scenarios**:

1. **Given** the admin opens the Audit page, **When** it loads, **Then** all entries
   show newest first.
2. **Given** the admin filters by person, action, entity, role or date range, **When**
   the filter applies, **Then** only matching entries show, and combined filters narrow
   further.
3. **Given** a filtered view, **When** the admin exports CSV, **Then** the file holds
   exactly the filtered entries with all columns, with dates in the admin's timezone
   and the before/after values readable.
4. **Given** an employee or manager, **When** they try to open the Audit page,
   **Then** access is refused.
5. **Given** entries about a deleted user, **When** the admin views or exports them,
   **Then** they appear with the user's name snapshot.

---

### User Story 4 - Existing history is carried over (Priority: P4)

On rollout, history that already exists (past requests with their decisions, and the
allowance change log) appears as audit entries, so the record does not start empty
and the old allowance log is no longer a separate place to look.

**Why this priority**: It makes the first day useful but can ship after the live
recording works. Without it the audit log simply starts from rollout.

**Independent Test**: Load a database with known requests and allowance changes, run
the rollout, and check that every one has a matching entry with the original time and
people, and that nothing is duplicated if the rollout is repeated.

**Acceptance Scenarios**:

1. **Given** existing requests (pending, approved, declined), **When** the rollout
   runs, **Then** each gets a "submitted" entry and, if decided, a decision entry,
   using the original times, people and comments.
2. **Given** existing allowance changes, **When** the rollout runs, **Then** each
   becomes an allowance entry with its original old and new days, person, time and
   reason, and none are lost.
3. **Given** the rollout has run, **When** it is run again, **Then** no entry is
   duplicated.
4. **Given** the rollout is complete, **When** viewing allowance history anywhere in
   the app, **Then** it comes from the audit log alone.

---

### Edge Cases

- **Deleted user**: Entries about or by a deleted user stay forever. They show the
  name (and role) captured when the entry was written, so they remain readable.
- **Name or email changes later**: The snapshot keeps the name as it was at the time.
  Entries are not rewritten.
- **Demo users**: The demo reset and remove actions delete demo users and their rows.
  Their audit entries stay (the log is never deleted from) and are labelled "Demo",
  so the admin can filter them out.
- **Demo load**: Loading demo data produces entries like any other change. These
  carry the "Demo" label, so the Audit page is not cluttered by them by default.
- **System-made changes**: A change made with no signed-in person (for example a
  rollout step or the demo loader) records the actor as "System", not blank.
- **Failed or rolled-back change**: No entry is kept for a change that did not happen.
- **No-op update**: Saving a user or setting without changing any audited value
  records nothing.
- **Several fields changed at once**: One save that changes role and region records
  entries that together show all the before/after values, and none are lost.
- **Admin acting on themselves**: Allowed changes by an admin to their own record are
  recorded like any other (the rules on what they may do are unchanged, 001 FR-019).
- **Large volumes**: The log only grows. Lists and exports must stay usable as it grows
  (paged lists, bounded exports with a clear message if capped).
- **Comment content**: Comments are shown as plain text, never interpreted, including
  in CSV (guard against spreadsheet formula injection).
- **Security-sensitive values**: No password, token or secret is ever stored in an
  entry's before/after values.
- **Clock and order**: Entries are ordered by recorded time and, if equal, by the
  order they were written.

## Requirements *(mandatory)*

### Functional Requirements

#### Recording

- **FR-001**: The system MUST keep one audit log in which each entry records: when it
  happened, who did it (actor) and the actor's role at that moment, what was done
  (action), which kind of thing (entity) and which one, the person it concerns
  (subject), the values before and after, and an optional comment.
- **FR-002**: The system MUST record an entry for each of these events: leave request
  submitted; leave request approved; leave request declined; allowance set; allowance
  removed; user created; user role changed; user region changed; user active status
  changed; leave-type setting changed.
- **FR-003**: Each entry MUST be written by the database itself as part of the change,
  so a change made through the web app, the MCP assistant or direct database access
  all produce an entry, and no route can skip it.
- **FR-004**: An entry and the change it describes MUST succeed or fail together. A
  change MUST NOT be saved without its entry, and an entry MUST NOT exist for a change
  that was not saved.
- **FR-005**: The system MUST NOT allow any user, including admins, to edit or delete
  an entry, by any route, including direct changes through the web app's access or the
  MCP assistant.
- **FR-006**: Only the system's own recording mechanism MUST be able to add entries.
  No user, role or client can insert entries directly.
- **FR-007**: The before and after values MUST hold the changed fields of the thing
  concerned, enough to show what changed. Where a field is unchanged it MAY be omitted
  from both. They MUST NOT contain passwords, tokens or other secrets.
- **FR-008**: Each entry MUST capture a snapshot of the actor's and the subject's
  display name at the time, so that entries stay readable if the person is later
  renamed or deleted.
- **FR-009**: A change made with no signed-in person MUST record the actor as "System"
  rather than leaving it blank.
- **FR-010**: Entries about demo users MUST be marked as demo so they can be filtered
  (ADR 0004). Demo users remain employees only.
- **FR-011**: Recording MUST NOT change any balance, request outcome, decision rule or
  working-day calculation. Balance maths is unchanged.

#### Retention

- **FR-012**: Entries MUST be kept forever. Deleting a user, a request or a leave type
  MUST NOT delete, change or hide any entry that refers to it.
- **FR-013**: Entries MUST NOT depend on the continued existence of the people or
  things they refer to, and removing those MUST NOT cascade into the audit log.

#### Allowance log absorbed

- **FR-014**: The existing allowance change log MUST be folded into the audit log, so
  allowance history has one home. The audit log MUST carry everything the old log
  held: the person (or "everyone" for a default change), leave type, year, old and
  new days, who changed it, when and the reason.
- **FR-015**: Wherever the app shows allowance history, it MUST read it from the audit
  log. Employees keep seeing what they could see before (their own allowance changes
  and default changes), per FR-020.

#### Backfill

- **FR-016**: On rollout the system MUST create entries from existing requests: a
  "submitted" entry for each, and an "approved" or "declined" entry for each decided
  request, using the original times, people and comments.
- **FR-017**: On rollout the system MUST create entries from every existing allowance
  change, preserving original values, time, person and reason.
- **FR-018**: The backfill MUST be repeatable without creating duplicate entries.
- **FR-019**: Backfilled entries MUST be clearly distinguishable from live ones
  (for example marked "backfilled"), because for older history the system can only
  reconstruct what it already held. Users created and role, region or status changes
  before rollout are not reconstructed, as no history of them exists.

#### Visibility

- **FR-020**: Visibility of entries MUST follow these rules, enforced where the data
  is stored, not only in the screens:
  - **Admin**: all entries.
  - **Employee**: entries where they are the actor or the subject, plus default
    allowance changes (as they can see today).
  - **Manager**: entries where they are the actor or subject, plus request entries
    (submitted, approved, declined) and allowance entries (set, removed) for people they
    can decide for (employee and admin, not other managers or themselves), plus default
    allowance changes. *(Allowance entries added at planning, 2026-11-02, so the Approvals
    page's allowance history keeps working.)*
  - **Inactive users and signed-out visitors**: none.
- **FR-021**: Leave-type setting changes other than default allowance MUST be visible
  to the admin only.
- **FR-022**: A user MUST NOT be able to learn about entries they cannot see, including
  through counts, search or export.

#### Screens

- **FR-023**: Every signed-in user MUST have a "My history" list of the entries they
  may see under FR-020 that concern them or that they can act on, newest first, paged,
  each showing time, who, what was done, to whom, the before/after change and the
  comment in plain language.
- **FR-024**: The admin MUST have an Audit page listing all entries newest first,
  paged, with filters by person (actor or subject), action, entity, role, demo or
  real, and date range.
- **FR-025**: The admin MUST be able to export the currently filtered entries as CSV,
  containing every column, with readable before/after values and times in the
  viewer's timezone (001 FR-026).
- **FR-026**: CSV and screen output MUST treat comments and names as plain text, and
  the CSV MUST neutralise values that a spreadsheet would run as formulas.
- **FR-027**: Employees and managers MUST NOT be able to open the Audit page or export.
- **FR-028**: Information MUST be conveyed by text, not colour alone, and screens MUST
  work with a keyboard and at phone width, as elsewhere in Away (001 FR-025).
- **FR-029**: Each screen MUST have a clear empty state and a clear error state.

#### Verification

- **FR-030**: Every visibility and write rule above MUST have an automated database
  test, with at least one allowed and one refused case, and rows added to the access
  matrix (project rule, 001 SC-005).
- **FR-031**: There MUST be a test for each recorded event on each route that can make
  it, and tests that edit and delete are refused for every role.
- **FR-032**: Demo data handling MUST follow ADR 0004: demo users see only what an
  employee sees, and demo load, reset and remove never alter or delete audit entries.
- **FR-033**: The decision to record by database rather than by the app, and to make
  the log append-only, MUST be written up as a decision record.

### Key Entities

- **Audit entry**: One immutable fact. Its time, actor and actor role, action, entity
  kind and identifier, subject, before and after values, comment, name snapshots,
  "demo" mark and "backfilled" mark. It refers to people and things by identifier but
  never depends on them still existing.
- **Actor**: The person (or "System") who made the change. Recorded with the role they
  held at that moment, which may differ from their role today.
- **Subject**: The person the change is about (for example the requester, or the user
  whose allowance changed). Empty when a change concerns everyone, such as a default
  allowance.
- **Entity**: The kind of thing changed: leave request, allowance, user, or leave-type
  setting.
- **Action**: What happened, from the fixed list in FR-002.
- **Allowance change (retired)**: The existing log, whose content moves into audit
  entries (FR-014).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For every event type in FR-002, 100% of changes made by each route (web
  app, MCP assistant, direct database access) produce exactly one entry, verified by
  automated tests.
- **SC-002**: 0 successful attempts to edit or delete an entry by any role, including
  admins, across all routes, verified by automated tests.
- **SC-003**: A user can find who approved or declined a given request, and when, in
  under 30 seconds from opening "My history".
- **SC-004**: An admin can answer "who changed this person's role, and from what?"
  using the Audit page in under 1 minute.
- **SC-005**: 100% of visibility rules in FR-020 and FR-021 have both an allowed and a
  refused automated test, and an employee can never see another employee's entries.
- **SC-006**: After rollout, 100% of pre-existing requests and allowance changes have
  a matching entry with the original time and people, and rerunning the rollout adds 0
  duplicates.
- **SC-007**: After a user is deleted, 100% of their entries remain and show their
  original name.
- **SC-008**: Audit and "My history" lists open within 2 seconds for a log of 50,000
  entries, and a filtered export of up to 10,000 entries completes within 30 seconds.
- **SC-009**: No existing balance, request outcome or working-day figure changes
  because of this feature, verified by the existing test suite passing unchanged.

## Assumptions

- "Own" entries means those where the user is the actor or the subject.
- A manager can decide requests from employees and from the admin (not other managers,
  not their own), as in 001 FR-017–FR-019. Their audit visibility follows the same
  rule.
- Default allowance changes concern everyone, so every signed-in user can see them.
  This matches today's behaviour. Other leave-type settings are admin-only (FR-021).
  Confirmed by Sam at planning, 2026-11-02.
- Demo entries stay in the log and are labelled, rather than being purged on demo
  reset, because the log is never deleted from. The Audit page's demo/real filter
  keeps them out of the way.
- Backfilled history is approximate: only what the system already held can be
  recovered. Users and setting changes before rollout have no source, so there are no
  entries for them (FR-019).
- Request cancellation and withdrawal are backlog (001) and not audited here. When
  they ship, they add their own event.
- Calendar-sync activity and sign-in events are out of scope: they are not changes to
  leave, people or settings.
- Retention is "forever" with no archive or purge. Volume for a team of 5–15 stays
  small. Archiving is revisited if the log ever approaches free-tier limits.
- Existing balance maths, decision rules and the approval flow (001, ADR 0010) are
  unchanged.
- Depends on 001 (requests, allowances, profiles, leave types, demo handling per
  ADR 0004). Feature 003 (balance ledger and carry-forward) may later read from or sit
  beside this log, but nothing here assumes it.
- Plan mode is required before any schema or RLS work (project rule). This spec does
  not choose table layouts or policies.
