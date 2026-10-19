export type AllowanceLogEntry = {
  id: number;
  leave_type: string;
  year: number | null;
  old_days: number | null;
  new_days: number | null;
  changed_by: string;
  changed_at: string;
  reason: string | null;
};

const mono = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" } as const;

function days(n: number | null): string {
  return n === null ? "Default" : String(n);
}

/** `timeZone` is the viewer's, so the time reads as their local time. */
export function AllowanceLog({ entries, timeZone }: { entries: AllowanceLogEntry[]; timeZone: string }) {
  if (entries.length === 0) return <p className="muted">No allowance changes yet.</p>;
  const fmt = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="table">
        <caption className="sr-only">Allowance changes</caption>
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">Leave type</th>
            <th scope="col">Old</th>
            <th scope="col">New</th>
            <th scope="col">Changed by</th>
            <th scope="col">Reason</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td style={mono}>{fmt.format(new Date(e.changed_at))}</td>
              <td>
                {e.leave_type}
                {e.year !== null && <span className="muted"> {e.year}</span>}
              </td>
              <td style={mono}>{days(e.old_days)}</td>
              <td style={mono}>{days(e.new_days)}</td>
              <td>{e.changed_by}</td>
              <td>{e.reason ?? <span className="muted">No reason given</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
