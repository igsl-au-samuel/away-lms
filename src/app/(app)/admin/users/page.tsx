import { DemoBadge, InactiveBadge } from "../../../../components/badges";
import { createClient } from "../../../../lib/supabase/server";
import { getRequestViewer } from "../../../../server/auth";
import { InviteForm } from "./invite-form";
import { ActiveToggle } from "./active-toggle";

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const viewer = await getRequestViewer();
  const [people, regions] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role, region_code, is_active, is_demo").order("full_name"),
    supabase.from("holiday_regions").select("code, name").order("name"),
  ]);

  return (
    <div className="stack">
      <h1 style={{ margin: 0, fontSize: 24 }}>Users</h1>

      <section className="card stack" aria-labelledby="invite-heading">
        <h2 id="invite-heading" style={{ margin: 0, fontSize: 20 }}>
          Invite a user
        </h2>
        <InviteForm regions={regions.data ?? []} />
      </section>

      <section className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Region</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(people.data ?? []).map((p) => (
              <tr key={p.id}>
                <td>
                  {p.full_name} <span className="muted">{p.email}</span>{" "}
                  {p.is_demo && <DemoBadge />} {!p.is_active && <InactiveBadge />}
                </td>
                <td style={{ textTransform: "capitalize" }}>{p.role}</td>
                <td>{p.region_code}</td>
                <td>{p.id !== viewer?.id && <ActiveToggle id={p.id} name={p.full_name} active={p.is_active} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
