# Feature Specification: Away MVP — team leave management

**Feature Branch**: `docs/mvp-spec`

**Created**: 2026-10-16

**Status**: Draft

**Input**: User description: "Away MVP — team leave management. Problem: today leave is requested by email/chat and balances are tracked in a spreadsheet, so there is no single view of who is away, balances drift, and approvals get lost. One team with one manager (~5–15 people) plus an admin. Core: email + password sign-in with roles; leave types with yearly allowances; full-day requests counted in working days per the employee's holiday region; manager approve/decline (admin approves the manager); team calendar with Brisbane (QLD), Sydney (NSW) and Hong Kong public holidays; per-employee holiday region and timezone; admin settings and fictional seed data. Everything else is backlog for demo issues."

## Context

Today the team requests leave by email or chat, and someone tracks balances in a
spreadsheet. Nobody has a single view of who is away, balances drift from reality, and
requests get lost in inboxes. The team works from three places (Brisbane, Sydney and
Hong Kong), and each has its own public holidays. That makes "who's in on Monday?"
harder to answer than it should be.

Away replaces the email-plus-spreadsheet process for one team: one manager, about 5–15
employees, and an admin.

## Clarifications

### Session 2026-10-16

- Q: How does a new team member get an account? → A: Admin invite; the invitee sets
  their own password; no public sign-up.
- Q: When does the leave year run? → A: Calendar year, 1 Jan – 31 Dec.
- Q: What if a request exceeds the available balance? → A: Allow it with a warning,
  flag it "over balance by N days" to the approver; balance may go negative.
- Q: What can colleagues see about someone else's leave? → A: Name, dates and status
  only. Leave type and note are visible only to the requester, manager and admin.
- Q: Does the team use the same instance as the demo? → A: Yes, one shared instance.
  Demo records are flagged, isolated from real ones on reset, and can be switched off.
- Q: Are leave types without an allowance supported? → A: Yes. A type can be uncapped:
  it is approved and shown like any other, and days are totalled with no balance.
- Q: Keep a history of allowance changes? → A: Yes. Each override records the old and
  new value, who made it, when and an optional reason. The user, manager and admin can
  see it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign in and see my balances (Priority: P1)

An employee signs in with their email and password. Their home screen shows how much
of each leave type they have left this leave year, and how much is already taken or
waiting for approval.

**Why this priority**: Everything else depends on it. On its own it already replaces
the shared spreadsheet as the place to check your balance.

**Independent Test**: Seed one employee with allowances and some approved and pending
leave, sign in as them, and check each balance shown against a manual calculation.

**Acceptance Scenarios**:

1. **Given** an active account, **When** the user signs in with the correct email and
   password, **Then** they reach their home screen showing their name, role and
   balances.
2. **Given** a wrong password, **When** the user tries to sign in, **Then** access is
   refused with a generic message that does not say which field was wrong.
3. **Given** an employee with 20 days of annual leave, 3 days approved and 2 pending,
   **When** they view balances, **Then** annual leave shows 15 available, 3 taken and
   2 pending.
4. **Given** a deactivated account, **When** that user tries to sign in, **Then**
   access is refused.

---

### User Story 2 - Request leave (Priority: P1)

An employee picks a leave type and a start and end date, and can add a note. Before
submitting, they see how many working days the request uses: weekends and the public
holidays of *their own* region are excluded. Once submitted, the request is pending
and the days are held against their balance.

**Why this priority**: This is the core action that replaces the email request.

**Independent Test**: As a Brisbane employee, request a range that includes a
QLD-only public holiday. Confirm the count excludes that day and the weekend, and that
the request appears as pending in their list with the balance reduced.

**Acceptance Scenarios**:

1. **Given** a Brisbane-region employee, **When** they request Monday–Friday of a week
   that contains a QLD public holiday, **Then** the request counts 4 working days.
2. **Given** a Sydney-region employee requesting the same week, where that day is not
   an NSW holiday, **When** they view the count, **Then** it shows 5 working days.
