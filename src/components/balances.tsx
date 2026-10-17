import { TriangleAlert } from "lucide-react";

export type BalanceRow = {
  leave_type_id: string;
  name: string;
  is_capped: boolean;
  allowance: number;
  taken: number;
  pending: number;
  available: number;
};

const mono = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" } as const;

export function formatDays(n: number): string {
  const abs = Math.abs(n);
  const text = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
  return `${n < 0 ? "−" : ""}${text} ${abs === 1 ? "day" : "days"}`;
}

function Available({ row }: { row: BalanceRow }) {
  if (row.available < 0) {
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
        {formatDays(row.available)} (over)
      </span>
    );
  }
  return <>{formatDays(row.available)}</>;
}

export function Balances({ rows, year }: { rows: BalanceRow[]; year: number }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="table">
        <caption className="sr-only">Leave balances for {year}</caption>
        <thead>
          <tr>
            <th scope="col">Leave type</th>
            <th scope="col">Allowance</th>
            <th scope="col">Taken</th>
            <th scope="col">Pending</th>
            <th scope="col">Available</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.leave_type_id}>
              <th scope="row" style={{ fontWeight: 500, background: "transparent", color: "var(--text)" }}>
                {r.name}
              </th>
              <td style={mono}>{r.is_capped ? formatDays(r.allowance) : <span className="muted">No cap</span>}</td>
              <td style={mono}>{formatDays(r.taken)}</td>
              <td style={mono}>{formatDays(r.pending)}</td>
              <td style={mono}>{r.is_capped ? <Available row={r} /> : <span className="muted">Not applicable</span>}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No leave types yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
