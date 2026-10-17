import { AllowanceLog, type AllowanceLogEntry } from "../../components/allowance-log";
import { Balances } from "../../components/balances";
import { leaveYear } from "../../lib/dates";
import { createClient } from "../../lib/supabase/server";
import { getRequestViewer } from "../../server/auth";

export default async function DashboardPage() {
  const viewer = await getRequestViewer();
  if (!viewer) return null; // the (app) layout redirects signed-out users

  const supabase = await createClient();
  const year = leaveYear(viewer.timezone);
  const [balances, log] = await Promise.all([
    supabase.rpc("get_balances", { p_user_id: viewer.id, p_year: year }),
    supabase
      .from("allowance_changes")
      .select(
        "id, year, old_days, new_days, changed_at, reason, leave_types(name), changer:profiles!allowance_changes_changed_by_fkey(full_name)",
      )
      .eq("user_id", viewer.id)
      .order("changed_at", { ascending: false })
      .limit(20),
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
