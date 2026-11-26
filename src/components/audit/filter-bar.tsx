// A071 — the admin Audit page's seven filters, written into the URL rather than into state.
//
// A GET `<form>`, and that choice is the feature. FR-024 promises a filtered view can be shared, and
// the only thing a reader can actually share is the address bar, so every control's `name` is one of
// the keys `parseFilters` reads and the query the browser builds is the whole state. No `"use client"`,
// no hydration, no effect: the bar works with scripts blocked, works on the slow phone the spec keeps
// mentioning, and the browser's own Back returns a filter set the way a person expects.
//
// The option lists are imported rather than written out. `AUDIT_ACTIONS` is what the database's
// `audit_log_action_known` check accepts and `AUDIT_ENTITIES` is what the audit triggers write (A070
// keeps both in `src/server/audit.ts` for exactly this reason): a screen that retyped either list
// would drift the day an action was added, and the constraint is the one that is right. `people` is a
// prop because it is data rather than vocabulary — A072 fetches and orders it, this renders it.
//
// Two meanings have to stay straight here, because `parseFilters` keeps them straight and an address
// bar cannot:
//
//   * an empty control means *not filtered*, which is why every select carries an empty-valued option.
//     A GET form then submits `person=` and `parseFilters`'s own rule reads that as no filter, so the
//     noise in the URL is harmless — but a query this file *generates* (the Export link) leaves the
//     blank out entirely, because a hand-pasted link should read like the filters it applies.
//   * `demo` has no empty value. D9 wants real entries unless the URL asks for demo, so its default is
//     `false` and no view here means "both". `false` is therefore omitted from a generated query rather
//     than written into it: leaving it out parses to the same answer, and a shorter URL is shareable.
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from "../../server/audit";

/** The seven keys, in the order `parseFilters` names them and the order the bar shows them. */
export const FILTER_NAMES = ["person", "action", "entity", "role", "demo", "from", "to"] as const;

export type FilterName = (typeof FILTER_NAMES)[number];

/**
 * Every value as a string, because this is what a form control holds — not what the filter means.
 * `""` is "unset" for six of them; `demo` is the exception and always reads `true` or `false`.
 */
export type FilterValues = Record<FilterName, string>;

/** One value per key, the same rule `parseFilters` applies to a repeated param: a form writes each key
 * once, so an array is a hand-made URL, and the browser sent the first one first. */
function one(value: string | string[] | undefined): string {
  const first = Array.isArray(value) ? value[0] : value;
  return first ?? "";
}

/**
 * The query as the controls should echo it.
 *
 * Values are copied verbatim rather than validated, and that is deliberate: a mistyped `from` is the
 * one thing the admin needs to *see* mistyped, because A072 names the rejected filters beside this
 * bar. A `<select>` given a value that is not among its options shows nothing selected, which is the
 * honest answer; a date input given one shows the browser's own placeholder, which is the same.
 *
 * `demo` is the one key read rather than copied, because a radio group cannot be checked to a value it
 * does not offer: anything that is not exactly `true` falls back to Real, which is also what
 * `parseFilters` lands on when it rejects the param, so the control and the read agree.
 */
export function valuesFromSearchParams(searchParams: Record<string, string | string[] | undefined>): FilterValues {
  return {
    person: one(searchParams.person),
    action: one(searchParams.action),
    entity: one(searchParams.entity),
    role: one(searchParams.role),
    demo: one(searchParams.demo) === "true" ? "true" : "false",
    from: one(searchParams.from),
    to: one(searchParams.to),
  };
}

/**
 * The canonical query for a link that has to mean what this page means — the Export link, and A072's
 * own "clear one filter" links if they arrive.
 *
 * Unset keys are left out, and `demo=false` is left out with them. Nothing here re-encodes a value:
 * whatever the bar was given for `from` is what the file is asked for, so a filter this page could not
 * read is a filter the export refuses too. That is the property worth having — the alternative,
 * building the export query from the *parsed* filters, would silently widen a mistyped one, and an
 * admin who typed `from=3 Mar` would get every entry in the file while the screen showed a rejected
 * filter. A073 answers 400, and this is why it gets the chance.
 */
export function queryFromValues(values: FilterValues): string {
  const params = new URLSearchParams();
  for (const name of FILTER_NAMES) {
    const value = values[name];
    if (value === "") continue;
    if (name === "demo" && value === "false") continue;
    params.set(name, value);
  }
  return params.toString();
}

/**
 * `request_approved` as words.
 *
 * Derived from the value rather than kept in a second table, because the value is what the database
 * constrains and what the CSV column holds: a label list beside those two is a third thing to update,
 * and the third thing is always the one that is missed. The snake_case is already the phrase; this only
 * capitalises the first letter, so `leave_type_default_changed` reads "Leave type default changed".
 *
 * Exported for one test: `tests/unit/audit.test.ts` asserts the eleven actions and four entities stay
 * distinguishable once prettified. Two options that read alike are a filter nobody can aim.
 */
