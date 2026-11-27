// #181: the two halves of an import that can be proven without a database or a live source.
//
// `selectSourceRows` is where a wrong answer would be silent: an AU row belonging to another state,
// a `1970-01-04` placeholder, or a duplicated date each make the app write a holiday that is simply
// not observed in that region. So every rule the source forces on us is pinned here, against a
// payload built in the shapes Nager.Date returns (`global`, `counties`, `localName`).
//
// The database halves run against a recording stub, because what they have to prove is *which call
// is made with which options* — `ignoreDuplicates` on the region+date key is the whole idempotency
// guarantee, and Postgres accepts either spelling of the write. Refusal and a real second import are
// tests/integration/holiday-import.test.ts, against RLS.
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyImport,
  diffHolidays,
  fetchHolidaySource,
  HOLIDAY_SOURCE,
  IMPORTABLE_REGIONS,
  IMPORT_YEARS,
  insertHolidays,
  previewImport,
  selectSourceRows,
} from "../../src/server/holiday-import";
import type { Database } from "../../src/lib/database.types";

type Db = SupabaseClient<Database>;
type Row = Record<string, unknown>;

/** A payload in Nager.Date's shape: national days, other states' days, and one date twice. */
const AU_2026: Row[] = [
  { date: "2026-01-01", name: "New Year's Day", global: true, counties: null },
  { date: "2026-04-03", name: "Good Friday", global: true, counties: null },
  { date: "2026-04-05", name: "Easter Sunday", global: false, counties: ["AU-NSW", "AU-QLD"] },
  { date: "2026-04-25", name: "Anzac Day", global: false, counties: ["AU-NT", "AU-QLD"] },
  { date: "2026-04-27", name: "Anzac Day", global: false, counties: ["AU-NSW", "AU-ACT"] },
  { date: "2026-05-04", name: "Labour Day", global: false, counties: ["AU-QLD"] },
  { date: "2026-06-08", name: "King's Birthday", global: false, counties: ["AU-NSW", "AU-VIC"] },
  { date: "2026-10-05", name: "King's Birthday", global: false, counties: ["AU-QLD"] },
  { date: "2026-12-25", name: "Christmas Day", global: true, counties: null },
  // The national label and the state's own for one date: the state's has to win.
  { date: "2026-12-28", name: "Boxing Day", global: true, counties: null },
  { date: "2026-12-28", name: "Bank Holiday", global: false, counties: ["AU-QLD"] },
  // Noise the source really emits: another year, and a day no state observes.
  { date: "1970-01-04", name: "Placeholder", global: true, counties: null },
  { date: "2027-01-01", name: "Next year", global: true, counties: null },
  { date: "2026-03-02", name: "Labour Day", global: false, counties: [] },
];

/** The eight AU-QLD rows in the payload above, spelled out because three tests need them. */
const QLD_2026 = ["2026-01-01", "2026-04-03", "2026-04-05", "2026-04-25", "2026-05-04", "2026-10-05", "2026-12-25", "2026-12-28"];

const HK_2026: Row[] = [
  { date: "2026-01-01", localName: "元旦新年", name: "New Year's Day", global: true, counties: null },
  { date: "2026-05-01", localName: "勞動節", name: "Labour Day", global: true, counties: null },
];

const datesFor = (rows: Row[], region: string) => selectSourceRows(rows, region, 2026)!.map((r) => r.date);

