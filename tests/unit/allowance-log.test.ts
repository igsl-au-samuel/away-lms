// A037: the two halves of the allowance log after slice 2 — the mapper that turns one
// audit_log row into an AllowanceLogEntry, and the table that renders it.
//
// The mapper does not exist yet; A040 writes it into src/server/allowance-log.ts. Its tests
// are therefore skipped, not deleted and not faked: describe.skip reports twelve skipped
// tests, which is countable, whereas an assertion that returns early is a pass that proves
// nothing. A040 removes the .skip on the describe and the @ts-expect-error on the import in
// the same commit, and its PR body shows the count going from skipped to run — the compiler
// makes the second half of that unavoidable, because an unused @ts-expect-error is an error.
//
// The render half runs today. allowance-log.tsx already prints "Default" for a null new
// value and "No reason given" for a null comment; those are the two cells the new actions
// lean on, so pinning them now is what tells A040 the mapper must produce nulls rather than
// empty strings.
//
// The file is .ts, not .tsx like badges.test.tsx, because that is the path A037 names in
// specs/002-transaction-audit/tasks.md; createElement stands in for JSX.
import { existsSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AllowanceLog, type AllowanceLogEntry } from "../../src/components/allowance-log";

// What one audit_log row looks like to the reader. `before`, `after` and `context` are jsonb,
// so PostgREST hands back objects with real numbers, not the text that ->> would give.
// This is the shape A040 selects; the mapper's whole job is this to AllowanceLogEntry.
type AuditRow = {
  id: number;
  action: "allowance_set" | "allowance_removed" | "leave_type_default_changed";
  actor_name: string | null;
  created_at: string;
  comment: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  context: Record<string, unknown> | null;
};

type Mapper = (row: AuditRow) => AllowanceLogEntry;

function row(over: Partial<AuditRow> = {}): AuditRow {
  return {
    id: 7,
    action: "allowance_set",
    actor_name: "Ada Manager",
    created_at: "2026-11-17T01:00:00Z",
    comment: "Long service",
    before: { days: 20, is_capped: true },
    after: { days: 25, is_capped: true },
    context: { leave_type_id: "lt-1", leave_type_name: "Annual leave", year: 2026, default_days: 20 },
    ...over,
  };
}

function entry(over: Partial<AllowanceLogEntry> = {}): AllowanceLogEntry {
  return {
    id: 7,
    leave_type: "Annual leave",
    year: 2026,
    old_days: 20,
    new_days: 25,
    changed_by: "Ada Manager",
    changed_at: "2026-11-17T01:00:00Z",
    reason: "Long service",
    ...over,
  };
}

const log = (entries: AllowanceLogEntry[]): string =>
  renderToStaticMarkup(createElement(AllowanceLog, { entries, timeZone: "Australia/Brisbane" }));

// The mapper module is the only thing standing between this file and twelve skipped tests.
// Its path is checked on disk so the skip reason says which half is missing, and stays true
// for as long as A040 has not landed.
const mapperLanded = existsSync(new URL("../../src/server/allowance-log.ts", import.meta.url));

async function mapper(): Promise<Mapper> {
  // @ts-expect-error A040 creates src/server/allowance-log.ts; delete this line with the .skip.
  const mod = await import("../../src/server/allowance-log");
  return mod.toAllowanceLogEntry as Mapper;
}

