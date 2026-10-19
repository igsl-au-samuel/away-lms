import Link from "next/link";
import { formatPlainDate, leaveYear } from "../../../../lib/dates";
import { createClient } from "../../../../lib/supabase/server";
import { Forbidden } from "../../../../components/forbidden";
import { getAdminViewer } from "../../../../server/auth";
import { HolidayForm, RegionForm, RemoveHolidayButton } from "./holiday-forms";

type Props = { searchParams: Promise<{ region?: string; year?: string }> };

export default async function AdminHolidaysPage({ searchParams }: Props) {
  const viewer = await getAdminViewer();
  if (!viewer) return <Forbidden />;
  const params = await searchParams;

  const supabase = await createClient();
  const { data: regions } = await supabase.from("holiday_regions").select("code, name, default_timezone").order("name");
  const regionList = regions ?? [];
  const region = regionList.find((r) => r.code === params.region)?.code ?? viewer.region_code;

  const current = leaveYear(viewer.timezone);
  const asked = Number(params.year);
  const year = Number.isInteger(asked) && asked >= 2000 && asked <= 2100 ? asked : current;

  const { data: holidays, error } = await supabase
    .from("public_holidays")
    .select("id, holiday_date, name")
    .eq("region_code", region)
    .gte("holiday_date", `${year}-01-01`)
    .lte("holiday_date", `${year}-12-31`)
    .order("holiday_date");
  const regionName = regionList.find((r) => r.code === region)?.name ?? region;
  const href = (r: string, y: number) => `/admin/holidays?region=${r}&year=${y}`;

  return (
    <div className="stack">
      <h1 style={{ margin: 0, fontSize: 24 }}>Public holidays</h1>
      <p className="muted" style={{ margin: 0 }}>
        Holidays are not counted as working days for people in that region. Changes apply to new requests; existing
        requests keep their day counts.
      </p>

      <section className="card stack" aria-labelledby="regions-heading">
        <h2 id="regions-heading" style={{ margin: 0, fontSize: 20 }}>
          Regions
        </h2>
        <nav aria-label="Regions" className="tabs">
          {regionList.map((r) => (
            <Link key={r.code} href={href(r.code, year)} className="tab" aria-current={r.code === region ? "page" : undefined}>
              {r.code}
            </Link>
          ))}
        </nav>
        <details>
          <summary className="muted" style={{ cursor: "pointer" }}>
            Add a region
          </summary>
          <div style={{ paddingTop: "var(--space-3)" }}>
            <RegionForm timezones={Intl.supportedValuesOf("timeZone")} />
          </div>
        </details>
      </section>

      <section className="card stack" aria-labelledby="holidays-heading">
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "var(--space-3)" }}>
          <h2 id="holidays-heading" style={{ margin: 0, fontSize: 20 }}>
            {regionName}, {year}
          </h2>
          <nav aria-label="Year" style={{ display: "flex", gap: "var(--space-3)" }}>
            <Link href={href(region, year - 1)}>{year - 1}</Link>
            <Link href={href(region, year + 1)}>{year + 1}</Link>
          </nav>
        </div>

        <HolidayForm key={`${region}-${year}`} region={region} year={year} />

        {error ? (
          <p className="alert">We couldn’t load the holidays. Try again shortly.</p>
        ) : (holidays ?? []).length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No public holidays for {regionName} in {year} yet.
          </p>
        ) : (
          <ul className="stack" style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {(holidays ?? []).map((h) => (
              <li key={h.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: "var(--space-3)" }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-3)" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                    {formatPlainDate(h.holiday_date)}
                  </span>
                  <span style={{ fontWeight: 500 }}>{h.name}</span>
                  <RemoveHolidayButton id={h.id} label={`${h.name} ${formatPlainDate(h.holiday_date)}`} />
                </div>
                <details>
                  <summary className="muted" style={{ cursor: "pointer" }}>
                    Edit <span className="sr-only">{h.name}</span>
                  </summary>
                  <div style={{ paddingTop: "var(--space-3)" }}>
                    <HolidayForm region={region} year={year} holiday={h} />
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
