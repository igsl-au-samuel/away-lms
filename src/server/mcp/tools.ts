import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { leaveYear } from "../../lib/dates";
import { copyFor, ERROR_COPY, toActionResult } from "../../lib/errors";
import { signConfirmation, verifyConfirmation, type ConfirmationTool } from "./confirmation";
import { bullets, dateRange, days } from "./format";
import { loadViewer, type Session } from "./session";

export type GetSession = () => Promise<Session>;

export type LmsServerOptions = {
  /** Writes need a token from a preview tool. Off for local stdio, on for the remote route. */
  requireConfirmation?: boolean;
  /** HMAC secret for confirmation tokens, 32+ characters. Required when `requireConfirmation` is on. */
  confirmSecret?: string;
};
type LeaveType = { id: string; name: string };

const isoDate = z.iso.date().describe("ISO date, YYYY-MM-DD");
const year = z.number().int().min(2000).max(2100);
const requestId = z.uuid().describe("Request id, from list_pending");
const comment = z.string().trim().max(500);

const confirmation = z
  .string()
  .optional()
  .describe("Confirmation token from the matching preview tool. Required when the server asks for one.");

const READ = { readOnlyHint: true, openWorldHint: false } as const;

export const SERVER_INSTRUCTIONS =
  "Away is the team's leave management system. Every tool acts as the one signed-in user, " +
  "and the database decides what that user may see and do. Dates are ISO YYYY-MM-DD: " +
  "work out relative dates such as 'next Friday' yourself before calling a tool. " +
  "Before submit_leave, approve_request or decline_request, tell the user exactly what will happen.";

// Some clients (Claude Code among them) show the model structuredContent instead of the text
// content, so the summary and any error message go in both.
function ok(text: string, data: Record<string, unknown>): CallToolResult {
  return { content: [{ type: "text", text }], structuredContent: { summary: text, ...data } };
}

/** A tool error with exactly this message. Prefer `fail`, which uses the app's copy. */
function failWith(code: string, message: string): CallToolResult {
  const text = `${message} (${code})`;
  return { isError: true, content: [{ type: "text", text }], structuredContent: { error: code, message: text } };
}

