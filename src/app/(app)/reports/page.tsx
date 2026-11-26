// #180 — the utilisation report: who has used how much of what, for one leave year.
//
// The guard is `getApproverViewer()` plus `<Forbidden />`, and `leave_report` refuses `not_allowed` in
// SQL as the second copy (FR-005). The page check is what stops an employee paying for a read that is
// going to be refused; the SQL check is the one a future edit cannot forget.
//
// The year is the URL, exactly as the audit view is: no state, so a report can be pasted to a colleague
// and the link a reader sends is the table they are looking at. It is also what makes the export honest —
// `./export/route.ts` reads the same `?year=` and calls the same helper, so the file cannot be for a
// different year from the one on screen.
//
// Reached from the dashboard's Approvals card rather than from the bottom bar. #423 is the open reason:
// an admin's bar already clips its sixth link at 360 px, and a seventh one is a design question under
// `docs/design/DIRECTION.md`, not something to settle inside a feature branch. `/history` is linked the
// same way.
import { Forbidden } from "../../../components/forbidden";
import { ReportTable } from "../../../components/report-table";
import { leaveYear } from "../../../lib/dates";
import { createClient } from "../../../lib/supabase/server";
import { getApproverViewer } from "../../../server/auth";
import { fetchReport, parseYear } from "../../../server/reports";

/** The route this file is served at, `(app)` group removed — the same constant the export link is built
 * from, so the two cannot disagree about where `/reports` lives. */
const ROUTE = "/reports";

function YearStep({ year, current }: { year: number; current: number }) {
  if (year === current) {
    return (
      <span aria-current="page" style={{ fontWeight: 600 }}>
        {year}
      </span>
    );
  }
  return <a href={`${ROUTE}?year=${year}`}>{year}</a>;
}

/**
 * The year the address bar carried, or the viewer's own.
 *
 * `null` from `parseYear` means the URL held something that is not a four-digit year — and the page must
 * say so rather than quietly show a different year: a heading that reads "2026" above numbers a reader
 * asked for as "2o26" is only wrong to the one person who knows what they typed. So the fallback is the
 * current leave year *and* a sentence naming the substitution, in `role="alert"` for the reason FR-026
 * gives.
 */
function resolveYear(params: Record<string, string | string[] | undefined>, timeZone: string) {
  const { year } = parseYear(typeof params.year === "string" ? params.year : undefined);
  const fallback = leaveYear(timeZone);
  return { year: year ?? fallback, rejected: params.year !== undefined && year === null };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await getApproverViewer();
  if (!viewer) return <Forbidden />;

  const params = await searchParams;
  const { year, rejected } = resolveYear(params, viewer.timezone);
  const { rows, error } = await fetchReport(await createClient(), year);

  // Three years around the one being read. Stepping from the *shown* year rather than from today's is what
  // keeps "back" meaning back from where the reader is standing, and the spare link is the way out of a
  // year they stepped into by accident.
  const thisYear = leaveYear(viewer.timezone);
  const retryHref = `${ROUTE}?year=${year}`;

  return (
    <div className="stack">
      <h1 style={{ margin: 0, fontSize: 24 }}>Reports</h1>
      <p className="muted" style={{ margin: 0 }}>
        Leave used per person, for {year}. Requests still awaiting a decision count towards “pending”, not
        towards “taken”.
      </p>

      {rejected && (
        <p className="alert" role="alert">
          The year in the address bar could not be read, so this is {year} — your current leave year, not
          the one you asked for. <a href={retryHref}>Show the {year} report instead</a>
        </p>
      )}

      <nav aria-label="Leave year" className="tabs">
        <YearStep year={year - 1} current={year} />
        <YearStep year={year} current={year} />
        <YearStep year={year + 1} current={year} />
        {year !== thisYear && <a href={`${ROUTE}?year=${thisYear}`}>This year ({thisYear})</a>}
      </nav>

      <section className="card stack" aria-labelledby="report-heading">
        <h2 id="report-heading" style={{ margin: 0, fontSize: 20 }}>
          Utilisation for {year}
        </h2>
        {error !== null ? (
          <p className="alert" role="alert">
            We couldn’t load the report. <a href={retryHref}>Try again</a>
          </p>
        ) : (
          <ReportTable rows={rows} year={year} />
        )}
        {/* The download is offered even when the read failed: it is a separate call, and a page that
            could not load is not evidence that the file cannot be built. */}
        <p style={{ margin: 0 }}>
          <a className="btn btn-secondary" href={`${ROUTE}/export?year=${year}`}>
            Export CSV
          </a>
        </p>
        <p className="muted" style={{ margin: 0 }}>
          The file holds every row shown here and nothing else — no request dates, no notes, no decision
          comments.
        </p>
      </section>
    </div>
  );
}
