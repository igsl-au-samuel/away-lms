// A072 — the admin Audit page: every entry, for the one role allowed to read them, filtered by URL.
//
// The guard is `getAdminViewer()` and `<Forbidden />`, the idiom every other admin page uses. The
// layout checks the same role one level up, but `src/server/auth.ts:43` says plainly that a layout
// alone is not a security boundary, so the page checks for itself before it asks the database for
// anything. `audit_search` refusing a non-admin inside SQL (FR-005) is the third copy of the rule and
// the only one a future edit cannot forget.
//
// The page's guard does not reach the download. A route handler is not a child of a layout, so
// `./export/route.ts` (A073) has to write the same rule again for itself.
//
// Nothing here holds state. `parseFilters` reads the address bar, the links this page builds write it
// back, and so the view a reader pastes to a colleague is the view they see (FR-024). A071's
// `queryFromValues` is what rebuilds the filter part of a URL here, which is why "Load older", "Try
// again" and "Export CSV" all carry the same seven keys rather than each page inventing an encoding.
import { EntryList } from "../../../../components/audit/entry-list";
import { FilterBar, queryFromValues, valuesFromSearchParams } from "../../../../components/audit/filter-bar";
import { AuditEmpty, AuditFilteredEmpty, AuditRetry } from "../../../../components/audit/audit-states";
import { Forbidden } from "../../../../components/forbidden";
import { createClient } from "../../../../lib/supabase/server";
import { getAdminViewer } from "../../../../server/auth";
import { fetchAudit, parseFilters } from "../../../../server/audit";

/** Rows per page. `audit_search`'s own default and cap are 50 and 100, and naming 50 here is what lets
 * the page know whether an older page can exist — the same reasoning as `PAGE_SIZE` on `/history`. */
const PAGE_SIZE = 50;

/** The route this file is served at, with the `(app)` group removed. `tests/e2e/audit.spec.ts` derives
 * it by walking `src/app` instead of typing it, so if this page ever moves the e2e follows it; the
 * constant exists so the links below are built from one place rather than repeated four times. */
const ROUTE = "/admin/audit";

/**
 * The filters the URL carried that this page could not read.
 *
 * `parseFilters` returns names rather than throwing, because the dangerous direction is the quiet one:
 * an unreadable filter is treated as unset, which means the list got *wider*, and a wider list looks
 * exactly like the list the admin asked for. So the names go on the page in the order the bar shows
 * them, in `role="alert"` for the same reason the retry state uses it (FR-026) — an announcement that
 * the answer may not be the question.
 */
function RejectedFilters({ names }: { names: string[] }) {
  return (
    <p className="alert" role="alert">
      We couldn’t read these filters: {names.join(", ")}. They were not applied, so this list may be
      wider than you meant.
    </p>
  );
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await getAdminViewer();
  if (!viewer) return <Forbidden />;

  const params = await searchParams;
  const { filters, cursor, rejected } = parseFilters(params, viewer.timezone);
  const c = await createClient();

  // Two reads, one await: the trail itself and the list of people to filter by. They do not depend on
  // each other, so neither waits for the other's round trip. `full_name` is mapped here rather than
  // passed through because the bar's prop is a display name, not a column — the component should not
  // have to know how the profile table spells it.
  const [{ entries, error }, peopleResult] = await Promise.all([
    fetchAudit(c, filters, { ...cursor, limit: PAGE_SIZE }),
    c.from("profiles").select("id, full_name").order("full_name"),
  ]);
  const people = (peopleResult.data ?? []).map((p) => ({ id: p.id, name: p.full_name }));

  // The filters as one canonical query string, without the cursor. `valuesFromSearchParams` echoes
  // what the address bar held and `queryFromValues` drops what is unset, which is what makes the three
  // links below mean the same view the page is showing — A071's round-trip tests are what prove that
  // this line cannot quietly disagree with `parseFilters` above.
  const view = queryFromValues(valuesFromSearchParams(params));
  const retryHref = view === "" ? ROUTE : `${ROUTE}?${view}`;

  const last = entries.at(-1);
  // A full page is the only evidence of an older one, exactly as on `/history`: a short page is the end
  // of the filtered set, so the link is absent rather than disabled.
  let olderHref: string | null = null;
  if (error === null && last !== undefined && entries.length === PAGE_SIZE) {
    const older = new URLSearchParams(view);
    older.set("before_at", last.created_at);
    older.set("before_id", String(last.id));
    olderHref = `${ROUTE}?${older.toString()}`;
  }

  return (
    <div className="stack">
      <h1>Audit</h1>
      <FilterBar route={ROUTE} searchParams={params} people={people} />
      {rejected.length > 0 && <RejectedFilters names={rejected} />}
      {/* The cap, stated as a property of the file rather than of this filter set. Whether *this* view
          exceeds 10,000 rows is `audit_export_csv`'s `truncated` flag — and learning it here would
          mean building a 10,000-row file to read one boolean, on every page view, which is the opposite
          of SC-008. The per-file truth travels as the `X-Audit-Truncated` response header (A073), which
          A067 asserts; A068's volume seed is what would let a test assert the sentence on the page. */}
      <p className="muted">A CSV download holds the first 10,000 matching entries — narrow the filters if that is not all of them.</p>
      {error !== null ? (
        <AuditRetry retryHref={retryHref} />
      ) : entries.length === 0 ? (
        view === "" ? (
          <AuditEmpty />
        ) : (
          <AuditFilteredEmpty resetHref={ROUTE} />
        )
      ) : (
        <EntryList entries={entries} timeZone={viewer.timezone} olderHref={olderHref} />
      )}
    </div>
  );
}
