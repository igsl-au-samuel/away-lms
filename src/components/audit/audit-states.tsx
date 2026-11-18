// The states an audit list can be in when it has no entries to show, in one file because the
// audit page (slice 4) and the My history page both need them and both must tell the same story.
//
// Which one a page shows is a decision about two values, not one: an empty list and a failed list
// are one pixel apart and mean opposite things, so a page that has an `error` in hand must not be
// able to reach "No history yet" by accident. FR-026 asks for that difference to be visible. A
// filtered list that matches nothing is a third thing again, which is why there are three
// components here and not two sentences swapped between them.

/**
 * Nothing to show, when the read worked. Only a genuine empty result with no error reaches this.
 *
 * On *this* page it is nearly unreachable, and that is worth recording before somebody tries to
 * test it: `audit_profiles` writes a `user_created` entry for every profile insert (A054), so a
 * signed-in user's own trail always has at least one row. The state stays because the Audit page
 * (slice 4) can genuinely match nothing — a filter combination with no entries behind it — and the
 * two pages are meant to say the same thing when they have nothing to say.
 */
export function AuditEmpty() {
  return <p className="muted">No history yet.</p>;
}

/**
 * The read failed. `role="alert"` so it is announced rather than merely coloured (FR-026).
 *
 * The words are this component's rather than `GENERIC_ERROR` for one reason: that copy is
 * "Something went wrong. Please try again.", and A054 pins the link's accessible name as
 * "Try again" — putting the two side by side instructs the reader twice in one line. The dashboard
 * already names the thing that failed ("We couldn't load your balances"), which is the register this
 * matches. A plain `<a>` rather than `next/link` because a retry is the one place a cached response
 * would be actively unhelpful: this has to ask the server again.
 *
 * `retryHref` is the route with the cursor taken out of it. A cursor the database refuses is the
 * failure a reader can actually reach — a bad `before_at` typed into the address bar, or one
 * copied from a stale tab — so the link has to point at the newest page rather than reload the
 * cursor that just failed, and A054's e2e test asserts that URL with no query left on it.
 */
export function AuditRetry({ retryHref }: { retryHref: string }) {
  return (
    <p className="alert" role="alert">
      We couldn’t load this history. <a href={retryHref}>Try again</a>
    </p>
  );
}

/**
 * Nothing to show *because the filters said so* — the Audit page's, not the employee page's.
 *
 * A067 pins this sentence before the page exists, and the reason it is a second component rather than
 * one more prop on `AuditEmpty` is that the two say opposite things: "No history yet" claims the log
 * is empty, which is never true of an append-only audit trail that has just had a filter applied to
 * it. A reader who is told the history does not exist when their own date range excluded it goes and
 * checks the wrong thing. `audit-states.tsx`'s own opening note already named this page as the one
 * that can really reach the state.
 *
 * `resetHref` is the route with the filters taken out of it — the cursor too, since a cursor is not a
 * filter and clearing a view that returned nothing should land on the newest page, not on page seven
 * of nothing.
 */
export function AuditFilteredEmpty({ resetHref }: { resetHref: string }) {
  return (
    <p className="muted">
      No entries match those filters. <a href={resetHref}>Clear the filters</a>
    </p>
  );
}
