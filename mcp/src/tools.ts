import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { leaveYear } from "../../src/lib/dates";
import { ERROR_COPY, GENERIC_ERROR, toActionResult, type ErrorCode } from "../../src/lib/errors";
import { bullets, dateRange, days } from "./format";
import { loadViewer, type Session } from "./session";

export type GetSession = () => Promise<Session>;
type LeaveType = { id: string; name: string };

const isoDate = z.iso.date().describe("ISO date, YYYY-MM-DD");
const year = z.number().int().min(2000).max(2100);
const requestId = z.uuid().describe("Request id, from list_pending");
const comment = z.string().trim().max(500);

const READ = { readOnlyHint: true, openWorldHint: false } as const;

export const SERVER_INSTRUCTIONS =
  "Away is the team's leave management system. Every tool acts as the one signed-in user, " +
  "and the database decides what that user may see and do. Dates are ISO YYYY-MM-DD: " +
  "work out relative dates such as 'next Friday' yourself before calling a tool. " +
  "Before submit_leave, approve_request or decline_request, tell the user exactly what will happen.";

function copyFor(code: string): string {
  return Object.hasOwn(ERROR_COPY, code) ? ERROR_COPY[code as ErrorCode] : GENERIC_ERROR;
}

function ok(text: string, data: Record<string, unknown>): CallToolResult {
  return { content: [{ type: "text", text }], structuredContent: data };
}

export function fail(code: string, hint?: string): CallToolResult {
  const text = [copyFor(code), hint].filter(Boolean).join(" ");
  return { isError: true, content: [{ type: "text", text: `${text} (${code})` }], structuredContent: { error: code } };
}

/** Case-insensitive match on an active leave type's name. */
export function resolveLeaveType(types: LeaveType[], name: string): LeaveType | null {
  const wanted = name.trim().toLowerCase();
  return types.find((t) => t.name.toLowerCase() === wanted) ?? null;
}

async function activeLeaveTypes(session: Session): Promise<LeaveType[]> {
  const { data, error } = await session.db
    .from("leave_types")
    .select("id, name")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return data;
}

/** Resolves a leave type name, or returns the failure listing the valid names. */
async function leaveTypeOrFail(session: Session, name: string): Promise<LeaveType | CallToolResult> {
  const types = await activeLeaveTypes(session);
  return (
    resolveLeaveType(types, name) ??
    fail("not_found", `No active leave type called "${name}". Choose one of: ${types.map((t) => t.name).join(", ")}.`)
  );
}

const isFailure = (x: unknown): x is CallToolResult => typeof x === "object" && x !== null && "isError" in x;

