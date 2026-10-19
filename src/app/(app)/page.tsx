import Link from "next/link";
import { AllowanceLog, type AllowanceLogEntry } from "../../components/allowance-log";
import { StatusBadge } from "../../components/badges";
import { Balances } from "../../components/balances";
import { formatPlainDate, leaveYear, todayIn } from "../../lib/dates";
import { createClient } from "../../lib/supabase/server";
import { getRequestViewer } from "../../server/auth";

export default async function DashboardPage() {
  const viewer = await getRequestViewer();
  if (!viewer) return null; // the (app) layout redirects signed-out users

  const supabase = await createClient();
  const year = leaveYear(viewer.timezone);
  const today = todayIn(viewer.timezone);
  const isApprover = viewer.role === "manager" || viewer.role === "admin";
  const [balances, log, upcoming, queue] = await Promise.all([
    supabase.rpc("get_balances", { p_user_id: viewer.id, p_year: year }),
    supabase
      .from("allowance_changes")
      .select(
        "id, year, old_days, new_days, changed_at, reason, leave_types(name), changer:profiles!allowance_changes_changed_by_fkey(full_name)",
      )
      .eq("user_id", viewer.id)
      .order("changed_at", { ascending: false })
      .limit(20),
    supabase
      .from("leave_requests")
      .select("id, start_date, end_date, working_days, status, leave_types(name)")
      .eq("user_id", viewer.id)
      .in("status", ["pending", "approved"])
      .gte("end_date", today)
      .order("start_date")
      .limit(10),
    isApprover ? supabase.rpc("approval_queue") : null,
  ]);

  const entries: AllowanceLogEntry[] = (log.data ?? []).map((e) => ({
    id: e.id,
    leave_type: e.leave_types?.name ?? "Unknown",
    year: e.year,
    old_days: e.old_days,
    new_days: e.new_days,
    changed_by: e.changer?.full_name ?? "Unknown",
    changed_at: e.changed_at,
    reason: e.reason,
  }));

  return (
    <div className="stack">
      <h1 style={{ margin: 0, fontSize: 24 }}>Dashboard</h1>
      <p className="muted" style={{ margin: 0 }}>
        Today is {formatPlainDate(today)}
      </p>

      {queue && !queue.error && (
        <section className="card" aria-labelledby="approvals-heading">
          <h2 id="approvals-heading" style={{ margin: 0, fontSize: 20 }}>
            Approvals
          </h2>
          <p style={{ margin: "var(--space-2) 0 0" }}>
            {queue.data.length === 0 ? (
              <span className="muted">No requests are waiting for you.</span>
            ) : (
              <Link href="/approvals">
                {queue.data.length} {queue.data.length === 1 ? "request" : "requests"} waiting for a decision
              </Link>
            )}
          </p>
        </section>
      )}

      <section className="card stack" aria-labelledby="balances-heading">
        <h2 id="balances-heading" style={{ margin: 0, fontSize: 20 }}>
          Balances for {year}
        </h2>
        {balances.error ? (
          <p className="alert">We couldn’t load your balances. Try again shortly.</p>
        ) : (
          <Balances rows={balances.data ?? []} year={year} />
        )}
      </section>

      <section className="card stack" aria-labelledby="upcoming-heading">
        <h2 id="upcoming-heading" style={{ margin: 0, fontSize: 20 }}>
          Upcoming leave
        </h2>
        {upcoming.error ? (
          <p className="alert">We couldn’t load your upcoming leave. Try again shortly.</p>
        ) : (upcoming.data ?? []).length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No upcoming leave.
          </p>
        ) : (
          <ul className="stack" style={{ margin: 0, padding: 0, listStyle: "none", gap: "var(--space-2)" }}>
            {(upcoming.data ?? []).map((r) => (
              <li key={r.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-3)" }}>
                <span style={{ fontWeight: 500 }}>{r.leave_types?.name ?? "Unknown"}</span>
                <span>
                  {r.start_date === r.end_date
                    ? formatPlainDate(r.start_date)
                    : `${formatPlainDate(r.start_date)} – ${formatPlainDate(r.end_date)}`}
                </span>
                <StatusBadge status={r.status as "pending" | "approved"} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card stack" aria-labelledby="log-heading">
        <h2 id="log-heading" style={{ margin: 0, fontSize: 20 }}>
          Allowance changes
        </h2>
        {log.error ? (
          <p className="alert">We couldn’t load your allowance changes. Try again shortly.</p>
        ) : (
          <AllowanceLog entries={entries} timeZone={viewer.timezone} />
        )}
      </section>
    </div>
  );
}