3. **Given** a valid request, **When** the employee submits it, **Then** its status is
   Pending and their available balance for that type drops by its working days.
4. **Given** a range that contains no working days (e.g. a weekend only), **When** the
   employee tries to submit, **Then** submission is blocked with an explanation.
5. **Given** a range that overlaps one of the employee's own pending or approved
   requests, **When** they try to submit, **Then** submission is blocked.
6. **Given** a request that would use more days than the employee has available,
   **When** they submit, **Then** they are warned with the shortfall but can still
   submit. The request is flagged "over balance by N days" for the approver, and the
   available balance can go negative.
7. **Given** submitted requests, **When** the employee opens "My requests", **Then**
   they see each request's dates, type, working days, status and any approver comment.

---

### User Story 3 - Approve or decline requests (Priority: P1)

The manager sees a queue of pending requests from employees and approves or declines
each one, with an optional comment. The admin approves or declines the manager's own
requests and can also act on any employee request when the manager is away. Nobody can
decide their own request.

**Why this priority**: Without a decision the flow is not closed. This is what stops
approvals getting lost.

**Independent Test**: Submit requests as an employee and as the manager. Confirm the
manager can decide only the employee's request, the admin can decide both, and no one
can decide their own.

**Acceptance Scenarios**:

1. **Given** a pending employee request, **When** the manager approves it, **Then** its
   status becomes Approved and records who approved it and when. The days move from
   pending to taken in the employee's balance.
2. **Given** a pending employee request, **When** the manager declines it with a
   comment, **Then** its status becomes Declined, the held days return to the balance,
   and the employee sees the comment.
3. **Given** a pending request from the manager, **When** the manager views the
   approval queue, **Then** their own request is not actionable there. **When** the
   admin views the queue, **Then** they can approve or decline it.
4. **Given** an employee or the manager, **When** they attempt to decide their own
   request by any means, **Then** the action is refused.
5. **Given** a request that is already approved or declined, **When** anyone tries to
   decide it again, **Then** the action is refused (decisions are final in the MVP).
6. **Given** a user with the employee role, **When** they try to open the approval
   queue or decide any request, **Then** access is refused.

---

### User Story 4 - Team calendar across regions (Priority: P2)

Anyone on the team opens a month calendar. It shows who is away each day (approved
and pending, distinguishable) and the public holidays of all three regions: QLD
(Brisbane), NSW (Sydney) and Hong Kong. For example, a Sydney-based manager can see
that a Brisbane employee has a QLD-only holiday, or that the Hong Kong colleagues are
off for a Hong Kong holiday.

**Why this priority**: It answers "who's away when?", the main pain point after
requests themselves. It needs Stories 2–3 to have data to show.

**Independent Test**: With seeded leave and holidays for all three regions, open a
month and check every leave entry and every holiday appears on the right days, labelled
by region.

**Acceptance Scenarios**:

1. **Given** approved and pending leave for several people, **When** a user views the
   month, **Then** each person's leave appears on each working day it covers. Approved
   and pending are shown with different labels and icons, not by colour alone.
2. **Given** a QLD-only public holiday, **When** any user views that day, **Then** it
   is marked as a holiday for the QLD region, and QLD-region team members are shown as
   off on that day.
3. **Given** a Hong Kong public holiday, **When** a Sydney-region user views that day,
   **Then** it is marked as an HK holiday and the HK-region team members are shown as
   off.
4. **Given** declined requests, **When** anyone views the calendar, **Then** declined
   requests do not appear.
5. **Given** the calendar, **When** a user moves to the previous or next month, **Then**
   the leave and holidays for that month are shown.

---

### User Story 5 - My profile: holiday region and timezone (Priority: P2)

Each user sets their holiday region (QLD, NSW or HK) and their timezone. The region
decides which public holidays are left out of their working-day counts and which group
they appear under on the calendar.

**Why this priority**: Working-day counts are only right if the region is right. It
defaults sensibly, so it can come after the core flow.

