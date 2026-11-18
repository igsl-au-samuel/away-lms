// One entry per row, and every word in the row comes from src/server/audit.ts — this component
// decides no wording and no order of its own, because A053 pinned both before it existed.
//
// A list rather than a table, and the reason is the phone: `docs/design/DIRECTION.md` asks for a
// 44 px touch row and stacked content at 360 px, and a six-column table can only get there by
// hiding columns. Here there is nothing to hide — the sentence already carries who did what to
// whom, so the cells that stay beside it are the ones that add something: the instant, the
// before/after pair, the labels.
//
// Plain `{text}` throughout. `describeEntry` returns a comment inside the sentence as a string,
// including a comment that contains markup, and React escapes it on render; `dangerouslySetInnerHTML`
// would turn a colleague's note into this page's HTML.
import { describeChange, describeEntry, describeLabels, describeWhen, type AuditEntry } from "../../server/audit";

const mono = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" } as const;

/**
 * `Demo` and `System` as words, never colour alone (FR-028). A badge is fine as well, but the
 * word is what carries the meaning: `describeLabels` follows `actor_id`, so the label here says
 * "no signed-in person made this change" (FR-009) rather than naming anybody.
 */
function Labels({ entry }: { entry: AuditEntry }) {
  const labels = describeLabels(entry);
  if (labels.length === 0) return null;
  return (
    <span style={{ display: "inline-flex", gap: "var(--space-2)" }}>
      {labels.map((label) => (
        <span
          key={label}
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-control)",
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
            padding: "2px var(--space-2)",
          }}
        >
          {label}
        </span>
      ))}
    </span>
  );
}

/**
 * The history, newest first, with the keyset cursor in the "Load older" link.
 *
 * `olderHref` is built by the page from the last entry it rendered — `before_at` and `before_id`,
 * the same two columns `audit_my_history` pages on — and is null when there is no further page,
 * which is why the link simply is not there rather than being disabled: a disabled control invites
 * a reader to wonder what they are missing.
 *
 * An empty list is not this component's decision. Only `entries: []` *with no error* may show the
 * empty state, and that pair is `audit-states.tsx`'s (A058), so a failed read cannot look like an
 * empty history.
 */
export function EntryList({ entries, timeZone, olderHref }: { entries: AuditEntry[]; timeZone: string; olderHref: string | null }) {
  return (
    <>
      <ul aria-label="History entries" style={{ display: "grid", gap: "var(--space-3)", listStyle: "none", margin: 0, padding: 0 }}>
        {entries.map((entry) => {
          const change = describeChange(entry);
          return (
            <li
              key={entry.id}
              style={{
                borderBottom: "1px solid var(--border)",
                display: "grid",
                gap: "var(--space-1)",
                minHeight: "var(--row-height)",
                paddingBottom: "var(--space-3)",
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", justifyContent: "space-between" }}>
                <span style={mono}>{describeWhen(entry, timeZone)}</span>
                <Labels entry={entry} />
              </div>
              <div>{describeEntry(entry)}</div>
              {change !== "" && (
                <div className="muted" style={mono}>
                  {change}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {olderHref !== null && (
        <p style={{ marginTop: "var(--space-4)" }}>
          <a className="btn btn-secondary" href={olderHref}>
            Load older
          </a>
        </p>
      )}
    </>
  );
}
