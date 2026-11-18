import Link from "next/link";
import { StatusBadge } from "../../../components/badges";
import { formatDays } from "../../../components/balances";
import { formatPlainDate } from "../../../lib/dates";
import { createClient } from "../../../lib/supabase/server";
import { getRequestViewer } from "../../../server/auth";

/**
 * The three filter tabs, which are exactly the members of the `public.request_status` enum. The
 * labels are spelled the way `StatusBadge` spells them, so the word a reader picks from the row of
 * tabs is the word still on the screen once the rows they narrowed to arrive.
 */
const STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "declined", label: "Declined" },
] as const;

type Status = (typeof STATUSES)[number]["value"];
type StatusFilter = (typeof STATUSES)[number];

type Props = { searchParams: Promise<{ status?: string }> };

/**
 * `null` means show everything.
 *
 * A value outside the allowlist becomes `null` rather than an error, because `?status=` narrows a
 * view of a list and there is no missing thing to report: a mistyped or stale link still shows the
 * reader their requests, just all of them. `/admin/holidays` answers a bad `year` the same way.
 */
function filterFrom(params: { status?: string }): StatusFilter | null {
  return STATUSES.find((s) => s.value === params.status) ?? null;
}

export default async function RequestsPage({ searchParams }: Props) {
  const viewer = await getRequestViewer();
  if (!viewer) return null; // the (app) layout redirects signed-out users

  const filter = filterFrom(await searchParams);
  const supabase = await createClient();
  let query = supabase
    .from("leave_requests")
    .select(
      "id, start_date, end_date, working_days, status, decision_comment, leave_types(name), decider:profiles!leave_requests_decided_by_fkey(full_name)",
    )
    .eq("user_id", viewer.id);
  // Narrowed in the database, not over the rows in JS: the table has no page boundary to trim
  // against, so a filter applied after the query is a filter applied to whatever the query returned.
  if (filter) query = query.eq("status", filter.value);
  const { data, error } = await query
    .order("start_date", { ascending: false })
    .order("created_at", { ascending: false });

  const requests = data ?? [];
  const href = (value: Status | null) => (value ? `/requests?status=${value}` : "/requests");
  // The same words the tabs are made of, for the two sentences that say which filter is on.
  const scope = filter ? filter.label.toLowerCase() : null;

  return (
    <div className="stack">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)" }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>My requests</h1>
        <Link href="/requests/new" className="btn" style={{ display: "inline-flex", alignItems: "center" }}>
          Request leave
        </Link>
      </div>
      <section className="card stack" aria-label="My leave requests">
        <nav aria-label="Filter by status" className="tabs">
          <Link href={href(null)} className="tab" aria-current={filter === null ? "page" : undefined}>
            All
          </Link>
          {STATUSES.map((s) => (
            <Link
              key={s.value}
              href={href(s.value)}
              className="tab"
              aria-current={filter?.value === s.value ? "page" : undefined}
            >
              {s.label}
            </Link>
          ))}
        </nav>
        {error ? (
          <p className="alert">We couldn’t load your requests. Try again shortly.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <caption className="sr-only">
                {scope ? `My ${scope} requests, newest first` : "My leave requests, newest first"}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Type</th>
                  <th scope="col">Dates</th>
                  <th scope="col">Working days</th>
                  <th scope="col">Status</th>
                  <th scope="col">Decided by</th>
                  <th scope="col">Comment</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td>{r.leave_types?.name ?? "Unknown"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {r.start_date === r.end_date
                        ? formatPlainDate(r.start_date)
                        : `${formatPlainDate(r.start_date)} – ${formatPlainDate(r.end_date)}`}
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                      {formatDays(r.working_days)}
                    </td>
                    <td>
                      <StatusBadge status={r.status as "pending" | "approved" | "declined"} />
                    </td>
                    <td>{r.decider?.full_name ?? <span className="muted">—</span>}</td>
                    <td>{r.decision_comment ?? <span className="muted">—</span>}</td>
                  </tr>
                ))}
                {requests.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">
                      {/* An empty filter and an empty list are different facts, and only one of them
                          tells the reader the tab they picked is working. */}
                      {scope ? `You have no ${scope} requests.` : "You haven’t requested any leave yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