**Independent Test**: Change a user's region from NSW to QLD. Confirm that a new
request over a QLD-only holiday now excludes that day, and that their calendar grouping
changes.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they open their profile, **Then** they can view
   and change their holiday region and timezone.
2. **Given** a user who changes region, **When** they create a new request, **Then**
   the new region's holidays are used. **And** the working days of existing requests do
   not change.
3. **Given** a user's timezone, **When** they view dates and "today" in the app,
   **Then** these are shown in their own timezone.

---

### User Story 6 - Admin settings and demo data (Priority: P3)

The admin manages the team: adds people and sets their role and region, deactivates
leavers, defines leave types and default yearly allowances, adjusts an individual's
allowance, and maintains the public-holiday lists for each region. A fictional demo
team can be loaded so the app can be shown without real data.

**Why this priority**: Seed data can cover Stories 1–5 at first. Self-service admin
comes next, so the team does not depend on a developer for changes.

**Independent Test**: As admin, create a new leave type with a default allowance, add a
user, adjust their allowance and add a holiday. Then sign in as that user and confirm
all of it shows up.

**Acceptance Scenarios**:

1. **Given** the admin, **When** they add a user with name, email, role and holiday
   region, **Then** that person receives an invitation and sets their own password to
   activate the account. There is no public sign-up.
2. **Given** a user, **When** the admin deactivates them, **Then** they can no longer
   sign in, but their past requests remain in history and on the calendar.
3. **Given** a leave type with a default allowance, **When** the admin overrides one
   person's allowance with a reason, **Then** only that person's balance changes, and
   the change log shows the old value, new value, admin, time and reason.
4. **Given** a region, **When** the admin adds, edits or removes a public holiday,
   **Then** the calendar reflects it and new requests use it for counting.
5. **Given** a non-admin user, **When** they try to reach any admin setting, **Then**
   access is refused.
6. **Given** an empty or demo environment, **When** the demo data is loaded, **Then** a
   fictional team exists. It includes one manager, one admin and employees across QLD,
   NSW and HK, with leave in every status and public holidays for the current and next
   year. Every demo record is labelled "Demo", and real users and data are untouched.

---

### Edge Cases

- A request spans two leave years: it is blocked, and the employee is asked to split
  it at the year boundary.
- A request is for past dates (recording leave already taken): it is allowed and goes
  through the normal approval.
- A holiday is added or removed after a request was submitted: the request keeps the
  working-day count from when it was submitted.
- The manager is deactivated or away: the admin can act on all pending requests.
- The admin requests leave: the manager decides it, so nobody approves their own.
- A user changes region with requests still pending: existing counts stay; only new
  requests use the new region.
- Two approvers act on the same request at the same moment: the first decision wins,
  and the second is told the request was already decided.
- A leave type is retired while people have balances: existing requests keep it, and
  it can no longer be chosen for new requests.
- Demo data is reset while real requests are pending: only demo-flagged records are
  touched; real requests and balances are unchanged.
- A demo admin tries to open a real user's request or the real admin settings: access
  is refused.
- An allowance is reduced below what is already taken or pending: the balance shows a
  negative available amount, clearly marked.

## Requirements *(mandatory)*

### Functional Requirements

#### Access & roles

- **FR-001**: Users MUST sign in with email and password. Failed sign-ins MUST NOT say
  whether the email or the password was wrong.
- **FR-002**: Every user MUST have exactly one role: employee, manager or admin.
- **FR-003**: New accounts MUST be created only by the admin, through an invitation:
  the invitee sets their own password. There MUST be no public self-registration.
  Demo accounts are the only exception (see FR-029).
- **FR-004**: Deactivated users MUST NOT be able to sign in. Their history MUST be kept.
- **FR-005**: The system MUST enforce every permission rule in this spec at the data
  level, not only by hiding UI. A user MUST NOT be able to read or change data their
  role does not allow, even by bypassing the interface.