describe("selectSourceRows", () => {
  it("takes QLD's own days plus the national ones, and none of another state's", () => {
    expect(datesFor(AU_2026, "QLD")).toEqual(QLD_2026);
  });

  it("separates NSW from QLD on the same payload", () => {
    expect(datesFor(AU_2026, "NSW")).toEqual([
      "2026-01-01",
      "2026-04-03",
      "2026-04-05",
      "2026-04-27",
      "2026-06-08",
      "2026-12-25",
      "2026-12-28",
    ]);
  });

  it("names a duplicated date the way the state does", () => {
    expect(selectSourceRows(AU_2026, "QLD", 2026)!.find((r) => r.date === "2026-12-28")!.name).toBe("Bank Holiday");
    expect(selectSourceRows(AU_2026, "NSW", 2026)!.find((r) => r.date === "2026-12-28")!.name).toBe("Boxing Day");
  });

  it("keeps every in-year row for a region that is a whole country", () => {
    expect(datesFor(HK_2026, "HK")).toEqual(["2026-01-01", "2026-05-01"]);
  });

  it("returns them sorted, and drops other years and a row no state observes", () => {
    const shuffled = [...AU_2026].reverse();
    const qld = selectSourceRows(shuffled, "QLD", 2026)!;
    expect(qld.map((r) => r.date)).toEqual([...QLD_2026].sort());
    expect(qld.some((r) => r.date === "2026-03-02" || r.date.startsWith("1970"))).toBe(false);
  });

  it("falls back to the local name, collapses whitespace and fits the 80-character column", () => {
    const rows = selectSourceRows(
      [
        { date: "2026-02-01", name: "  The   day  following  Chung  Yeung  Festival  ", global: true },
        { date: "2026-02-02", localName: "Only a local name", global: true },
        { date: "2026-02-03", name: `X${"y".repeat(200)}`, global: true },
      ],
      "HK",
      2026,
    )!;
    expect(rows.find((r) => r.date === "2026-02-01")!.name).toBe("The day following Chung Yeung Festival");
    expect(rows.find((r) => r.date === "2026-02-02")!.name).toBe("Only a local name");
    expect(rows.find((r) => r.date === "2026-02-03")!.name).toHaveLength(80);
  });

  it("skips a row with no usable name, no date, or a date that is not one", () => {
    expect(
      selectSourceRows(
        [
          { date: "2026-06-01", name: "   ", localName: "", global: true },
          { date: "2026-13-45", name: "Month 13", global: true },
          { date: "2026-02-30", name: "February has no 30th", global: true },
          { date: "not a date", name: "Nothing", global: true },
          { name: "No date at all", global: true },
          null,
          "a string",
        ],
        "HK",
        2026,
      ),
    ).toEqual([]);
  });

  it("answers an unmapped region with nothing, and a body that isn't a list with null", () => {
    expect(selectSourceRows(AU_2026, "VIC", 2026)).toEqual([]);
    expect(selectSourceRows({ error: "nope" }, "QLD", 2026)).toBeNull();
    expect(selectSourceRows("nope", "QLD", 2026)).toBeNull();
  });

  it("maps only the three regions #181 claims to verify, to a country the source serves", () => {
    expect(Object.keys(IMPORTABLE_REGIONS).sort()).toEqual(["HK", "NSW", "QLD"]);
    expect(IMPORTABLE_REGIONS.QLD).toEqual({ countryCode: "AU", subdivision: "QLD" });
    expect(IMPORTABLE_REGIONS.HK).toEqual({ countryCode: "HK" });
  });
});

