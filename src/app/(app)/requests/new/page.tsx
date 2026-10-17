import { RequestForm } from "../../../../components/request-form";
import { createClient } from "../../../../lib/supabase/server";

export default async function NewRequestPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leave_types")
    .select("id, name")
    .eq("is_active", true)
    .order("sort_order");

  return (
    <div className="stack" style={{ maxWidth: 560 }}>
      <h1 style={{ margin: 0, fontSize: 24 }}>Request leave</h1>
      <section className="card stack">
        {error || !data?.length ? (
          <p className="alert">We couldn’t load the leave types. Try again shortly.</p>
        ) : (
          <RequestForm leaveTypes={data} />
        )}
      </section>
    </div>
  );
}