- **FR-006**: Users MUST be able to reset a forgotten password.

#### Leave types & balances

- **FR-007**: The admin MUST be able to create, rename and retire leave types. Each is
  either capped, with a default yearly allowance in days, or uncapped (e.g. Unpaid
  leave). Uncapped types follow the same request and approval flow; the system shows
  days taken and pending but no allowance, available balance or over-balance flag.
- **FR-008**: The admin MUST be able to override the yearly allowance of a leave type
  for an individual user.
- **FR-008a**: Every allowance change MUST be recorded in a permanent change log with
  the old value, new value, who made it, when, and an optional reason. The affected
  user, the manager and the admin MUST be able to see the log entries for that user.
- **FR-009**: The leave year MUST be the calendar year (1 January – 31 December).
  Allowances reset at the start of each leave
  year, with no carry-over in the MVP.
- **FR-010**: For each user and capped leave type in the current leave year, the system MUST
  show allowance, taken (approved), pending and available (allowance − taken −
  pending).

#### Requests

- **FR-011**: Employees and managers MUST be able to submit a full-day leave request
  with a type, start date, end date (inclusive) and an optional note.
- **FR-012**: The working-day count MUST exclude Saturdays, Sundays and the public
  holidays of the requester's holiday region. The count MUST be shown before submission
  and stored with the request.
- **FR-013**: The system MUST block requests with zero working days, requests that
  overlap the requester's own pending or approved requests, requests whose end is
  before their start, and requests that span two leave years.
- **FR-014**: When a request exceeds the available balance, the system MUST warn the
  requester with the shortfall, still allow submission, and show the request to
  approvers flagged "over balance by N days". Available balance MAY go negative and
  MUST then be clearly marked.
- **FR-015**: Requests MUST have exactly one status: Pending, Approved or Declined.
  Approved and Declined are final in the MVP.
- **FR-016**: Users MUST be able to see the full list of their own requests, with
  status, working days and approver comment.

#### Approvals

- **FR-017**: The manager MUST be able to approve or decline pending requests from
  employees and from the admin, with an optional comment.
- **FR-018**: The admin MUST be able to approve or decline any pending request except
  their own. This includes the manager's requests and employee requests (fallback).
- **FR-019**: Users MUST NOT be able to approve or decline their own request.
- **FR-020**: Each decision MUST record the decider, the outcome, the time and the
  comment, and these MUST be visible to the requester.
- **FR-021**: The approval queue MUST list each pending request the viewer can decide,
  with requester, type, dates, working days, note, the requester's available balance
  for that type and any over-balance flag.

#### Calendar & regions

- **FR-022**: The system MUST support holiday regions. At launch: QLD (Brisbane), NSW
  (Sydney) and Hong Kong. Each has its own list of dated, named public holidays.
- **FR-023**: Each user MUST have one holiday region and one timezone, which they can
  change in their profile.
- **FR-024**: All signed-in users MUST be able to see a month calendar showing approved
  and pending leave for every active team member, and the public holidays of every
  region, each labelled with its region.
- **FR-024a**: Employees MUST see only the name, dates and status of colleagues' leave.
  Leave type, note and decision comment MUST be visible only to the requester, the
  manager and the admin.
- **FR-025**: Leave status and holiday region on the calendar MUST be conveyed by text
  label and icon, not by colour alone.
- **FR-026**: Dates and "today" MUST be shown in the viewing user's timezone.

#### Admin & demo data

- **FR-027**: The admin MUST be able to add users, set their role and region,
  deactivate and reactivate them.
- **FR-028**: The admin MUST be able to add, edit and remove public holidays for any
  region, and add a new region.
- **FR-029**: The system MUST provide a repeatable way to load a fictional demo team
  with leave in every status and holidays for the current and next year. Demo data MUST
  contain no real personal data.
- **FR-030**: Demo and real data share one instance. Every demo user and their
  requests MUST be flagged as demo and labelled "Demo" in the UI. Loading, resetting or
  removing demo data MUST affect only demo-flagged records, never real users,
  allowances or requests.