describe("fetchHolidaySource", () => {
  const answering = (body: unknown, ok = true) =>
    vi.fn(async () => ({ ok, status: ok ? 200 : 503, json: async () => body })) as unknown as ReturnType<typeof vi.fn>;

  it("refuses a region with no source rather than guessing a country", async () => {
    const fetchImpl = answering(AU_2026);
    await expect(fetchHolidaySource("VIC", 2026, fetchImpl as unknown as typeof fetch)).resolves.toEqual({
      ok: false,
      error: "region_unsupported",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a year the page can ask for but the source doesn't serve", async () => {
    // The page's own bound is 2000-2100, and the source's ceiling sits inside it: a year the admin
    // can navigate to is not a year the source has data for, and that has to be an answer, not a
    // silent "0 holidays".
    expect(IMPORT_YEARS.max).toBeLessThan(2100);
    const res = await fetchHolidaySource("QLD", IMPORT_YEARS.max + 1, answering(AU_2026) as unknown as typeof fetch);
    expect(res).toEqual({ ok: false, error: "year_unsupported" });
  });

  it("turns a dead source and a non-200 into one failure, and never throws", async () => {
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(fetchHolidaySource("QLD", 2026, down)).resolves.toEqual({ ok: false, error: "source_unavailable" });
    await expect(fetchHolidaySource("QLD", 2026, answering(null, false) as unknown as typeof fetch)).resolves.toEqual({
      ok: false,
      error: "source_unavailable",
    });
  });

  it("calls an empty or unreadable answer a failure, not a successful import of nothing", async () => {
    await expect(fetchHolidaySource("QLD", 2026, answering([]) as unknown as typeof fetch)).resolves.toEqual({
      ok: false,
      error: "source_unexpected",
    });
    const broken = vi.fn(async () => ({ ok: true, json: async () => undefined })) as unknown as typeof fetch;
    await expect(fetchHolidaySource("QLD", 2026, broken)).resolves.toEqual({ ok: false, error: "source_unexpected" });
  });

  it("asks the source for the country, not the state, and never caches the answer", async () => {
    const fetchImpl = answering(AU_2026);
    await fetchHolidaySource("QLD", 2026, fetchImpl as unknown as typeof fetch);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${HOLIDAY_SOURCE.endpoint}/2026/AU`);
    expect(init).toMatchObject({ cache: "no-store" });
  });
});

/**
 * A client that records every call and answers reads and writes with fixed rows.
 *
 * The operation travels with the builder rather than with the stub, because `insertHolidays` ends
 * its upsert with `.select("id")` — the call that decides how many rows landed. A single shared
 * flag made that trailing select answer the write with the *read* rows, which turned a refused
 * import into a quiet "added 0".
 */
function stubDb(read: { data?: unknown; error?: unknown } = {}, write: { data?: unknown; error?: unknown } = {}) {
  const calls: { method: string; args: unknown[] }[] = [];
  const chain = (op: "read" | "upsert"): Record<string, unknown> => {
    const answer = op === "upsert" ? write : read;
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "gte", "lte", "order"]) {
      builder[method] = (...args: unknown[]) => {
        calls.push({ method, args });
        return builder;
      };
    }
    builder.upsert = (...args: unknown[]) => {
      calls.push({ method: "upsert", args });
      return chain("upsert");
    };
    builder.then = (resolve: (v: unknown) => void) => resolve({ data: answer.data ?? null, error: answer.error ?? null });
    return builder;
  };
  const db = {
    from: (table: string) => {
      calls.push({ method: `from:${table}`, args: [] });
      return chain("read");
    },
  } as unknown as Db;
  return { db, calls };
}

const rlsRefused = { code: "42501", message: "new row violates row-level security policy" };

describe("diffHolidays", () => {
  it("splits the source into new dates, agreed dates, and stored rows the source doesn't list", async () => {
    const { db } = stubDb({ data: [{ holiday_date: "2026-01-01" }, { holiday_date: "2026-08-12" }] });
    const rows = [
      { date: "2026-01-01", name: "New Year's Day" },
      { date: "2026-05-04", name: "Labour Day" },
    ];
    await expect(diffHolidays(db, "QLD", 2026, rows)).resolves.toEqual({
      ok: true,
      data: { adding: [{ date: "2026-05-04", name: "Labour Day" }], kept: [rows[0]], extra: 1 },
    });
  });

  it("reads only the region and year the admin is looking at", async () => {
    const { db, calls } = stubDb({ data: [] });
    await diffHolidays(db, "NSW", 2027, []);
    expect(calls.map((c) => [c.method, c.args])).toEqual([
      ["from:public_holidays", []],
      ["select", ["holiday_date"]],
      ["eq", ["region_code", "NSW"]],
      ["gte", ["holiday_date", "2027-01-01"]],
      ["lte", ["holiday_date", "2027-12-31"]],
    ]);
  });

  it("reports a read failure as its own code, so a message can't claim rows were added", async () => {
    const { db } = stubDb({ error: { code: "42P01", message: "relation does not exist" } });
    await expect(diffHolidays(db, "QLD", 2026, [])).resolves.toEqual({ ok: false, error: "read_failed" });
  });
});

describe("insertHolidays", () => {
  it("issues no write when there is nothing new, and says so", async () => {
    const { db, calls } = stubDb({}, { data: [{ id: "x" }] });
    await expect(insertHolidays(db, "QLD", [])).resolves.toEqual({ ok: true, data: { added: 0, unchanged: 0 } });
    expect(calls.some((c) => c.method === "upsert")).toBe(false);
  });

  it("relies on the unique key and DO NOTHING, which is what makes a second import a no-op", async () => {
    const { db, calls } = stubDb({}, { data: [{ id: "a" }, { id: "b" }] });
    await expect(
      insertHolidays(db, "QLD", [
        { date: "2026-05-04", name: "Labour Day" },
        { date: "2026-08-12", name: "Royal Queensland Show" },
      ]),
    ).resolves.toEqual({ ok: true, data: { added: 2, unchanged: 0 } });
    const [values, options] = calls.find((c) => c.method === "upsert")!.args as [
      unknown[],
      { onConflict: string; ignoreDuplicates: boolean },
    ];
    expect(values).toEqual([
      { region_code: "QLD", holiday_date: "2026-05-04", name: "Labour Day" },
      { region_code: "QLD", holiday_date: "2026-08-12", name: "Royal Queensland Show" },
    ]);
    expect(options).toEqual({ onConflict: "region_code,holiday_date", ignoreDuplicates: true });
  });

  it("counts only the rows that came back, so a date the table already had is unchanged", async () => {
    const { db } = stubDb({}, { data: [{ id: "a" }] });
    await expect(
      insertHolidays(db, "QLD", [
        { date: "2026-05-04", name: "Labour Day" },
        { date: "2026-08-12", name: "Ekka" },
      ]),
    ).resolves.toEqual({ ok: true, data: { added: 1, unchanged: 1 } });
  });

  it("maps an RLS refusal to not_allowed and any other failure to write_failed", async () => {
    const { db: refused } = stubDb({}, { error: rlsRefused });
    await expect(insertHolidays(refused, "QLD", [{ date: "2026-05-04", name: "Labour Day" }])).resolves.toEqual({
      ok: false,
      error: "not_allowed",
    });
    const { db: other } = stubDb({}, { error: { code: "23503", message: "violates foreign key" } });
    await expect(insertHolidays(other, "QLD", [{ date: "2026-05-04", name: "Labour Day" }])).resolves.toEqual({
      ok: false,
      error: "write_failed",
    });
  });
});

describe("previewImport and applyImport", () => {
  const source = (rows: Row[]) => vi.fn(async () => ({ ok: true, json: async () => rows })) as unknown as typeof fetch;

  it("shows the whole list, cites the source, and issues no write", async () => {
    const { db, calls } = stubDb({ data: [{ holiday_date: "2026-01-01" }, { holiday_date: "2026-08-12" }] });
    const res = await previewImport(db, "QLD", 2026, source(AU_2026));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.source).toBe(HOLIDAY_SOURCE);
    expect(res.data.adding.map((r) => r.date)).toEqual(QLD_2026.filter((d) => d !== "2026-01-01"));
    expect(res.data.kept.map((r) => r.date)).toEqual(["2026-01-01"]);
    expect(res.data.extra).toBe(1);
    expect(calls.some((c) => c.method === "upsert")).toBe(false);
  });

  it("adds only what the diff found new, and a fully stored year asks for no write at all", async () => {
    const fetchImpl = source(AU_2026);
    const first = stubDb({ data: [{ holiday_date: "2026-01-01" }] }, { data: new Array(7).fill({ id: "x" }) });
    await expect(applyImport(first.db, "QLD", 2026, fetchImpl)).resolves.toEqual({ ok: true, data: { added: 7, unchanged: 0 } });
    expect(first.calls.find((c) => c.method === "upsert")!.args[0]).toHaveLength(7);

    const storedAll = QLD_2026.concat("2026-08-12").map((holiday_date) => ({ holiday_date }));
    const second = stubDb({ data: storedAll }, { data: [] });
    await expect(applyImport(second.db, "QLD", 2026, fetchImpl)).resolves.toEqual({ ok: true, data: { added: 0, unchanged: 0 } });
    expect(second.calls.some((c) => c.method === "upsert")).toBe(false);
  });

  it("carries a source failure straight out without touching the database", async () => {
    const { db, calls } = stubDb({ data: [{ holiday_date: "2026-01-01" }] });
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(applyImport(db, "QLD", 2026, down)).resolves.toEqual({ ok: false, error: "source_unavailable" });
    expect(calls).toHaveLength(0);
  });

  it("refuses an unmapped region before the first database call", async () => {
    const { db, calls } = stubDb({ data: [] });
    await expect(applyImport(db, "VIC", 2026, source(AU_2026))).resolves.toEqual({ ok: false, error: "region_unsupported" });
    expect(calls).toHaveLength(0);
  });
});
