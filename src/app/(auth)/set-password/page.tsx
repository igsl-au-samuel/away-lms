import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { SetPasswordForm } from "./set-password-form";

export default async function SetPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/sign-in");
  return (
    <div className="stack">
      <h1 style={{ margin: 0, fontSize: 24 }}>Set your password</h1>
      <p className="muted" style={{ margin: 0 }}>
        Use at least 10 characters.
      </p>
      <SetPasswordForm />
    </div>
  );
}
