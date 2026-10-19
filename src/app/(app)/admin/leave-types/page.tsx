import { InactiveBadge } from "../../../../components/badges";
import { Forbidden } from "../../../../components/forbidden";
import { createClient } from "../../../../lib/supabase/server";
import { getAdminViewer } from "../../../../server/auth";
import { LeaveTypeForm } from "./leave-type-form";

export default async function AdminLeaveTypesPage() {
  if (!(await getAdminViewer())) return <Forbidden />;
  const supabase = await createClient();
  const { data: types, error } = await supabase
    .from("leave_types")
    .select("id, name, is_capped, default_allowance, is_active, sort_order")
    .order("sort_order")
    .order("name");
  const rows = types ?? [];
  const nextSortOrder = rows.reduce((max, t) => Math.max(max, t.sort_order), 0) + 1;

  return (
    <div className="stack">
      <h1 style={{ margin: 0, fontSize: 24 }}>Leave types</h1>
      <p className="muted" style={{ margin: 0 }}>
        A changed default applies to everyone without an override and is logged. Retired types stay on existing
        requests but can&apos;t be chosen for new ones.
      </p>

      <section className="card stack" aria-labelledby="new-type-heading">
        <h2 id="new-type-heading" style={{ margin: 0, fontSize: 20 }}>
          Add a leave type
        </h2>
        <LeaveTypeForm nextSortOrder={nextSortOrder} />
      </section>

      <section className="card stack" aria-labelledby="types-heading">
        <h2 id="types-heading" style={{ margin: 0, fontSize: 20 }}>
          Leave types
        </h2>
        {error ? (
          <p className="alert">We couldn’t load the leave types. Try again shortly.</p>
        ) : (
          <ul className="stack" style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {rows.map((t) => (
              <li key={t.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: "var(--space-3)" }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-3)" }}>
                  <span style={{ fontWeight: 500 }}>{t.name}</span>
                  <span className="muted">
                    {t.is_capped ? `${t.default_allowance} days a year` : "Uncapped"}
                  </span>
                  {!t.is_active && <InactiveBadge />}
                </div>
                <details>
                  <summary className="muted" style={{ cursor: "pointer" }}>
                    Edit <span className="sr-only">{t.name}</span>
                  </summary>
                  <div style={{ paddingTop: "var(--space-3)" }}>
                    <LeaveTypeForm type={t} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
