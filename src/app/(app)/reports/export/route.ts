// #180 — the download: the same rows, the same year, the same one gate, in a file.
//
// A route handler is not a child of a layout, so nothing above this file has already checked who is
// asking. `getApproverViewer()` is the first copy of the rule and `leave_report_csv`'s `not_allowed` is
// the second — the same split A073's route documents, and for the same reason: the SQL one is what a
// later edit cannot forget, the code one is what stops a non-approver running a whole-roster aggregate.
//
// One read, not one per person: `leave_report_csv` calls the same `private.report_rows` the page calls,
// so "the file has the rows the screen showed" is a property of the SQL rather than a promise this
// handler has to keep in step. `x-report-rows` carries the count the database produced so a test can
// compare it with the rows on the page instead of counting lines in a body.
//
// An unreadable year is refused here and warned about on the page. A page can put a sentence beside a
// table; a file has nobody to warn, and a CSV named for one year that holds another is the kind of
// wrong that gets forwarded.
import type { NextRequest } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { getApproverViewer } from "../../../../server/auth";
import { exportReportCsv, parseYear } from "../../../../server/reports";

/** Rows are recomputed on every request — a request approved a minute ago changes the file — so no
 * answer this route gives may be cached, refusals included. */
const NO_STORE = { "cache-control": "no-store" };

/** Plain text, because a browser opens this response instead of downloading it, and a person who
 * followed a link here deserves a sentence rather than a parse error. */
function refuse(status: number, why: string): Response {
  return new Response(why, {
    status,
    headers: { ...NO_STORE, "content-type": "text/plain; charset=utf-8" },
  });
}

export async function GET(request: NextRequest): Promise<Response> {
  const viewer = await getApproverViewer();
  if (viewer === null) {
    return refuse(403, "This file is for a manager's or an admin's session. Sign in as one and ask again.");
  }

  const { year } = parseYear(request.nextUrl.searchParams.get("year"));
  if (year === null) {
    return refuse(
      400,
      "The year in this URL could not be read, so nothing was exported. A file cannot tell you it " +
        "settled on a different year than the one you asked for.",
    );
  }

  const { csv, rowCount, error } = await exportReportCsv(await createClient(), year);
  if (error !== null) {
    // The session can expire or the role change between the guard above and the call, and the database's
    // opinion is the one that wins. Anything else is a server-side failure no query could have caused.
    if (error.message === "not_allowed") {
      return refuse(403, "The database refused this read, so nothing was exported. Sign in again as an approver.");
    }
    return refuse(500, "The report could not be read. Nothing was exported.");
  }

  // The leave year in the name, not the download date: a manager with three of these files open has to be
  // able to tell which year each one is for without opening them.
  return new Response(csv, {
    headers: {
      ...NO_STORE,
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="away-reports-${year}.csv"`,
      "x-report-rows": String(rowCount),
    },
  });
}
