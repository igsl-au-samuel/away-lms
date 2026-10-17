import Link from "next/link";
import { notFound } from "next/navigation";
import { AllowanceLog, type AllowanceLogEntry } from "../../../../../components/allowance-log";
import { Balances } from "../../../../../components/balances";
import { DemoBadge, InactiveBadge } from "../../../../../components/badges";
import { leaveYear } from "../../../../../lib/dates";
import { createClient } from "../../../../../lib/supabase/server";
import { getRequestViewer } from "../../../../../server/auth";
import { AllowanceForm } from "./allowance-form";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ year?: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminUserPage({ params, searchParams }: Props) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const viewer = await getRequestViewer();
  if (!viewer) return null;

  const current = leaveYear(viewer.timezone);
  const asked = Number((await searchParams).year);
  const year = Number.isInteger(asked) && asked >= current - 5 && asked <= current + 5 ? asked : current;

  const supabase = await createClient();
  const [person, balances, types, log] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role, region_code, is_active, is_demo").eq("id", id).maybeSingle(),
    supabase.rpc("get_balances", { p_user_id: id, p_year: year }),
    supabase.from("leave_types").select("id, name, default_allowance").eq("is_capped", true).eq("is_active", true).order("sort_order"),
    supabase
      .from("allowance_changes")
      .select(
        "id, year, old_days, new_days, changed_at, reason, leave_types(name), changer:profiles!allowance_changes_changed_by_fkey(full_name)",
      )
      .eq("user_id", id)
      .order("changed_at", { ascending: false })
      .limit(50),
  ]);
  if (!person.data) notFound();
  const p = person.data;

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
      <p style={{ margin: 0 }}>
        <Link href="/admin/users">← Users</Link>
      </p>
      <h1 style={{ margin: 0, fontSize: 24 }}>
        {p.full_name} {p.is_demo && <DemoBadge />} {!p.is_active && <InactiveBadge />}
      </h1>
      <p className="muted" style={{ margin: 0, textTransform: "capitalize" }}>
        {p.email} · {p.role} · {p.region_code}
      </p>

      <section className="card stack" aria-labelledby="allowances-heading">
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "var(--space-3)" }}>
          <h2 id="allowances-heading" style={{ margin: 0, fontSize: 20 }}>
            Allowances for {year}
          </h2>
          <nav aria-label="Year" style={{ display: "flex", gap: "var(--space-3)" }}>
            <Link href={`/admin/users/${id}?year=${year - 1}`}>{year - 1}</Link>
            <Link href={`/admin/users/${id}?year=${year + 1}`}>{year + 1}</Link>
          </nav>
        </div>
        {balances.error ? (
          <p className="alert">We couldn’t load the balances. Try again shortly.</p>
        ) : (
          <Balances rows={balances.data ?? []} year={year} />
        )}
      </section>

      <section className="card stack" aria-labelledby="override-heading">
        <h2 id="override-heading" style={{ margin: 0, fontSize: 20 }}>
          Change an allowance
        </h2>
        <AllowanceForm userId={id} year={year} types={types.data ?? []} />
      </section>

      <section className="card stack" aria-labelledby="log-heading">
        <h2 id="log-heading" style={{ margin: 0, fontSize: 20 }}>
          Allowance changes
        </h2>
        {log.error ? (
          <p className="alert">We couldn’t load the allowance changes. Try again shortly.</p>
        ) : (
          <AllowanceLog entries={entries} timeZone={viewer.timezone} />
        )}
      </section>
    </div>
  );
}
