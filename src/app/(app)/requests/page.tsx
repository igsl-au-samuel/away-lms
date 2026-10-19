import Link from "next/link";
import { StatusBadge } from "../../../components/badges";
import { formatDays } from "../../../components/balances";
import { formatPlainDate } from "../../../lib/dates";
import { createClient } from "../../../lib/supabase/server";
import { getRequestViewer } from "../../../server/auth";

export default async function RequestsPage() {
  const viewer = await getRequestViewer();
  if (!viewer) return null; // the (app) layout redirects signed-out users

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leave_requests")
    .select(
      "id, start_date, end_date, working_days, status, decision_comment, leave_types(name), decider:profiles!leave_requests_decided_by_fkey(full_name)",
    )
    .eq("user_id", viewer.id)
    .order("start_date", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <div className="stack">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)" }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>My requests</h1>
        <Link href="/requests/new" className="btn" style={{ display: "inline-flex", alignItems: "center" }}>
          Request leave
        </Link>
      </div>
      <section className="card stack" aria-label="My leave requests">
        {error ? (
          <p className="alert">We couldn’t load your requests. Try again shortly.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <caption className="sr-only">My leave requests, newest first</caption>
              <thead>
                <tr>
                  <th scope="col">Type</th>
                  <th scope="col">Dates</th>
                  <th scope="col">Working days</th>
                  <th scope="col">Status</th>
                  <th scope="col">Decided by</th>
                  <th scope="col">Comment</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((r) => (
                  <tr key={r.id}>
                    <td>{r.leave_types?.name ?? "Unknown"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {r.start_date === r.end_date
                        ? formatPlainDate(r.start_date)
                        : `${formatPlainDate(r.start_date)} – ${formatPlainDate(r.end_date)}`}
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                      {formatDays(r.working_days)}
                    </td>
                    <td>
                      <StatusBadge status={r.status as "pending" | "approved" | "declined"} />
                    </td>
                    <td>{r.decider?.full_name ?? <span className="muted">—</span>}</td>
                    <td>{r.decision_comment ?? <span className="muted">—</span>}</td>
                  </tr>
                ))}
                {(data ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">
                      You haven’t requested any leave yet.
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
