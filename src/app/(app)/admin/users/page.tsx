import Link from "next/link";
import { DemoBadge, InactiveBadge } from "../../../../components/badges";
import { createClient } from "../../../../lib/supabase/server";
import { Forbidden } from "../../../../components/forbidden";
import { getAdminViewer } from "../../../../server/auth";
import { ActiveToggle } from "./active-toggle";
import { EditUserForm } from "./edit-user-form";
import { InviteForm } from "./invite-form";

export default async function AdminUsersPage() {
  const viewer = await getAdminViewer();
  if (!viewer) return <Forbidden />;
  const supabase = await createClient();
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
                  <Link href={`/admin/users/${p.id}`}>{p.full_name}</Link> <span className="muted">{p.email}</span>{" "}
                  {p.is_demo && <DemoBadge />} {!p.is_active && <InactiveBadge />}
                  <details>
                    <summary className="muted" style={{ cursor: "pointer" }}>
                      Edit <span className="sr-only">{p.full_name}</span>
                    </summary>
                    <EditUserForm user={p} regions={regions.data ?? []} isSelf={p.id === viewer.id} />
                  </details>
                </td>
                <td style={{ textTransform: "capitalize" }}>{p.role}</td>
                <td>{p.region_code}</td>
                <td>{p.id !== viewer.id && <ActiveToggle id={p.id} name={p.full_name} active={p.is_active} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