export function labelFor(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}

const ROLES = ["employee", "manager", "admin"] as const;

/**
 * The filter bar.
 *
 * `route` is the page this bar sits on, so the form posts its query to the address the reader is
 * looking at and "Reset" is that address with nothing left on it. The exporter is `${route}/export`
 * because that is the path A073 owns and A067's guard walks the tree to find — if it ever moves, the
 * e2e reports it rather than this file guessing.
 *
 * A grid, not the `.inline-form` row the admin forms use, because the row sizes each field to its
 * content and seven fields sized to their content is a horizontal scroll on a phone: DIRECTION.md asks
 * for one column at 360 px. `minmax(min(220px, 100%), 1fr)` is the whole trick — the `min()` keeps the
 * track floor from ever exceeding the container, so the columns collapse instead of pushing the page
 * sideways, and the `min-width: 0` on each field is what lets a long `<option>` shrink to fit.
 */
export function FilterBar({
  route,
  searchParams,
  people,
}: {
  route: string;
  searchParams: Record<string, string | string[] | undefined>;
  people: { id: string; name: string }[];
}) {
  const values = valuesFromSearchParams(searchParams);
  const query = queryFromValues(values);
  const exportHref = query === "" ? `${route}/export` : `${route}/export?${query}`;

  // A person the URL names but the list does not offer: an account deleted long enough that its
  // entries only carry a name snapshot. The filter is still applied, so the control has to show that
  // somebody is being filtered on — the id, since nothing here knows the snapshot's spelling.
  const offered =
    values.person === "" || people.some((p) => p.id === values.person) ? people : [{ id: values.person, name: values.person }, ...people];

  return (
    <form method="get" action={route} aria-label="Audit filters" className="stack">
      <div
        style={{
          display: "grid",
          gap: "var(--space-3)",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
        }}
      >
        <label className="field" style={{ minWidth: 0 }}>
          Person
          <select className="input" name="person" defaultValue={values.person}>
            <option value="">Anyone</option>
            {offered.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ minWidth: 0 }}>
          Action
          <select className="input" name="action" defaultValue={values.action}>
            <option value="">Any action</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {labelFor(a)}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ minWidth: 0 }}>
          Entity
          <select className="input" name="entity" defaultValue={values.entity}>
            <option value="">Any type</option>
            {AUDIT_ENTITIES.map((e) => (
              <option key={e} value={e}>
                {labelFor(e)}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ minWidth: 0 }}>
          Role
          <select className="input" name="role" defaultValue={values.role}>
            <option value="">Any role</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {labelFor(r)}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ minWidth: 0 }}>
          From
          {/* Each date bounds the other, so a reversed range is a browser message rather than a query
              that returns nothing and looks like an empty log. It is a guard on the *control*: the URL
              can still carry `from` after `to`, and A069 decides what that range means. */}
          <input className="input" type="date" name="from" defaultValue={values.from} max={values.to === "" ? undefined : values.to} />
        </label>
        <label className="field" style={{ minWidth: 0 }}>
          To
          <input className="input" type="date" name="to" defaultValue={values.to} min={values.from === "" ? undefined : values.from} />
        </label>
        <fieldset
          className="field"
          style={{ border: 0, margin: 0, minWidth: 0, padding: 0 }}
        >
          <legend style={{ fontSize: "14px", fontWeight: 500, padding: 0 }}>Demo or real</legend>
          {/* A radio group, not a checkbox: these are the two views D9 says the page has, and a checkbox
              that is unticked means two different things depending on who reads it. Arrow keys select,
              which is what makes the group reachable without a pointer. */}
          {(["false", "true"] as const).map((v) => (
            <label key={v} style={{ alignItems: "center", display: "flex", gap: "var(--space-2)", minHeight: "var(--row-height)" }}>
              <input type="radio" name="demo" value={v} defaultChecked={values.demo === v} />
              {v === "false" ? "Real entries" : "Demo entries"}
            </label>
          ))}
        </fieldset>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
        <button className="btn" type="submit">
          Apply filters
        </button>
        {/* Reset is the route with nothing on it, which is also what the reader gets: no filters, newest
            page. A `button` that clears seven fields would need scripting to do the same one thing. */}
        <a className="btn btn-secondary" href={route}>
          Reset
        </a>
        {/* FR-025 exports the *filtered* entries, so the link carries this query; A067 asserts the same
            rows in the file and on the page, and A073 reads these keys with the same parser. */}
        <a className="btn btn-secondary" href={exportHref}>
          Export CSV
        </a>
      </div>
    </form>
  );
}
