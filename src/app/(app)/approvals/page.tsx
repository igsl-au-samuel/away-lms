import { TriangleAlert } from "lucide-react";
import { AllowanceLog, type AllowanceLogEntry } from "../../../components/allowance-log";
import { DemoBadge } from "../../../components/badges";
import { formatDays } from "../../../components/balances";
import { Forbidden } from "../../../components/forbidden";
import { formatPlainDate } from "../../../lib/dates";
import { createClient } from "../../../lib/supabase/server";
import { getRequestViewer } from "../../../server/auth";
import { DecideForm } from "./decide-form";

const mono = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" } as const;
const LOG_PER_PERSON = 10;

type QueueRow = {
  id: string;
  requester_name: string;
  requester_is_demo: boolean;
  leave_type_name: string;
  is_capped: boolean;
  start_date: string;
  end_date: string;
  working_days: number;
  note: string | null;
  over_balance_days: number | null;
  available_now: number | null;
};

export default async function ApprovalsPage() {
  const viewer = await getRequestViewer();
  if (!viewer) return null; // the (app) layout redirects signed-out users
  if (viewer.role !== "manager" && viewer.role !== "admin") return <Forbidden />;

  const supabase = await createClient();
  const queue = await supabase.rpc("approval_queue");
  const rows = queue.data ?? [];

  // Each requester's allowance log, so the approver sees why a balance looks the way it does (FR-008a).
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const log = userIds.length
    ? await supabase
        .from("allowance_changes")
        .select(
          "id, user_id, year, old_days, new_days, changed_at, reason, leave_types(name), changer:profiles!allowance_changes_changed_by_fkey(full_name)",
        )
        .in("user_id", userIds)
        .order("changed_at", { ascending: false })
    : { data: [] };

  const logByUser = new Map<string, AllowanceLogEntry[]>();
  for (const e of log.data ?? []) {
    if (!e.user_id) continue;
    const entries = logByUser.get(e.user_id) ?? [];
    if (entries.length >= LOG_PER_PERSON) continue;
    entries.push({
      id: e.id,
      leave_type: e.leave_types?.name ?? "Unknown",
      year: e.year,
      old_days: e.old_days,
      new_days: e.new_days,
      changed_by: e.changer?.full_name ?? "Unknown",
      changed_at: e.changed_at,
      reason: e.reason,
    });
    logByUser.set(e.user_id, entries);
  }

  return (
    <div className="stack">
      <h1 style={{ margin: 0, fontSize: 24 }}>Approvals</h1>
      <section className="card stack" aria-label="Requests waiting for a decision">
        {queue.error ? (
          <p className="alert">We couldn’t load the approval queue. Try again shortly.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <caption className="sr-only">Pending leave requests, oldest first</caption>
              <thead>
                <tr>
                  <th scope="col">Requester</th>
                  <th scope="col">Type</th>
                  <th scope="col">Dates</th>
                  <th scope="col">Working days</th>
                  <th scope="col">Note</th>
                  <th scope="col">Available now</th>
                  <th scope="col">Decision</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <QueueRows key={r.id} row={r} log={logByUser.get(r.user_id) ?? []} timeZone={viewer.timezone} />
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="muted">
                      Nothing is waiting for a decision.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function QueueRows({ row: r, log, timeZone }: { row: QueueRow; log: AllowanceLogEntry[]; timeZone: string }) {
  return (
    <>
      <tr>
        <td>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
            {r.requester_name}
            {r.requester_is_demo && <DemoBadge />}
          </span>
        </td>
        <td>{r.leave_type_name}</td>
        <td style={{ whiteSpace: "nowrap" }}>
          {r.start_date === r.end_date
            ? formatPlainDate(r.start_date)
            : `${formatPlainDate(r.start_date)} – ${formatPlainDate(r.end_date)}`}
        </td>
        <td style={mono}>{formatDays(r.working_days)}</td>
        <td>{r.note ?? <span className="muted">—</span>}</td>
        <td style={mono}>
          {r.is_capped && r.available_now !== null ? (
            formatDays(r.available_now)
          ) : (
            <span className="muted">Not applicable</span>
          )}
          {r.over_balance_days !== null && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-1)",
                marginTop: "var(--space-1)",
                padding: "2px var(--space-2)",
                borderRadius: "var(--radius-control)",
                background: "var(--pending-bg)",
                color: "var(--pending-text)",
                fontWeight: 500,
              }}
            >
              <TriangleAlert size={14} strokeWidth={1.5} aria-hidden />
              Over balance by {formatDays(r.over_balance_days)}
            </span>
          )}
        </td>
        <td>
          <DecideForm id={r.id} name={r.requester_name} />
        </td>
      </tr>
      <tr>
        <td colSpan={7}>
          <details>
            <summary>Allowance changes</summary>
            <AllowanceLog entries={log} timeZone={timeZone} />
          </details>
        </td>
      </tr>
    </>
  );
}
