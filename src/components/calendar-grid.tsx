import { Check, Clock, Flag } from "lucide-react";
import type { CSSProperties } from "react";
import { clipSpan, groupByRegion, holidaysByRegionDate, monthDays } from "../lib/calendar";
import { formatPlainDate } from "../lib/dates";
import { DemoBadge, InactiveBadge } from "./badges";

export type CalendarPerson = {
  id: string;
  full_name: string;
  region_code: string;
  is_active: boolean;
  is_demo: boolean;
};

export type CalendarLeave = {
  request_id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  status: "pending" | "approved";
  /** Null unless the viewer is the requester, a manager or an admin (FR-024a). */
  leave_type_name: string | null;
};

export type CalendarHoliday = { region_code: string; holiday_date: string; name: string };
export type CalendarRegion = { code: string; name: string };

const icon = { size: 14, strokeWidth: 1.5, "aria-hidden": true } as const;

const STATUS = {
  approved: { label: "Approved", icon: <Check {...icon} />, tone: "approved" },
  pending: { label: "Pending", icon: <Clock {...icon} />, tone: "pending" },
} as const;

const NAME_WIDTH = 180;
const DAY_WIDTH = 36;

const cellBase: CSSProperties = {
  minWidth: DAY_WIDTH,
  width: DAY_WIDTH,
  padding: 0,
  textAlign: "center",
  borderLeft: "1px solid var(--border)",
};

const nameCell: CSSProperties = {
  position: "sticky",
  left: 0,
  zIndex: 1,
  minWidth: NAME_WIDTH,
  width: NAME_WIDTH,
  background: "var(--surface)",
  textAlign: "left",
  fontWeight: 400,
};

function tone(t: "approved" | "pending" | "cancelled"): CSSProperties {
  return { background: `var(--${t}-bg)`, color: `var(--${t}-text)` };
}

