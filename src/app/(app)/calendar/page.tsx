import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { CalendarGrid, type CalendarLeave } from "../../../components/calendar-grid";
import { currentMonth, monthDays, parseMonth, shiftMonth } from "../../../lib/calendar";
import { createClient } from "../../../lib/supabase/server";
import { getRequestViewer } from "../../../server/auth";

const monthFormat = new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const viewer = await getRequestViewer();
  if (!viewer) return null; // the (app) layout redirects signed-out users

  const { month: param } = await searchParams;
  const month = parseMonth(param, currentMonth(viewer.timezone));
  const { from, to } = monthDays(month);

  const supabase = await createClient();
  const [calendar, profiles, holidays, regions] = await Promise.all([
    supabase.rpc("team_calendar", { p_from: from, p_to: to }),
    supabase.from("profiles").select("id, full_name, region_code, is_active, is_demo"),
    supabase
      .from("public_holidays")
      .select("region_code, holiday_date, name")
      .gte("holiday_date", from)
      .lte("holiday_date", to),
    supabase.from("holiday_regions").select("code, name").order("code"),
  ]);

  const failed = calendar.error || profiles.error || holidays.error || regions.error;
  const leave: CalendarLeave[] = (calendar.data ?? []).map((r) => ({
    request_id: r.request_id,
    user_id: r.user_id,
    start_date: r.start_date,
    end_date: r.end_date,
    status: r.status === "approved" ? "approved" : "pending",
    leave_type_name: r.leave_type_name as string | null,
  }));

  // Active people always; deactivated people only while they have leave in the month (US6-2).
  const withLeave = new Set(leave.map((l) => l.user_id));
  const people = (profiles.data ?? []).filter((p) => p.is_active || withLeave.has(p.id));

  const label = monthFormat.format(new Date(`${month}-01T00:00:00Z`));
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);

  return (
    <div className="stack">
      <h1 style={{ margin: 0, fontSize: 24 }}>Team calendar</h1>
      <nav
        aria-label="Month"
        style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}
      >
        <Link href={`/calendar?month=${prev}`} className="btn btn-secondary" style={linkButton} rel="prev">
          <ChevronLeft size={16} strokeWidth={1.5} aria-hidden />
          Previous
          <span className="sr-only"> month</span>
        </Link>
        <h2 style={{ margin: 0, fontSize: 18, minWidth: 140, textAlign: "center" }} aria-live="polite">
          {label}
        </h2>
        <Link href={`/calendar?month=${next}`} className="btn btn-secondary" style={linkButton} rel="next">
          Next
          <span className="sr-only"> month</span>
          <ChevronRight size={16} strokeWidth={1.5} aria-hidden />
        </Link>
      </nav>

      <section className="card stack" aria-label={`Who is away in ${label}`}>
        {failed ? (
          <p className="alert">We couldn’t load the calendar. Try again shortly.</p>
        ) : (
          <CalendarGrid
            month={month}
            regions={regions.data ?? []}
            people={people}
            leave={leave}
            holidays={holidays.data ?? []}
          />
        )}
      </section>
    </div>
  );
}

const linkButton = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--space-1)",
  textDecoration: "none",
} as const;
