// #180's unit half: the two things that can be wrong without a database.
//
// `groupByPerson` decides whose rows sit together, so a report where a person's name appears once for
// three types — or three times for one type — is this function's fault, not SQL's. `ReportTable` is what
// makes that grouping readable, and the assertions here are the a11y ones a screenshot cannot make: the
// row headers, the words that carry "no cap" instead of a zero, and the focusable scroll region #438
// found missing from every table in this app.
//
// The arithmetic is not here. `taken`, `pending` and `available` arrive from `private.report_rows`, and
// row43_leave_report.sql is what pins them — a unit test could only re-assert a fixture it wrote itself.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportTable } from "../../src/components/report-table";
import { groupByPerson, parseYear, type ReportRow } from "../../src/server/reports";

function row(over: Partial<ReportRow> = {}): ReportRow {
  const base: ReportRow = {
    person_id: "u-ada",
    person_name: "Ada Byron",
    leave_type_id: "lt-annual",
    leave_type_name: "Annual leave",
    is_capped: true,
    allowance: 20,
    taken: 3,
    pending: 2,
    available: 15,
    is_demo: false,
  };
  return { ...base, ...over };
}

function html(...rows: ReportRow[]) {
  return renderToStaticMarkup(<ReportTable rows={rows} year={2026} />);
}

/** How many times a string appears. `toContain` cannot tell a name said once from a name said twice, and
 * "the person is named once for their whole block" is the claim the grouping makes. */
function count(markup: string, needle: string): number {
  return markup.split(needle).length - 1;
}

describe("parseYear", () => {
  it("takes a four-digit year and nothing else", () => {
    expect(parseYear("2026")).toEqual({ year: 2026 });
    expect(parseYear("0001")).toEqual({ year: 1 });
  });

  it("refuses what is not a year rather than coercing it", () => {
    for (const raw of ["2o26", "26", "20260", "2026-01", "", " 2026", "2026 ", undefined, null]) {
      expect(parseYear(raw), `parseYear(${JSON.stringify(raw)})`).toEqual({ year: null });
    }
  });
});

describe("groupByPerson", () => {
  it("says each person once, in the order the database returned them", () => {
    const groups = groupByPerson([
      row({ leave_type_id: "a", leave_type_name: "Annual" }),
      row({ leave_type_id: "b", leave_type_name: "Sick", taken: 1, available: 19 }),
      row({ person_id: "u-guy", person_name: "Guy Green", leave_type_id: "a", leave_type_name: "Annual" }),
    ]);
    expect(groups.map((g) => [g.personName, g.isDemo, g.rows.length])).toEqual([
      ["Ada Byron", false, 2],
      ["Guy Green", false, 1],
    ]);
    expect(groups[0].rows.map((r) => r.leave_type_name)).toEqual(["Annual", "Sick"]);
  });

  it("keeps two blocks for the same person when the rows are not adjacent", () => {
    // The SQL orders by person, so this cannot happen from a read. It can happen if a future edit drops
    // the ORDER BY, and the answer then has to be two visible headings rather than one wrong heading and
    // a silent merge — a report that claims a person has three types when the rows say two is the failure.
    const groups = groupByPerson([
      row({ leave_type_id: "a" }),
      row({ person_id: "u-guy", leave_type_id: "a" }),
      row({ leave_type_id: "b" }),
    ]);
    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g.personId)).toEqual(["u-ada", "u-guy", "u-ada"]);
  });

  it("returns nothing for nothing, so the empty row is reachable", () => {
    expect(groupByPerson([])).toEqual([]);
  });
});

describe("ReportTable", () => {
  it("gives a person one row-group header spanning their types, and each type its own row header", () => {
    const markup = html(
      row({ leave_type_id: "a", leave_type_name: "Annual" }),
      row({ leave_type_id: "b", leave_type_name: "Sick" }),
    );
    // `rowSpan`, not `rowspan`: this is what React 19 emits for the camelCase prop, and an assertion
    // written against the DOM spelling would fail for a reason that has nothing to do with the table.
    expect(markup).toContain('rowSpan="2"');
    expect(markup).toContain('scope="rowgroup"');
    expect((markup.match(/scope="row"/g) ?? []).length).toBe(2);
    expect(markup).toContain("Ada Byron");
    expect(count(markup, "Ada Byron")).toBe(1);
  });

  it("repeats the header for a second person instead of leaving their rows nameless", () => {
    const markup = html(row({ person_id: "u-ada" }), row({ person_id: "u-guy", person_name: "Guy Green" }));
    expect(markup).toContain("Guy Green");
    expect((markup.match(/scope="rowgroup"/g) ?? []).length).toBe(2);
  });

  it("writes “No cap” rather than zero, and “Not applicable” for the balance it cannot have", () => {
    const markup = html(row({ is_capped: false, allowance: null, available: null, taken: 1, pending: 0 }));
    expect(markup).toContain("No cap");
    expect(markup).toContain("Not applicable");
    expect(markup).not.toContain("20 days");
  });

  it("names an over balance in words and not only in colour", () => {
    const markup = html(row({ allowance: 10, taken: 13, pending: 0, available: -3 }));
    expect(markup).toContain("(over)");
    expect(markup).toContain("−3 days");
  });

  it("badges a demo person's block", () => {
    expect(html(row({ is_demo: true }))).toContain("Demo");
    expect(html(row({ is_demo: false }))).not.toContain("Demo");
  });

  it("is a keyboard-reachable scroll region labelled with the year (#438)", () => {
    const markup = html(row());
    expect(markup).toContain('role="region"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('aria-label="Leave utilisation for 2026, scrolls sideways"');
    expect(markup).toContain("overflow-x:auto");
  });

  it("says there is nothing to report when there are no rows, without hiding the columns", () => {
    const markup = html();
    expect(markup).toContain("No active leave types yet");
    expect(markup).toContain("<th");
    expect(markup).toContain('colSpan="6"');
  });
});
