import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Nav } from "../../components/nav";
import { createClient } from "../../lib/supabase/server";
import { getRequestViewer } from "../../server/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const viewer = await getRequestViewer();
  if (!viewer) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    // Signed in without an active profile: end the session, then sign in again.
    redirect(data.user ? "/auth/sign-out" : "/sign-in");
  }
  return (
    <div className="shell">
      <Nav name={viewer.full_name} role={viewer.role} />
      <div>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
