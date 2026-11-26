// A073 — the download: the same query, the same filters, the same one role, in a file.
//
// A route handler is not a child of a layout, so nothing above this file has already checked who is
// asking — and there is no page to render a refusal on even if it had. The role is checked here, on
// the way in, and `audit_export_csv` checks it again inside SQL as `not_allowed` (FR-005). The second
// copy is the one that cannot be forgotten by a later edit; the first is what stops a non-admin
// causing a ten-thousand-row aggregate to run at all.
//
// The read is the viewer's own session (`createClient()` is the publishable key bound to their
// cookies, never the secret service key), so RLS on `audit_log` decides every row that reaches the
// file. Nothing here widens what the database allows; it only formats it.
//
// Two answers deliberately differ from the page beside this file. An unreadable filter is named and
// refused rather than dropped, because a page can put a warning next to a list and still be useful
// while a file cannot warn anyone — and a CSV that quietly grew is the failure FR-026 is about. And
// the cursor is ignored: a file is not a page, and A071 keeps `before_at`/`before_id` out of the
// export link so the question never arises on the way here.
import type { NextRequest } from "next/server";
import { todayIn } from "../../../../../lib/dates";
import { createClient } from "../../../../../lib/supabase/server";
import { getAdminViewer } from "../../../../../server/auth";
import { exportAuditCsv, parseFilters, queryParams } from "../../../../../server/audit";

/** A trail is appended to, never rewritten — so a cached file is a file that can be wrong. `no-store`
 * goes on every answer this route gives, including the refusals. */
const NO_STORE = { "cache-control": "no-store" };

/** Plain text, because a browser opens this response rather than downloading it, and a person who
 * followed a link here deserves a sentence and not a parse error. */
function refuse(status: number, why: string): Response {
  return new Response(why, {
    status,
    headers: { ...NO_STORE, "content-type": "text/plain; charset=utf-8" },
  });
}

export async function GET(request: NextRequest): Promise<Response> {
  const viewer = await getAdminViewer();
  if (viewer === null) {
    return refuse(403, "This file is for an admin's session. Sign in as one and ask again.");
  }

  const { filters, rejected } = parseFilters(queryParams(request.nextUrl.searchParams), viewer.timezone);
  if (rejected.length > 0) {
    return refuse(
      400,
      `These filters could not be read: ${rejected.join(", ")}. Nothing was exported, because a file ` +
        "wider than the list you were looking at is not the file you asked for.",
    );
  }

  const { csv, truncated, error } = await exportAuditCsv(await createClient(), filters, viewer.timezone);
  if (error !== null) {
    // The session can expire or the role change between the guard above and the call, and the
    // database's opinion is the one that wins. Anything else — including a zone this reader's profile
    // carries but Postgres does not know — is a server-side failure no query could have caused.
    if (error.message === "not_allowed") {
      return refuse(403, "The database refused this read, so nothing was exported. Sign in again as an admin.");
    }
    return refuse(500, "The entries could not be read. Nothing was exported.");
  }

  // The viewer's calendar day, not the server's: `todayIn` is the same rule every timestamp on the
  // page follows, and a naive UTC slice names the wrong day for twelve hours of every Sydney day.
  const filename = `away-audit-${todayIn(viewer.timezone)}.csv`;
  return new Response(csv, {
    headers: {
      ...NO_STORE,
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "x-audit-truncated": String(truncated),
    },
  });
}