/** Builds the MCP server with every LMS tool, bound to the given session provider. */
export function createLmsServer(getSession: GetSession): McpServer {
  const server = new McpServer({ name: "away-lms", version: "0.1.0" }, { instructions: SERVER_INSTRUCTIONS });

  /** Runs a tool body with the session, turning sign-in and unexpected errors into tool errors. */
  async function run(body: (s: Session) => Promise<CallToolResult>): Promise<CallToolResult> {
    let session: Session;
    try {
      session = await getSession();
    } catch (err) {
      const code = err instanceof Error ? err.message : "unknown";
      if (code === "invalid_credentials") return fail(code, "Check LMS_EMAIL and LMS_PASSWORD.");
      if (code === "not_allowed") return fail(code, "This account has no active profile.");
      console.error("[lms] sign-in failed:", err);
      return fail("unknown");
    }
    try {
      return await body(session);
    } catch (err) {
      console.error("[lms] tool failed:", err);
      return fail("unknown");
    }
  }

  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      description: "Show the signed-in user's name, email, role (employee, manager or admin), region and timezone.",
      annotations: READ,
    },
    () =>
      run(async ({ db }) => {
        const me = await loadViewer(db);
        return ok(`Signed in as ${me.full_name} <${me.email}>: ${me.role}, ${me.region_code}, ${me.timezone}.`, me);
      }),
  );

  server.registerTool(
    "get_balance",
    {
      title: "Get leave balance",
      description:
        "Get the signed-in user's leave balance for a year, per leave type: allowance, taken, pending and available days. " +
        "Uncapped types have no allowance.",
      inputSchema: { year: year.optional().describe("Leave year (calendar year). Defaults to the current year.") },
      annotations: READ,
    },
    (args) =>
      run(async ({ db, me }) => {
        const y = args.year ?? leaveYear(me.timezone);
        const res = toActionResult(await db.rpc("get_balances", { p_user_id: me.id, p_year: y }));
        if (!res.ok) return fail(res.code);
        const lines = res.data.map((b) =>
          b.is_capped
            ? `${b.name}: ${days(b.available)} available (allowance ${b.allowance}, taken ${b.taken}, pending ${b.pending})`
            : `${b.name}: uncapped (taken ${b.taken}, pending ${b.pending})`,
        );
        return ok(`Balances for ${y}:\n${bullets(lines, "No leave types.")}`, { year: y, balances: res.data });
      }),
  );

  server.registerTool(
    "list_my_requests",
    {
      title: "List my leave requests",
      description: "List the signed-in user's own leave requests, newest first. Optionally filter by status and leave year.",
      inputSchema: {
        status: z.enum(["pending", "approved", "declined"]).optional(),
        year: year.optional().describe("Only requests in this leave year."),
      },
      annotations: READ,
    },
    (args) =>
      run(async ({ db, me }) => {
        // Managers and admins can read everyone's rows, so always filter to the caller.
        let query = db
          .from("leave_requests")
          .select("id, start_date, end_date, working_days, status, note, decision_comment, created_at, leave_types(name)")
          .eq("user_id", me.id);
        if (args.status) query = query.eq("status", args.status);
        if (args.year) query = query.gte("start_date", `${args.year}-01-01`).lte("start_date", `${args.year}-12-31`);
        const res = toActionResult(
          await query.order("start_date", { ascending: false }).order("created_at", { ascending: false }),
        );
        if (!res.ok) return fail(res.code);
        const requests = res.data.map(({ leave_types, ...r }) => ({ ...r, leave_type: leave_types?.name ?? null }));
        const lines = requests.map(
          (r) =>
            `${r.leave_type}, ${dateRange(r.start_date, r.end_date)} (${days(r.working_days)}): ${r.status}` +
            (r.decision_comment ? `. Comment: ${r.decision_comment}` : "") +
            ` [id ${r.id}]`,
        );
        return ok(bullets(lines, "No matching requests."), { requests });
      }),
  );

  server.registerTool(
    "preview_leave",
    {
      title: "Preview a leave request",
      description:
        "Check a possible leave request without submitting it: working days (public holidays and weekends excluded), " +
        "balance available beforehand, days over balance, and any problems such as overlapping leave.",
      inputSchema: {
        leave_type: z.string().min(1).describe("Leave type name, e.g. Annual. See get_balance for names."),
        start_date: isoDate,
        end_date: isoDate,
      },
      annotations: READ,
    },
    (args) =>
      run(async (session) => {
        const type = await leaveTypeOrFail(session, args.leave_type);
        if (isFailure(type)) return type;
        const res = toActionResult(
          await session.db.rpc("preview_leave_request", {
            p_leave_type_id: type.id,
            p_start: args.start_date,
            p_end: args.end_date,
          }),
        );
        if (!res.ok) return fail(res.code);
        const p = res.data[0];
        const parts = [`${type.name}, ${dateRange(args.start_date, args.end_date)}: ${days(p.working_days)}.`];
        if (p.available_before !== null) parts.push(`Available before: ${days(p.available_before)}.`);
        if (p.over_balance_days) parts.push(`Over balance by ${days(p.over_balance_days)}.`);
        if (p.errors.length) parts.push(`Problems: ${p.errors.map(copyFor).join(" ")}`);
        else parts.push("No problems; it can be submitted.");
        return ok(parts.join(" "), { leave_type: type.name, ...p });
      }),
  );

  server.registerTool(
    "submit_leave",
    {
      title: "Submit a leave request",
      description:
        "Submit a leave request for the signed-in user. It starts as pending until a manager or admin decides it. " +
        "Tell the user the type, dates and working days (use preview_leave) before calling.",
      inputSchema: {
        leave_type: z.string().min(1).describe("Leave type name, e.g. Annual."),
        start_date: isoDate,
        end_date: isoDate,
        note: comment.optional().describe("Optional note for the approver, up to 500 characters."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (args) =>
      run(async (session) => {
        const type = await leaveTypeOrFail(session, args.leave_type);
        if (isFailure(type)) return type;
        const res = toActionResult(
          await session.db.rpc("submit_leave_request", {
            p_leave_type_id: type.id,
            p_start: args.start_date,
            p_end: args.end_date,
            p_note: args.note || undefined,
          }),
        );
        if (!res.ok) return fail(res.code);
        const r = res.data;
        const over = r.over_balance_days ? ` It is ${days(r.over_balance_days)} over balance.` : "";
        return ok(
          `Submitted ${type.name}, ${dateRange(r.start_date, r.end_date)} (${days(r.working_days)}). Status: ${r.status}.${over} [id ${r.id}]`,
          { request: { ...r, leave_type: type.name } },
        );
      }),
  );

  server.registerTool(
    "team_calendar",
    {
      title: "Team calendar",
      description:
        "Show who is on leave (pending or approved) between two dates, at most 62 days apart. " +
        "Leave types are shown only where the user may see them.",
      inputSchema: { from: isoDate, to: isoDate },
      annotations: READ,
    },
    (args) =>
      run(async ({ db }) => {
        const res = toActionResult(await db.rpc("team_calendar", { p_from: args.from, p_to: args.to }));
        if (!res.ok) return fail(res.code);
        const lines = res.data.map(
          (e) =>
            `${e.full_name}${e.is_active ? "" : " (inactive)"}: ${dateRange(e.start_date, e.end_date)}, ` +
            `${e.leave_type_name ? `${e.leave_type_name}, ` : ""}${e.status}`,
        );
        return ok(bullets(lines, `Nobody is on leave between ${args.from} and ${args.to}.`), { entries: res.data });
      }),
  );

  server.registerTool(
    "list_pending",
    {
      title: "List requests awaiting my decision",
      description:
        "Managers and admins: list pending leave requests the signed-in user may approve or decline, oldest first, " +
        "with the requester's available balance. Employees get a permission error.",
      annotations: READ,
    },
    () =>
      run(async ({ db }) => {
        const res = toActionResult(await db.rpc("approval_queue"));
        if (!res.ok) return fail(res.code);
        const lines = res.data.map(
          (q) =>
            `${q.requester_name}: ${q.leave_type_name}, ${dateRange(q.start_date, q.end_date)} (${days(q.working_days)})` +
            (q.available_now !== null ? `, ${days(q.available_now)} available` : "") +
            (q.over_balance_days ? `, ${days(q.over_balance_days)} over balance` : "") +
            (q.note ? `. Note: ${q.note}` : "") +
            ` [id ${q.id}]`,
        );
        return ok(bullets(lines, "Nothing is waiting for your decision."), { pending: res.data });
      }),
  );

  const decide = (outcome: "approved" | "declined", id: string, text?: string) =>
    run(async ({ db }) => {
      const res = toActionResult(
        await db.rpc("decide_leave_request", { p_request_id: id, p_outcome: outcome, p_comment: text || undefined }),
      );
      if (!res.ok) return fail(res.code);
      const r = res.data;
      return ok(`${outcome === "approved" ? "Approved" : "Declined"} the request for ${dateRange(r.start_date, r.end_date)}. [id ${r.id}]`, {
        request: r,
      });
    });

  server.registerTool(
    "approve_request",
    {
      title: "Approve a leave request",
      description:
        "Managers and admins: approve a pending leave request by id (from list_pending). This can't be undone. " +
        "Confirm the requester and dates with the user first.",
      inputSchema: { request_id: requestId, comment: comment.optional().describe("Optional comment for the requester.") },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    (args) => decide("approved", args.request_id, args.comment),
  );

  server.registerTool(
    "decline_request",
    {
      title: "Decline a leave request",
      description:
        "Managers and admins: decline a pending leave request by id (from list_pending), with a reason the requester will see. " +
        "This can't be undone. Confirm the requester and dates with the user first.",
      inputSchema: { request_id: requestId, reason: comment.min(1).describe("Reason shown to the requester.") },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    (args) => decide("declined", args.request_id, args.reason),
  );

  return server;
}
