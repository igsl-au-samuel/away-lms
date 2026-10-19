# Demo script — Away, built with an AI-native SDLC

**Audience:** internal team · **Length:** ~15 min + questions
**Status:** DRAFT. Written before the app exists. Update after Phase 5 rehearsal.

## What we're proving
1. A request can go from idea to spec to issue to code to review to production with the AI doing the work and a human holding the gates.
2. The app is also usable *by AI*: Claude can read and act on live leave data through MCP.
3. The whole thing was built for $0 on free tiers, and we have the numbers to show it.

## Before the demo (checklist)
- [ ] Supabase project awake (free tier pauses when idle) — open the app once
- [ ] Demo employees loaded (`/admin/demo`) and demo logins enabled. Demo users are employees only (ADR 0004)
- [ ] Logged in as a demo employee in one browser window and as the admin (Sam) in another. The admin can decide employee requests. The Claude connector follows only one of them at a time (see Part 1)
- [ ] Claude chat: Away connector added and connected (`mcp/README.md`, "Remote (Claude chat)"), or Claude Code with the local MCP server running. Remote calls are limited to 60 a minute
- [ ] 1 small `status:ready` issue queued, tested at least once. Know its typical run time.
- [ ] Backup recording of the autonomous build saved locally
- [ ] Presentation open in a tab
- [ ] Network check, notifications off

## Part 1 — Claude as the front door (~4 min)
Shows: the MCP integration. Lead with it because it's quick and works offline from the pipeline.

| Say to Claude | What happens | Tool used |
|---|---|---|
| "What's my leave balance?" | Real balances from the database | `get_balance` |
| "Request Friday 20 November as annual leave." | Claude shows what it will submit and waits for approval, then creates a pending request | `submit_leave` |
| *(switch to admin window)* "What's waiting for my approval?" | Lists the request | `list_pending` |
| "Approve it." | Status flips; the employee's balance updates | `approve_request` |
| "Who's away next week?" | Names and dates from the team calendar | `team_calendar` |

Claude chat (remote server). Setup: [`mcp/README.md`](../mcp/README.md#remote-claude-chat). The connector is **one identity per Claude account at a time**, so the "switch to admin window" row above is not a quick swap in Claude chat unless you have two Claude accounts. To switch person: sign out of Away, sign in as the other person in the same browser, **Disconnect**, **Connect** (the consent page reuses the browser's Away session, and someone already approved goes straight back with no sign-in screen), then start a new chat. Allow a minute for it, or run the two halves as two short takes.

Every tool call asks for **Allow** in Claude chat (tools default to "Needs approval"). Writes are two-step: a preview, then the confirmed call. `approve_request` and `decline_request` need the preview token first.

1. **Employee (a demo user, such as Casey Holt).** "Who am I?" (`whoami`), "What's my leave balance?" then "Request Friday 20 November as annual leave." Claude calls `preview_leave`, shows the dates, working days and balance, and asks. Say yes, and `submit_leave` runs with the preview's `confirmation`.
2. **Switch** to the admin or manager as described above.
3. **Manager or admin.** "What's waiting for my approval?" (`list_pending`), then, naming the request: "Approve Casey Holt's 7 Dec request." Claude calls `preview_decision` first, shows who and what, then `approve_request`. Point out the Allow prompt in Claude as the human gate. Use explicit wording for a decline too: "Decline Casey Holt's 9 Dec request with the reason 'test'". A bare "go ahead" or "Approve it" once failed: Claude said its own permission check blocked the write because the confirmation did not name the action.
4. **Anyone.** "Who's away next week?" (`team_calendar`).
5. **The refusal.** As the employee, ask Claude to approve a request. Without a preview token it answers `confirmation_required`, and a preview of someone else's request gives `not_allowed`. The database says no. Nothing in Claude decides that.

Approving a demo user's request does not create a Google Calendar event (sync skips `is_demo` users). Don't promise one on stage.

Backup if the connector fails: the same script with Claude Code and the local server (`mcp/README.md`).

Talking point: Claude chose each tool itself from its description. Nobody typed "use Away".
Talking point: changes need approval before they run. Humans stay in control.
Switch to the web app after each write so people see the same data in the UI.

## Part 2 — The autonomous build (~8 min)
Shows: the pipeline. Orchestration + automated verification.

1. **Backlog.** Open GitHub Issues. Each issue follows the spec template (goal, acceptance criteria, files to touch, out of scope). Pick the queued one, for example "Overlap warning: show the approver who else is away" (spec Backlog item 4; holidays on the calendar are already in the MVP).
2. **Trigger.** Comment `@claude implement this` on the issue (in GitHub). Optional: show Claude chat doing the same through the GitHub connector, if that works.
3. **While it runs (~5–10 min), tell the story:**
   - the spec and ADRs in the repo that the agent reads
   - `CLAUDE.md` rules (scope gate, definition of done)
   - what CI will check: lint, types, tests, build
4. **Pull request appears.** Walk through: the diff, the tests it wrote, the CI checks turning green, the AI review comments, the Cloudflare preview link.
5. **Human gate.** Click the preview, check the feature. Approve and merge. Say plainly: *this is the one step AI doesn't do.*
6. **Production.** Cloudflare Workers Builds redeploys. Reload the live app and the feature is there.
7. Back to Claude: "Who else is away while that request is?" Optional; only if the MCP tool was extended.

Fallback if the run is slow or fails: say so, then play the backup recording and continue from step 4 with a pre-made PR. A failed run is also a talking point about why gates and CI exist.

## Part 3 — The story (~3 min)
Open the interactive presentation: the journey, sessions and effort, tokens and cost, lessons learnt, and what we'd do next. Keep it to the summary slide unless asked.

## Likely questions
- **Is it secure?** Row-level security and database-side role checks (with automated tests for every rule), merges need approval, secrets stay out of the repo.
- **What did it cost?** Free tiers plus the existing Claude subscription. Show the usage numbers.
- **Could we use this for real?** The MVP covers the core flow; list what's in the backlog.
- **What if the AI writes bad code?** CI, a separate AI review, and a human merge gate; show a caught example if we have one.
- **How long did it take?** Pull from the journal and metrics.

## Notes to update after rehearsal
- Actual run time of the demo issue:
- What went wrong in rehearsal:
- Timings per part:
