// #180 — the utilisation matrix: one row block per person, one row per leave type inside it.
//
// `groupByPerson` lives in src/server/reports.ts and this component only draws its answer, which is what
// lets tests/unit/reports.test.tsx read the grouping (the part that can be wrong) without a database.
//
// A person's name is a `rowgroup` header spanning their rows, and the leave type is the row header inside
// it. Both, rather than one: a reader who asks "what row is this?" has to hear which type, and a reader
// who asks "whose is it?" has to hear the name — a plain `<td>` for either would make the row unreadable
// on its own. The span is what carries the name down the group, so no row is left without one.
//
// Six columns, which is more than a phone holds. The scroll wrapper is not decoration: #438's finding was
// that a scroll region with nothing focusable inside it cannot be reached by keyboard at all, so the div
// is a labelled region with a tab stop, exactly as balances.tsx and the approvals table now do it.
import { TriangleAlert } from "lucide-react";
import { DemoBadge } from "./badges";
import { formatDays } from "./balances";
import { groupByPerson, type ReportRow } from "../server/reports";

const mono = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" } as const;

/** `allowance` is null when the type has no cap — not zero, because zero is a budget somebody set. */
function Allowance({ row }: { row: ReportRow }) {
  if (!row.is_capped) return <span className="muted">No cap</span>;
  return <>{formatDays(row.allowance ?? 0)}</>;
}

/**
 * The same over-balance chip the balances panel wears (#229), with the words "over" in it. The colour is
 * decoration: FR-028's rule is that a state never travels as colour alone, and here the sentence and the
 * icon both say it, so the chip reads in a monochrome export and to a screen reader alike.
 */
function Available({ row }: { row: ReportRow }) {
  if (!row.is_capped) return <span className="muted">Not applicable</span>;
  const available = row.available ?? 0;
  if (available >= 0) return <>{formatDays(available)}</>;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
        padding: "2px var(--space-2)",
        borderRadius: "var(--radius-control)",
        background: "var(--pending-bg)",
        color: "var(--pending-text)",
        fontWeight: 500,
      }}
    >
      <TriangleAlert size={14} strokeWidth={1.5} aria-hidden />
      {formatDays(available)} (over)
    </span>
  );
}

export function ReportTable({ rows, year }: { rows: ReportRow[]; year: number }) {
  const groups = groupByPerson(rows);

  return (
    <div style={{ overflowX: "auto" }} tabIndex={0} role="region" aria-label={`Leave utilisation for ${year}, scrolls sideways`}>
      <table className="table">
        <caption className="sr-only">Leave utilisation for {year}: each person, each leave type</caption>
        <thead>
          <tr>
            <th scope="col">Person</th>
            <th scope="col">Leave type</th>
            <th scope="col">Allowance</th>
            <th scope="col">Taken</th>
            <th scope="col">Pending</th>
            <th scope="col">Available</th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.personId}>
            {g.rows.map((r, i) => (
              <tr key={r.leave_type_id}>
                {i === 0 && (
                  <th scope="rowgroup" rowSpan={g.rows.length} style={{ fontWeight: 500, background: "transparent", color: "var(--text)" }}>
                    <span className="stack" style={{ gap: "var(--space-1)" }}>
                      {g.personName}
                      {g.isDemo && <DemoBadge />}
                    </span>
                  </th>
                )}
                <th scope="row" style={{ fontWeight: 400, background: "transparent", color: "var(--text)" }}>
                  {r.leave_type_name}
                </th>
                <td style={mono}>
                  <Allowance row={r} />
                </td>
                <td style={mono}>{formatDays(r.taken)}</td>
                <td style={mono}>{formatDays(r.pending)}</td>
                <td style={mono}>
                  <Available row={r} />
                </td>
              </tr>
            ))}
          </tbody>
        ))}
        {groups.length === 0 && (
          <tbody>
            <tr>
              <td colSpan={6} className="muted">
                No active leave types yet, so there is nothing to report.
              </td>
            </tr>
          </tbody>
        )}
      </table>
    </div>
  );
}
