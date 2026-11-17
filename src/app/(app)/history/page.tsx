// The My history page (A059). Every signed-in active user gets their own trail here, newest first,
// and the only thing the URL controls is where the page starts.
//
// The cursor is the URL, not state: `before_at` and `before_id` are the two columns
// `audit_my_history` pages on, so "Load older" is a link rather than a button, and a reader can
// paste a page of their history to a colleague. It also means a bad cursor is a *URL* problem, and
// a URL problem has to answer with the error state rather than a stack trace — which is the only
// failing load a browser can actually reach (A054 explains why the other kinds cannot).
import { EntryList } from "../../../components/audit/entry-list";
import { AuditEmpty, AuditRetry } from "../../../components/audit/audit-states";
import { createClient } from "../../../lib/supabase/server";
import { getRequestViewer } from "../../../server/auth";
import { fetchMyHistory } from "../../../server/audit";

/**
 * The cursor, read loosely. Nothing here validates `before_at`: the database is the thing that
 * knows whether the string is a `timestamptz`, and a cursor it refuses is the reason the error
 * state exists. Re-formatting it here would be a second parser to keep in step with Postgres.
 */
function cursorFrom(searchParams: { before_at?: string; before_id?: string }) {
  const beforeAt = typeof searchParams.before_at === "string" ? searchParams.before_at : null;
  const beforeId = Number(searchParams.before_id);
  return { beforeAt, beforeId: Number.isSafeInteger(beforeId) && beforeId > 0 ? beforeId : null };
}

/** Rows per page. `audit_my_history`'s own default and cap are 50 and 100; naming it here is what
 * lets the page know whether a further page can exist at all. */
const PAGE_SIZE = 50;

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ before_at?: string; before_id?: string }>;
}) {
  const viewer = await getRequestViewer();
  if (!viewer) return null; // the (app) layout redirects signed-out and inactive users

  const cursor = cursorFrom(await searchParams);
  const { entries, error } = await fetchMyHistory(await createClient(), { ...cursor, limit: PAGE_SIZE });

  // The route with no query left on it: what "try again" has to mean when the cursor itself is
  // what failed. The path is written once, in this constant, and the older-page link below is built
  // from it — `tests/e2e/audit.spec.ts:21` reads the route off the file system, so if A060's entry
  // point ever moves the page it has to move once here rather than twice.
  const retryHref = "/history";
  const last = entries.at(-1);
  // A full page is the only evidence of an older one, and the evidence is the same size as the
  // page: a short page is the end of the trail, so "Load older" is absent rather than disabled —
  // and rather than a link that lands on "No history yet".
  const olderHref =
    error === null && last !== undefined && entries.length === PAGE_SIZE
      ? `${retryHref}?before_at=${encodeURIComponent(last.created_at)}&before_id=${last.id}`
      : null;

  return (
    <div className="stack">
      <h1>My history</h1>
      {error !== null ? (
        <AuditRetry retryHref={retryHref} />
      ) : entries.length === 0 ? (
        <AuditEmpty />
      ) : (
        <EntryList entries={entries} timeZone={viewer.timezone} olderHref={olderHref} />
      )}
    </div>
  );
}