export function fail(code: string, hint?: string): CallToolResult {
  return failWith(code, [copyFor(code), hint].filter(Boolean).join(" "));
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
export function createLmsServer(getSession: GetSession, options: LmsServerOptions = {}): McpServer {
  const { requireConfirmation = false, confirmSecret } = options;
  if (requireConfirmation && (!confirmSecret || confirmSecret.length < 32)) {
    throw new Error("confirmSecret must be at least 32 characters when requireConfirmation is on.");
  }

  /** Signs a token for the caller, or returns nothing when the server doesn't ask for one. */
  const issue = async (session: Session, tool: ConfirmationTool, args: Record<string, unknown>) =>
    requireConfirmation && confirmSecret ? signConfirmation({ sub: session.me.id, tool, args }, confirmSecret) : undefined;

  /** Null when the write may go ahead; otherwise the refusal. Runs before any RPC. */
  async function guard(
    session: Session,
    tool: ConfirmationTool,
    args: Record<string, unknown>,
    token: string | undefined,
  ): Promise<CallToolResult | null> {
    if (!requireConfirmation || !confirmSecret) return null;
    const res = await verifyConfirmation(token, { sub: session.me.id, tool, args }, confirmSecret);
    return res.ok ? null : fail("confirmation_required");
  }
  const server = new McpServer({ name: "away-lms", version: "0.1.0" }, { instructions: SERVER_INSTRUCTIONS });

  /** Runs a tool body with the session, turning sign-in and unexpected errors into tool errors. */
  async function run(body: (s: Session) => Promise<CallToolResult>): Promise<CallToolResult> {
    try {
      return await body(await getSession());
    } catch (err) {
      const code = err instanceof Error ? err.message : "unknown";
      if (code === "invalid_credentials") return fail(code, "Check LMS_EMAIL and LMS_PASSWORD.");
      if (code === "not_allowed") return fail(code, "This account has no active profile.");
      // Known codes only: error text can carry Postgres detail or request content.
      console.error("[lms] tool failed:", Object.hasOwn(ERROR_COPY, code) ? code : "unexpected");
      if (code === "sign_in_failed") return fail("unknown", `Sign-in failed: ${String((err as Error).cause)}`);
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
        const range = `${type.name}, ${dateRange(args.start_date, args.end_date)}`;
        // working_days is null when the range itself is invalid (see errors).
        const parts = [p.working_days === null ? `${range}: can't be counted.` : `${range}: ${days(p.working_days)}.`];
        if (p.available_before !== null) parts.push(`Available before: ${days(p.available_before)}.`);
        if (p.over_balance_days) parts.push(`Over balance by ${days(p.over_balance_days)}.`);
        const clean = !p.errors.length && p.working_days !== null;
        const token = clean
          ? await issue(session, "submit_leave", {
              leave_type_id: type.id,
              start_date: args.start_date,
              end_date: args.end_date,
            })
          : undefined;
        if (p.errors.length) parts.push(`Problems: ${p.errors.map(copyFor).join(" ")}`);
        else parts.push("No problems; it can be submitted.");
        if (token) parts.push(`Show this to the person and ask them to confirm. Then call submit_leave with confirmation: ${token}`);
        return ok(parts.join(" "), { leave_type: type.name, ...p, ...(token && { confirmation: token }) });
      }),
  );

  server.registerTool(
    "submit_leave",
    {
      title: "Submit a leave request",
      description:
        "Submit a leave request for the signed-in user. It starts as pending until a manager or admin decides it. " +
        "Call preview_leave first, show the person the type, dates and working days, and ask them to confirm. " +
        "Pass the confirmation token from the preview.",
      inputSchema: {
        leave_type: z.string().min(1).describe("Leave type name, e.g. Annual."),
        start_date: isoDate,
        end_date: isoDate,
        note: comment.optional().describe("Optional note for the approver, up to 500 characters."),
        confirmation,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (args) =>
      run(async (session) => {
        if (requireConfirmation && !args.confirmation) return fail("confirmation_required");
        const type = await leaveTypeOrFail(session, args.leave_type);
        if (isFailure(type)) return type;
        const refused = await guard(
          session,
          "submit_leave",
          { leave_type_id: type.id, start_date: args.start_date, end_date: args.end_date },
          args.confirmation,
        );
        if (refused) return refused;
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
        // The RPC's invalid_range also covers ranges over 62 days, which the app's copy doesn't say.
        if (!res.ok && res.code === "invalid_range") {
          return failWith(res.code, "The range must be 1 to 62 days, with to on or after from. Split longer ranges.");
        }
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

  const decide = (outcome: "approved" | "declined", id: string, text: string | undefined, token: string | undefined) =>
    run(async (session) => {
      const tool = outcome === "approved" ? "approve_request" : "decline_request";
      const refused = await guard(session, tool, { request_id: id, outcome }, token);
      if (refused) return refused;
      const res = toActionResult(
        await session.db.rpc("decide_leave_request", { p_request_id: id, p_outcome: outcome, p_comment: text || undefined }),
      );
      if (!res.ok) return fail(res.code);
      const r = res.data;
      return ok(`${outcome === "approved" ? "Approved" : "Declined"} the request for ${dateRange(r.start_date, r.end_date)}. [id ${r.id}]`, {
        request: r,
      });
    });

  server.registerTool(
    "preview_decision",
    {
      title: "Preview approving or declining a request",
      description:
        "Managers and admins: show a pending request (requester, type, dates, working days, note, balance) before deciding it. " +
        "Show the result to the person and ask them to confirm. Then call approve_request or decline_request with the confirmation token.",
      inputSchema: { request_id: requestId, outcome: z.enum(["approved", "declined"]) },
      annotations: READ,
    },
    (args) =>
      run(async (session) => {
        const res = toActionResult(await session.db.rpc("approval_queue"));
        if (!res.ok) return fail(res.code);
        const q = res.data.find((row) => row.id === args.request_id);
        if (!q) return fail("not_found", "It may be decided already, or it isn't yours to decide.");
        const verb = args.outcome === "approved" ? "approve" : "decline";
        const tool = args.outcome === "approved" ? "approve_request" : "decline_request";
        const token = await issue(session, tool, { request_id: q.id, outcome: args.outcome });
        const parts = [
          `Would ${verb} ${q.requester_name}: ${q.leave_type_name}, ${dateRange(q.start_date, q.end_date)} (${days(q.working_days)}).`,
        ];
        if (q.available_now !== null) parts.push(`${days(q.available_now)} available.`);
        if (q.over_balance_days) parts.push(`${days(q.over_balance_days)} over balance.`);
        if (q.note) parts.push(`Note: ${q.note}`);
        if (token) parts.push(`Show this to the person and ask them to confirm. Then call ${tool} with confirmation: ${token}`);
        return ok(parts.join(" "), { request: q, outcome: args.outcome, ...(token && { confirmation: token }) });
      }),
  );

  server.registerTool(
    "approve_request",
    {
      title: "Approve a leave request",
      description:
        "Managers and admins: approve a pending leave request by id (from list_pending). This can't be undone. " +
        "Call preview_decision first, show the person the result, ask them to confirm, and pass its confirmation token.",
      inputSchema: {
        request_id: requestId,
        comment: comment.optional().describe("Optional comment for the requester."),
        confirmation,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    (args) => decide("approved", args.request_id, args.comment, args.confirmation),
  );

  server.registerTool(
    "decline_request",
    {
      title: "Decline a leave request",
      description:
        "Managers and admins: decline a pending leave request by id (from list_pending), with a reason the requester will see. " +
        "This can't be undone. Call preview_decision first, show the person the result, ask them to confirm, and pass its confirmation token.",
      inputSchema: {
        request_id: requestId,
        reason: comment.min(1).describe("Reason shown to the requester."),
        confirmation,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    (args) => decide("declined", args.request_id, args.reason, args.confirmation),
  );

  return server;
}