describe("allowance log mapper (A040)", () => {
  describe.skipIf(!mapperLanded)(`toAllowanceLogEntry${mapperLanded ? "" : " — not landed yet"}`, () => {
    it("reads the pair of days and the year from the context", async () => {
      const toAllowanceLogEntry = await mapper();
      expect(toAllowanceLogEntry(row())).toEqual({
        id: 7,
        leave_type: "Annual leave",
        year: 2026,
        old_days: 20,
        new_days: 25,
        changed_by: "Ada Manager",
        changed_at: "2026-11-17T01:00:00Z",
        reason: "Long service",
      });
    });

    it("allowance_set: old and new come from before and after, in that direction", async () => {
      const toAllowanceLogEntry = await mapper();
      const e = toAllowanceLogEntry(row({ before: { days: 20 }, after: { days: 22.5 } }));
      expect([e.old_days, e.new_days]).toEqual([20, 22.5]);
    });

    it("allowance_removed: after.days is present and null, so new_days is null and not 0", async () => {
      const toAllowanceLogEntry = await mapper();
      const e = toAllowanceLogEntry(
        row({ action: "allowance_removed", before: { days: 25 }, after: { days: null } }),
      );
      expect(e.new_days).toBeNull();
      expect(e.old_days).toBe(25);
    });

    it("leave_type_default_changed: the pair is default_allowance, and a default has no year", async () => {
      const toAllowanceLogEntry = await mapper();
      const e = toAllowanceLogEntry(
        row({
          action: "leave_type_default_changed",
          before: { default_allowance: 20, is_capped: true },
          after: { default_allowance: 22, is_capped: true },
          context: { leave_type_id: "lt-1", leave_type_name: "Annual leave" },
          comment: null,
        }),
      );
      expect([e.old_days, e.new_days, e.year, e.reason]).toEqual([20, 22, null, null]);
    });

    it("uncapping a type reads as a default going to null", async () => {
      const toAllowanceLogEntry = await mapper();
      const e = toAllowanceLogEntry(
        row({
          action: "leave_type_default_changed",
          before: { default_allowance: 22, is_capped: true },
          after: { default_allowance: null, is_capped: false },
          context: { leave_type_id: "lt-1", leave_type_name: "Unpaid" },
        }),
      );
      expect(e.new_days).toBeNull();
    });

    it("a null comment becomes a null reason, which the table prints as No reason given", async () => {
      const toAllowanceLogEntry = await mapper();
      expect(toAllowanceLogEntry(row({ comment: null })).reason).toBeNull();
    });

    it("a null actor name is Unknown, the same word the three readers used before it moved", async () => {
      const toAllowanceLogEntry = await mapper();
      expect(toAllowanceLogEntry(row({ actor_name: null })).changed_by).toBe("Unknown");
    });

    it("System stays System: a backfilled or migration entry is labelled, not hidden", async () => {
      const toAllowanceLogEntry = await mapper();
      expect(toAllowanceLogEntry(row({ actor_name: "System" })).changed_by).toBe("System");
    });

    it("a missing context name is Unknown rather than a blank cell", async () => {
      const toAllowanceLogEntry = await mapper();
      const e = toAllowanceLogEntry(row({ context: { leave_type_id: "lt-1", year: 2026 } }));
      expect(e.leave_type).toBe("Unknown");
    });

    it("no context at all still yields a row: the year is null, not undefined", async () => {
      const toAllowanceLogEntry = await mapper();
      const e = toAllowanceLogEntry(row({ context: null }));
      expect(e.year).toBeNull();
      expect(e.leave_type).toBe("Unknown");
    });

    it("the id and the timestamp pass through, so the newest entry stays first once sorted", async () => {
      const toAllowanceLogEntry = await mapper();
      const e = toAllowanceLogEntry(row({ id: 412, created_at: "2026-06-01T23:30:00Z" }));
      expect([e.id, e.changed_at]).toEqual([412, "2026-06-01T23:30:00Z"]);
    });

    it("every action produces all eight keys, so the component never reads an undefined cell", async () => {
      const toAllowanceLogEntry = await mapper();
      for (const action of ["allowance_set", "allowance_removed", "leave_type_default_changed"] as const) {
        expect(Object.keys(toAllowanceLogEntry(row({ action }))).sort()).toEqual(
          [
            "changed_at",
            "changed_by",
            "id",
            "leave_type",
            "new_days",
            "old_days",
            "reason",
            "year",
          ].sort(),
        );
      }
    });
  });
});

describe("allowance log table", () => {
  it("prints a removal as the word Default in the New column", () => {
    const html = log([entry({ new_days: null })]);
    expect(html).toContain("Default");
    expect(html).toContain(">20<");
    expect(html).not.toContain(">null<");
  });

  it("keeps a half day as written", () => {
    expect(log([entry({ old_days: 22.5, new_days: 23 })])).toContain(">22.5<");
  });

  it("a null reason is a muted No reason given, not an empty cell", () => {
    expect(log([entry({ reason: null })])).toContain("No reason given");
  });

  it("shows the year beside the type, because an override is per year", () => {
    expect(log([entry({ year: 2027 })])).toContain("2027");
  });

  it("shows no year for a leave-type default, which belongs to every year", () => {
    const html = log([entry({ year: null, changed_at: "2031-03-01T01:00:00Z" })]);
    expect(html).not.toContain("2026");
    expect(html).toContain("Annual leave");
  });

  it("says so when there is nothing to show", () => {
    expect(log([])).toContain("No allowance changes yet");
  });
});
