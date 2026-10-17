import { Forbidden } from "../../../../components/forbidden";
import { createClient } from "../../../../lib/supabase/server";
import { getAdminViewer } from "../../../../server/auth";
import { DEMO_EMAIL_DOMAIN } from "../../../../server/demo/roster";
import { DemoActiveButton, LoadDemoForm } from "./demo-forms";

export default async function AdminDemoPage() {
  if (!(await getAdminViewer())) return <Forbidden />;
  const supabase = await createClient();
  const { data: demo } = await supabase.from("profiles").select("id, is_active").eq("is_demo", true);
  const users = demo ?? [];
  const activeCount = users.filter((u) => u.is_active).length;

  return (
    <div className="stack">
      <h1 style={{ margin: 0, fontSize: 24 }}>Demo data</h1>

      <section className="card stack" aria-labelledby="touched-heading">
        <h2 id="touched-heading" style={{ margin: 0, fontSize: 20 }}>
          What this touches
        </h2>
        <ul style={{ margin: 0, paddingLeft: "var(--space-4)" }}>
          <li>
            Fictional employees in QLD, NSW and HK with <code>@{DEMO_EMAIL_DOMAIN}</code> addresses, labelled Demo
            everywhere.
          </li>
          <li>Their leave in every status. You are recorded as the person who decided it.</li>
          <li>Loading again deletes every demo user and their leave first, then creates them fresh.</li>
          <li>Real people, their requests and their allowances are never read or changed.</li>
          <li>Public holidays are shared and are not changed here.</li>
        </ul>
        <p className="muted" style={{ margin: 0 }}>
          {users.length === 0
            ? "No demo users right now."
            : `${users.length} demo users, ${activeCount} of them can sign in.`}
        </p>
      </section>

      <section className="card stack" aria-labelledby="load-heading">
        <h2 id="load-heading" style={{ margin: 0, fontSize: 20 }}>
          {users.length === 0 ? "Load demo data" : "Reset demo data"}
        </h2>
        <LoadDemoForm hasDemo={users.length > 0} />
      </section>

      {users.length > 0 && (
        <section className="card stack" aria-labelledby="logins-heading">
          <h2 id="logins-heading" style={{ margin: 0, fontSize: 20 }}>
            Demo logins
          </h2>
          <p className="muted" style={{ margin: 0 }}>
            Disabling blocks every demo sign-in at once and hides nothing else. Their leave stays on the calendar.
          </p>
          <DemoActiveButton active={activeCount > 0} />
        </section>
      )}
    </div>
  );
}
