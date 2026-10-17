import { createClient } from "../../../lib/supabase/server";
import { getRequestViewer } from "../../../server/auth";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const viewer = await getRequestViewer();
  if (!viewer) return null; // the (app) layout redirects signed-out users

  const supabase = await createClient();
  const { data: regions } = await supabase.from("holiday_regions").select("code, name").order("name");
  const timezones = Intl.supportedValuesOf("timeZone");
  if (!timezones.includes(viewer.timezone)) timezones.push(viewer.timezone);

  return (
    <div className="stack">
      <h1 style={{ margin: 0, fontSize: 24 }}>Profile</h1>
      <section className="card stack" aria-labelledby="where-heading">
        <h2 id="where-heading" style={{ margin: 0, fontSize: 20 }}>
          Where you work
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          Your region sets the public holidays that count for new requests. Requests you have already made keep their
          days. Your timezone sets the dates you see.
        </p>
        <ProfileForm regions={regions ?? []} timezones={timezones} region={viewer.region_code} timezone={viewer.timezone} />
      </section>
    </div>
  );
}