- **FR-031**: Demo account passwords MUST NOT be stored in the repository; they are
  supplied when demo data is loaded. The admin MUST be able to disable and re-enable
  all demo accounts in one action.
- **FR-032**: Demo and real data MUST be partitioned. Demo users see and act only on
  demo users, requests and allowances. Real users see and act only on real ones. The
  one exception is the real admin, who can manage demo accounts (FR-031). Public
  holidays and leave types are shared reference data.

### Key Entities

- **User**: a team member. Name, work email, role (employee/manager/admin), holiday
  region, timezone, active flag, demo flag.
- **Leave type**: a category of leave (e.g. Annual, Personal/Sick, Unpaid). Name,
  capped or uncapped, default yearly allowance (capped only), active flag.
  Shared by demo and real users.
- **Allowance**: a user's entitlement for one leave type in one leave year. It comes
  from the type's default unless overridden by the admin.
- **Leave request**: who, type, start and end date, working-day count (fixed at
  submission), note, status, over-balance flag, demo flag, and the decision (decider,
  time, comment).
- **Allowance change**: a permanent log entry for one allowance edit. User, leave type,
  year, old value, new value, changed by, changed at, reason.
- **Holiday region**: a set of public holidays that applies to users who choose it
  (QLD, NSW, HK).
- **Public holiday**: a named date belonging to one region.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An employee can submit a leave request in under 1 minute from signing in.
- **SC-002**: An approver can decide a pending request in under 30 seconds from opening
  the queue.
- **SC-003**: Anyone can answer "who is away on date X, and is it a holiday in QLD, NSW
  or HK?" from the calendar in under 10 seconds.
- **SC-004**: Working-day counts and balances match a hand calculation in 100% of the
  acceptance test cases, including region-specific holidays.
- **SC-005**: Every permission rule (FR-005, FR-017–FR-019, FR-024a, FR-032, US6-5) has an automated
  test proving both the allowed and the refused case, and all pass.
- **SC-006**: The spreadsheet and email requests are no longer needed. All leave for the
  team's first month of use is requested and decided in Away.
- **SC-007**: The demo team can be loaded or reset and ready to present in under 5
  minutes, with zero changes to real users' data (verified by automated test).

## Assumptions

- One team, one manager and one admin. They are two different people, since each user
  has one role. Multiple teams,
  org charts and delegation are out of scope.
- Default leave types: Annual leave (20 days), Personal/Sick leave (10 days) and
  Unpaid leave (uncapped). The
  admin can change these. Specific HK and AU statutory entitlements are not modelled.
- Weekends are Saturday and Sunday for every region.
- Public holiday lists are provided for the current and next year in demo data.
  Afterwards the admin maintains them. Automatic import from a holiday source is backlog.
- Leave dates are local calendar dates for the requester; timezone affects display
  only, not which days are counted.
- No email is sent in the MVP except account emails (invitation, password reset).
  Notifications are backlog.
- Desktop browser first. The calendar and request form must still be usable on a phone.

## Backlog (out of MVP scope)

Each item below is meant to become a small, independently shippable issue, ideally
built live through the pipeline during a demo:

1. **Half-day requests**: AM/PM halves on the first or last day; balances in 0.5 days.
2. **Email notifications**: approver emailed on submit, requester emailed on decision.
3. **Cancel / withdraw**: withdraw a pending request; request cancellation of approved
   leave, which goes back to the approver.
4. **Overlap warning**: the approver sees who else is away on those dates before deciding.
5. **Google Calendar sync**: approved leave appears on the shared team calendar
   (Phase 4).
6. **Accrual and carry-over**: monthly accrual, year-end carry-over and expiry rules.
7. **Attachments**: e.g. a medical certificate for sick leave.
8. **Reports and export**: CSV export and leave utilisation per person and type.
9. **Holiday import**: load public holidays for a region and year automatically.
