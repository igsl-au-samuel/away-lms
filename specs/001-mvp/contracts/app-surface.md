# Contract: app surface (routes and Server Actions)

The UI follows [DIRECTION.md](../../../docs/design/DIRECTION.md) ("Ledger"): a navy
sidebar on desktop, a top bar plus bottom tabs on mobile, and status as text label +
Lucide icon. Every page except the auth routes needs a session. The role guard in
the UI is for convenience only, because the database refuses anyway
([access-matrix.md](access-matrix.md)).

## Routes

| Route | Who | Shows | Spec |
|-------|-----|-------|------|
| `/sign-in` | anon | Email + password form, generic error, "Forgot password" link | FR-001, US1-2 |
| `/forgot-password` | anon | Email form. Always shows the same confirmation | FR-006 |
| `/auth/confirm` | anon | Route handler: `verifyOtp({ token_hash, type })` → redirect `next` | FR-003, FR-006 |
| `/set-password` | invited or reset session | New password (min 10 chars) | FR-003, FR-006 |
| `/` | all | Dashboard: name, role, balances for the current leave year, upcoming leave, pending-approvals count (approvers) | US1, FR-010 |
| `/requests` | all | My requests: dates, type, working days, status, decider, comment | FR-016, US2-7 |
| `/requests/new` | all | Type, start, end, note. Live preview of working days, available balance and over-balance warning. Blocking errors listed | US2, FR-012–FR-014 |
| `/calendar?month=YYYY-MM` | all | Month grid with people as rows grouped by region. Holiday columns per region. Approved/pending labels. Prev/next month | US4, FR-024–FR-026 |
| `/approvals` | M, A | The `approval_queue()` table. Approve or decline with a comment. Over-balance flag | US3, FR-021 |
| `/profile` | all | Holiday region and timezone | US5, FR-023 |
| `/admin/users` | A | List (Demo label, inactive), invite, edit role/region, deactivate/reactivate | FR-027, US6-1, US6-2 |
| `/admin/users/[id]` | A | Allowances per type for a year, override with reason, change log | FR-008, FR-008a, US6-3 |
| `/admin/leave-types` | A | Create, rename, cap/uncap, default allowance, retire | FR-007 |
| `/admin/holidays` | A | Regions, plus holidays per region and year: add, edit, remove. Add region | FR-028, US6-4 |
| `/admin/demo` | A | Load/reset demo (enter password), disable/enable all demo logins | FR-029–FR-031 |

The allowance change log for yourself is a section of `/` (own entries), and for
managers it's under `/approvals` → requester. Non-admins who open `/admin/*` get a
403 page (US6-5).

## Server Actions

All of them parse input with zod, call the user-scoped Supabase client, and return
`{ ok: true, data } | { ok: false, code, message }`. `code` is the database error
code from [database-api.md](database-api.md). Actions marked **🔑** also use the
secret-key client (`src/server/supabase-admin.ts`, `import 'server-only'`), and only
after `whoami()` confirms an active admin.

| Action | Calls | Notes |
|--------|-------|-------|
| `signIn(email, password)` | `auth.signInWithPassword` | Any failure → `invalid_credentials` (generic) |
| `signOut()` | `auth.signOut` | |
| `requestPasswordReset(email)` | `auth.resetPasswordForEmail` | Always `ok` (no account enumeration) |
| `setPassword(password)` | `auth.updateUser` | |
| `previewLeaveRequest(input)` | `preview_leave_request` | Called while the form changes (debounced) |
| `submitLeaveRequest(input)` | `submit_leave_request` | |
| `decideLeaveRequest(id, outcome, comment)` | `decide_leave_request` | |
| `updateProfile(region, timezone)` | `profiles` update | |
| `inviteUser(input)` 🔑 | `auth.admin.inviteUserByEmail` → `admin_create_profile` | If the profile step fails, it deletes the auth user (compensation) |
| `updateUser(input)` | `admin_update_user` | |
| `setUserActive(id, active)` 🔑 | `admin_set_active` → `auth.admin.updateUserById({ ban_duration })` | `'876000h'` to ban, `'none'` to lift |
| `setAllowance(input)` | `admin_set_allowance` | |
| `saveLeaveType(input)` | `leave_types` insert/update | |
| `saveRegion(input)`, `saveHoliday(input)`, `deleteHoliday(id)` | table writes | |
| `loadDemo(password)` 🔑 | delete demo auth users → create fictional employees (`is_demo`) → requests in every status → decisions recorded as the calling admin | Password min 10 chars, used for every demo login and never stored. Real rows untouched (D4) |
| `setDemoActive(active)` 🔑 | `admin_set_demo_active` → ban/unban each id | FR-031 |

## Display rules

- Dates show as `ddd d MMM yyyy` through `Intl.DateTimeFormat('en-AU', { timeZone })`.
  Plain `date` strings are formatted as calendar dates, never shifted.
- "Today" and the current leave year come from the viewer's `profiles.timezone`.
- Demo users always carry a "Demo" badge (text). Inactive users show "Inactive".
- Status badges: Pending (clock icon), Approved (check), Declined (x), each with its
  text label (FR-025).
- A negative available balance shows as "−2 days (over)" in the warning style, never
  by colour alone.