/** Month grid: people as rows grouped by region, a holiday row per region, one column per day. */
export function CalendarGrid({
  month,
  regions,
  people,
  leave,
  holidays,
}: {
  month: string;
  regions: CalendarRegion[];
  people: CalendarPerson[];
  leave: CalendarLeave[];
  holidays: CalendarHoliday[];
}) {
  const { from, to, days } = monthDays(month);
  const holidayMap = holidaysByRegionDate(holidays);
  const groups = groupByRegion(
    people,
    regions.map((r) => r.code),
  );
  const regionName = new Map(regions.map((r) => [r.code, r.name]));

  const spansByUser = new Map<string, (CalendarLeave & { start: string; end: string })[]>();
  for (const l of leave) {
    const span = clipSpan(l.start_date, l.end_date, from, to);
    if (!span) continue;
    const list = spansByUser.get(l.user_id) ?? [];
    list.push({ ...l, ...span });
    spansByUser.set(l.user_id, list);
  }

  const monthHolidays = holidays
    .filter((h) => h.holiday_date >= from && h.holiday_date <= to)
    .sort((a, b) => a.holiday_date.localeCompare(b.holiday_date) || a.region_code.localeCompare(b.region_code));

  return (
    <div className="stack">
      <ul
        aria-label="Key"
        style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-4)", margin: 0, padding: 0, listStyle: "none" }}
      >
        {(["approved", "pending"] as const).map((s) => (
          <li key={s} style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)", fontSize: 14 }}>
            <span style={{ ...tone(STATUS[s].tone), ...legendChip }}>{STATUS[s].icon}</span>
            {STATUS[s].label} leave
          </li>
        ))}
        <li style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)", fontSize: 14 }}>
          <span style={{ ...tone("cancelled"), ...legendChip }}>
            <Flag {...icon} />
          </span>
          Public holiday in the person’s region
        </li>
      </ul>

      {/* position: relative keeps the absolutely positioned sr-only labels inside the scroller. */}
      <div
        style={{ overflowX: "auto", position: "relative" }}
        tabIndex={0}
        role="region"
        aria-label="Team calendar, scrolls sideways"
      >
        <table className="table" style={{ width: "max-content", minWidth: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <caption className="sr-only">Leave and public holidays for {month}</caption>
          <thead>
            <tr>
              <th scope="col" style={{ ...nameCell, background: "var(--surface-sunken)" }}>
                Person
              </th>
              {days.map((d) => (
                <th
                  key={d.date}
                  scope="col"
                  style={{
                    ...cellBase,
                    fontSize: 12,
                    lineHeight: 1.2,
                    background: d.isWeekend ? "var(--border)" : "var(--surface-sunken)",
                  }}
                >
                  <span className="sr-only">{formatPlainDate(d.date)}</span>
                  <span aria-hidden="true">
                    {d.weekdayLabel}
                    <br />
                    {d.day}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="rowgroup" colSpan={days.length + 1} style={{ ...nameCell, position: "static", fontSize: 12 }}>
                Public holidays
              </th>
            </tr>
            {regions.map((r) => (
              <tr key={`h-${r.code}`}>
                <th scope="row" style={nameCell}>
                  {r.code} <span className="muted">· {r.name}</span>
                </th>
                {days.map((d) => {
                  const name = holidayMap.get(r.code)?.get(d.date);
                  return (
                    <td key={d.date} style={{ ...cellBase, ...(name ? tone("cancelled") : weekendShade(d.isWeekend)) }}>
                      {name && (
                        <span title={`${r.code} holiday: ${name}`}>
                          <Flag {...icon} />
                          <span className="sr-only">
                            {r.code} public holiday: {name}
                          </span>
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}

            {groups.map((g) => (
              <PersonGroup
                key={g.region}
                region={g.region}
                regionName={regionName.get(g.region) ?? g.region}
                people={g.people}
                days={days}
                holidays={holidayMap.get(g.region)}
                spans={spansByUser}
              />
            ))}
          </tbody>
        </table>
      </div>

      <section aria-label="Public holidays this month" className="stack" style={{ gap: "var(--space-2)" }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Public holidays this month</h2>
        {monthHolidays.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No public holidays in this month.
          </p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: "var(--space-4)", fontSize: 14 }}>
            {monthHolidays.map((h) => (
              <li key={`${h.region_code}-${h.holiday_date}`}>
                <strong>{h.region_code}</strong> · {formatPlainDate(h.holiday_date)} · {h.name}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const legendChip: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 24,
  height: 24,
  borderRadius: "var(--radius-control)",
};

function weekendShade(isWeekend: boolean): CSSProperties {
  return isWeekend ? { background: "var(--surface-sunken)" } : {};
}

function PersonGroup({
  region,
  regionName,
  people,
  days,
  holidays,
  spans,
}: {
  region: string;
  regionName: string;
  people: CalendarPerson[];
  days: ReturnType<typeof monthDays>["days"];
  holidays: Map<string, string> | undefined;
  spans: Map<string, (CalendarLeave & { start: string; end: string })[]>;
}) {
  return (
    <>
      <tr>
        <th scope="rowgroup" colSpan={days.length + 1} style={{ ...nameCell, position: "static", fontSize: 12 }}>
          {region} <span className="muted">· {regionName}</span>
        </th>
      </tr>
      {people.length === 0 && (
        <tr>
          <td colSpan={days.length + 1} className="muted">
            Nobody in this region.
          </td>
        </tr>
      )}
      {people.map((p) => (
        <tr key={p.id}>
          <th scope="row" style={nameCell}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
              {p.full_name}
              {p.is_demo && <DemoBadge />}
              {!p.is_active && <InactiveBadge />}
            </span>
          </th>
          {days.map((d) => {
            const holiday = holidays?.get(d.date);
            if (d.isWeekend) return <td key={d.date} style={{ ...cellBase, ...weekendShade(true) }} />;
            if (holiday) {
              return (
                <td key={d.date} style={{ ...cellBase, ...tone("cancelled") }}>
                  <span title={`${region} holiday: ${holiday}`}>
                    <Flag {...icon} />
                    <span className="sr-only">
                      {region} public holiday: {holiday}
                    </span>
                  </span>
                </td>
              );
            }
            const span = spans.get(p.id)?.find((s) => s.start <= d.date && d.date <= s.end);
            if (!span) return <td key={d.date} style={cellBase} />;
            const s = STATUS[span.status];
            return (
              <td key={d.date} style={{ ...cellBase, ...tone(s.tone) }}>
                <span title={span.leave_type_name ? `${s.label}: ${span.leave_type_name}` : s.label}>
                  {s.icon}
                  <span className="sr-only">
                    {s.label} leave
                    {span.leave_type_name ? `, ${span.leave_type_name}` : ""}
                  </span>
                </span>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
