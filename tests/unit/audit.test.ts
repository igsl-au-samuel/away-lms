// A053: the four formatting helpers A056 puts in src/server/audit.ts, pinned before any of
// them exists.
//
// Why a test writes the wording rather than the code: the sentence, the before/after pair and
// the labels are three separate cells of one row (FR-023 lists them apart), and the only place
// that split is visible before the screen exists is here. So each helper gets its own contract
// and none of them re-renders what another already said — a number appears once per row, in the
// change column, never in the sentence beside it.
//
// Landed, not guarded: the skipIf and the @ts-expect-error that came with it are gone now that
// src/server/audit.ts exists (decision 7 of specs/002-transaction-audit/tasks.md). Skipping was
// the only way to pin wording before code without putting a red check on main, and the compiler
// enforced taking it back out - an unused @ts-expect-error is itself an error (TS2578). Both
// halves of the run this file owes are in A056's PR body: 36 failures with every helper returning
// an empty string or list, then the same 36 against the module as it now reads.
//
// The fixture type mirrors audit_log's generated Row in src/lib/database.types.ts:17 keys,
// actor_name and is_demo/not_backfilled not nullable, the jsonb three as objects because
// PostgREST hands back parsed json rather than the text `->>` would give. A056's `AuditEntry`
// has to accept one of these, which is what stops the contract drifting from the table.
import { describe, expect, it } from "vitest";

type AuditEntry = {
  id: number;
  created_at: string;
  actor_id: string | null;
  actor_role: "employee" | "manager" | "admin" | null;
  actor_name: string;
  action: string;
  entity: string;
  entity_id: string | null;
  subject_id: string | null;
  subject_name: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  context: Record<string, unknown> | null;
  comment: string | null;
  is_demo: boolean;
  is_backfilled: boolean;
  source_key: string | null;
};


async function helpers(): Promise<{
  describeEntry: (entry: AuditEntry) => string;
  describeChange: (entry: AuditEntry) => string;
  describeWhen: (entry: AuditEntry, timeZone: string) => string;
  describeLabels: (entry: AuditEntry) => string[];
}> {
  const mod = await import("../../src/server/audit");
  return mod;
}

// --- fixtures -------------------------------------------------------------------------------
// Names are the snapshots the row carries, not lookups: FR-008. A person called "System" is a
// fixture on purpose (see the labels block) — it is the one input that separates an actor label
// derived from the data from one derived from a name.
const ACTOR = { actor_id: "11111111-1111-1111-1111-111111111111", actor_name: "Sam Manager", actor_role: "manager" } as const;
const SUBJECT = { subject_id: "22222222-2222-2222-2222-222222222222", subject_name: "Alex Employee" } as const;

// context as the leave_requests trigger writes it (20261116062030_audit_triggers.sql:134-141).
const REQUEST_CONTEXT = {
  leave_type_id: "33333333-3333-3333-3333-333333333333",
  leave_type_name: "Annual leave",
  year: 2026,
  start_date: "2026-03-03",
  end_date: "2026-03-07",
  working_days: 3,
};

// allowance context, as the allowance_overrides trigger writes it (:216-221 and :231-236).
const ALLOWANCE_CONTEXT = {
  leave_type_id: "33333333-3333-3333-3333-333333333333",
  leave_type_name: "Annual leave",
  year: 2026,
  default_days: 20,
};

const LEAVE_TYPE_CONTEXT = {
  leave_type_id: "33333333-3333-3333-3333-333333333333",
  leave_type_name: "Annual leave",
};

function entry(over: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: 1,
    created_at: "2026-11-17T15:30:00Z",
    ...ACTOR,
    action: "request_approved",
    entity: "leave_request",
    entity_id: "44444444-4444-4444-4444-444444444444",
    ...SUBJECT,
    before: { status: "pending" },
    after: { status: "approved" },
    context: REQUEST_CONTEXT,
    comment: null,
    is_demo: false,
    is_backfilled: false,
    source_key: null,
    ...over,
  };
}

// One entry per action in audit_log_action_known, in that file's order, each carrying what its
// trigger actually writes.
const SUBMITTED = entry({
  action: "request_submitted",
  actor_id: SUBJECT.subject_id,
  actor_name: SUBJECT.subject_name,
  actor_role: "employee",
  before: null,
  after: { status: "pending" },
});
const APPROVED = entry({ comment: "Approved, enjoy" });
const DECLINED = entry({
  action: "request_declined",
  before: { status: "pending" },
  after: { status: "declined" },
});
// The #175 arms. `withdrawn` is the requester acting alone, so its actor is the subject; an ask
// to cancel is the same, and only its answer comes from somebody else.
const WITHDRAWN = entry({
  action: "request_withdrawn",
  actor_id: SUBJECT.subject_id,
  actor_name: SUBJECT.subject_name,
  actor_role: "employee",
  after: { status: "withdrawn" },
});
const CANCELLATION_REQUESTED = entry({
  action: "cancellation_requested",
  actor_id: SUBJECT.subject_id,
  actor_name: SUBJECT.subject_name,
  actor_role: "employee",
  before: { status: "approved" },
  after: { status: "approved", cancellation: "requested" },
  comment: "Family emergency",
});
const CANCELLATION_APPROVED = entry({
  action: "cancellation_approved",
  before: { status: "approved", cancellation: "requested" },
  after: { status: "cancelled", cancellation: "approved" },
});
const CANCELLATION_DECLINED = entry({
  action: "cancellation_declined",
  before: { status: "approved", cancellation: "requested" },
  after: { status: "approved", cancellation: "declined" },
  comment: "Keep it booked",
});
const ALLOWANCE_SET = entry({
  action: "allowance_set",
  entity: "allowance",
  before: { days: 20 },
  after: { days: 25 },
  context: ALLOWANCE_CONTEXT,
});
const ALLOWANCE_REMOVED = entry({
  action: "allowance_removed",
  entity: "allowance",
  before: { days: 25 },
  after: { days: null },
  context: ALLOWANCE_CONTEXT,
});
// Key order here is deliberately not the order the sentences below expect: jsonb sorts keys by
// length, so the wire order is a storage detail and must not decide what a reader sees second.
const USER_CREATED = entry({
  action: "user_created",
  entity: "user",
  before: null,
  after: { is_active: true, region_code: "QLD", role: "employee" },
  context: null,
});
const ROLE_CHANGED = entry({
  action: "user_role_changed",
  entity: "user",
  before: { role: "employee" },
  after: { role: "manager" },
  context: null,
});
const REGION_CHANGED = entry({
  action: "user_region_changed",
  entity: "user",
  before: { region_code: "QLD" },
  after: { region_code: "NSW" },
  context: null,
});
const ACTIVE_CHANGED = entry({
  action: "user_active_changed",
  entity: "user",
  before: { is_active: false },
  after: { is_active: true },
  context: null,
});
const DEFAULT_CHANGED = entry({
  action: "leave_type_default_changed",
  entity: "leave_type",
  subject_id: null,
  subject_name: null,
  before: { default_allowance: 20, is_capped: true },
  after: { default_allowance: 25, is_capped: true },
  context: LEAVE_TYPE_CONTEXT,
});
const TYPE_CHANGED = entry({
  action: "leave_type_changed",
  entity: "leave_type",
  subject_id: null,
  subject_name: null,
  before: { name: "Annual", sort_order: 1 },
  after: { name: "Annual leave", sort_order: 2 },
  context: LEAVE_TYPE_CONTEXT,
});

describe("audit entry formatting (A053)", () => {
  describe("describeEntry — one plain-language sentence per action (FR-023)", () => {
    // The example in the task text is "Sam approved Alex's request for 3 Mar–5 Mar"; the shape
    // below is that sentence with the names the row actually snapshots and the dates the trigger
    // actually puts in context.
    it.each([
      ["request_submitted", SUBMITTED, "Alex Employee submitted a request for Annual leave, Tue 3 Mar 2026 – Sat 7 Mar 2026."],
      ["request_approved", APPROVED, 'Sam Manager approved Alex Employee\'s request for Annual leave, Tue 3 Mar 2026 – Sat 7 Mar 2026 — "Approved, enjoy".'],
      ["request_declined", DECLINED, "Sam Manager declined Alex Employee's request for Annual leave, Tue 3 Mar 2026 – Sat 7 Mar 2026."],
      ["request_withdrawn", WITHDRAWN, "Alex Employee withdrew their own request for Annual leave, Tue 3 Mar 2026 – Sat 7 Mar 2026."],
      ["cancellation_requested", CANCELLATION_REQUESTED, 'Alex Employee asked to cancel their own request for Annual leave, Tue 3 Mar 2026 – Sat 7 Mar 2026 — "Family emergency".'],
      ["cancellation_approved", CANCELLATION_APPROVED, "Sam Manager approved the cancellation of Alex Employee's request for Annual leave, Tue 3 Mar 2026 – Sat 7 Mar 2026."],
      ["cancellation_declined", CANCELLATION_DECLINED, 'Sam Manager declined the cancellation of Alex Employee\'s request for Annual leave, Tue 3 Mar 2026 – Sat 7 Mar 2026 — "Keep it booked".'],
      ["allowance_set", ALLOWANCE_SET, "Sam Manager set Alex Employee's Annual leave allowance for 2026."],
      ["allowance_removed", ALLOWANCE_REMOVED, "Sam Manager removed Alex Employee's Annual leave allowance for 2026."],
      ["user_created", USER_CREATED, "Sam Manager created Alex Employee's account."],
      ["user_role_changed", ROLE_CHANGED, "Sam Manager changed Alex Employee's role."],
      ["user_region_changed", REGION_CHANGED, "Sam Manager changed Alex Employee's region."],
      ["user_active_changed", ACTIVE_CHANGED, "Sam Manager changed Alex Employee's active status."],
      ["leave_type_default_changed", DEFAULT_CHANGED, "Sam Manager changed the Annual leave default."],
      ["leave_type_changed", TYPE_CHANGED, "Sam Manager changed the Annual leave settings."],
    ] as const)(`%s`, async (_action, fixture, expected) => {
      const { describeEntry } = await helpers();
      expect(describeEntry(fixture)).toBe(expected);
    });

    it("covers all fifteen actions the table allows, so a new one cannot slip past unworded", async () => {
      const { describeEntry } = await helpers();
      const actions = [
        "request_submitted", "request_approved", "request_declined", "request_withdrawn",
        "cancellation_requested", "cancellation_approved", "cancellation_declined",
        "allowance_set", "allowance_removed",
        "user_created", "user_role_changed", "user_region_changed", "user_active_changed",
        "leave_type_default_changed", "leave_type_changed",
      ];
      const sentences = actions.map((action) => describeEntry(entry({ action })));
      expect(sentences).toHaveLength(15);
      // An unworded action would fall through to something generic; every one of these has to
      // name an actor, and no two may read alike.
      expect(new Set(sentences).size).toBe(15);
      for (const sentence of sentences) expect(sentence.startsWith("Sam Manager ")).toBe(true);
    });

    it("names the requester as the actor for a submission, because it was them", async () => {
      const { describeEntry } = await helpers();
      expect(describeEntry(SUBMITTED).startsWith("Alex Employee ")).toBe(true);
    });

    it("says a person's own name only once: an actor changing themselves reads as their own", async () => {
      const { describeEntry } = await helpers();
      const self = entry({ ...ROLE_CHANGED, actor_id: SUBJECT.subject_id, actor_name: SUBJECT.subject_name });
      expect(describeEntry(self)).toBe("Alex Employee changed their own role.");
    });

    it("renders one date, not a range, when the request is a single day", async () => {
      const { describeEntry } = await helpers();
      const oneDay = entry({
        context: { ...REQUEST_CONTEXT, start_date: "2026-03-03", end_date: "2026-03-03" },
      });
      const sentence = describeEntry(oneDay);
      expect(sentence).toContain("Tue 3 Mar 2026.");
      expect(sentence).not.toContain("–");
    });

    it("leaves no dangling type phrase when the leave type is gone and context has no name (FR-013)", async () => {
      const { describeEntry } = await helpers();
      const orphan = entry({ context: { ...REQUEST_CONTEXT, leave_type_name: null } });
      expect(describeEntry(orphan)).toBe(
        "Sam Manager approved Alex Employee's request, Tue 3 Mar 2026 – Sat 7 Mar 2026.",
      );
    });

    it("records an actor with no signed-in person as System, from the name the database wrote", async () => {
      const { describeEntry } = await helpers();
      const bySystem = entry({ actor_id: null, actor_name: "System", actor_role: null });
      expect(describeEntry(bySystem)).toContain("System approved Alex Employee's request");
    });

    it("names the requester when no signed-in person wrote the submission, and the actor when one did", async () => {
      const { describeEntry } = await helpers();
      // The row `audit_requests` writes for a service-role, MCP or backfilled insert: the employee is
      // the subject, and the actor is the System that private.audit_actor() falls back to when
      // auth.uid() is null (20261116062030_audit_triggers.sql:24-28). A054 asserts this sentence
      // carries the requester's name, so the fallback is a wording rule, not a display choice.
      const bySystem = entry({
        action: "request_submitted",
        actor_id: null,
        actor_name: "System",
        actor_role: null,
        before: null,
        after: { status: "pending" },
      });
      expect(describeEntry(bySystem)).toBe(
        "Alex Employee submitted a request for Annual leave, Tue 3 Mar 2026 – Sat 7 Mar 2026.",
      );

      // The other half: a person who did sign in leads, on the same action. Without this the rule
      // above could be read as always naming the subject.
      expect(describeEntry(entry({ action: "request_submitted" }))).toMatch(/^Sam Manager submitted a request/);
    });

    it("keeps a comment as plain text, including markup-looking text", async () => {
      const { describeEntry } = await helpers();
      const nasty = entry({ comment: '<script>alert("xss")</script>' });
      const sentence = describeEntry(nasty);
      // Returned, not escaped and not stripped: React escapes on render, so pre-escaping here
      // would put &lt;script&gt; on the screen.
      expect(sentence).toContain('<script>alert("xss")</script>');
      expect(sentence).not.toContain("&lt;");
      expect(typeof sentence).toBe("string");
    });

    it.each([
      ["no comment", null],
      ["a blank comment", ""],
    ])("%s adds nothing to the sentence", async (_label, comment) => {
      const { describeEntry } = await helpers();
      const sentence = describeEntry(entry({ comment }));
      expect(sentence).toBe(
        "Sam Manager approved Alex Employee's request for Annual leave, Tue 3 Mar 2026 – Sat 7 Mar 2026.",
      );
      expect(sentence).not.toContain("—");
    });
  });

  describe("describeChange — the before/after summary (FR-007, FR-025)", () => {
    it("reads `field: old → new` with the field in words, not as a column name", async () => {
      const { describeChange } = await helpers();
      expect(describeChange(APPROVED)).toBe("status: pending → approved");
      expect(describeChange(ROLE_CHANGED)).toBe("role: employee → manager");
      expect(describeChange(REGION_CHANGED)).toBe("region: QLD → NSW");
      expect(describeChange(ALLOWANCE_SET)).toBe("days: 20 → 25");
    });

    it("writes booleans as yes and no", async () => {
      const { describeChange } = await helpers();
      expect(describeChange(ACTIVE_CHANGED)).toBe("active: no → yes");
    });

    it("drops the arrow when there is no before value, because nothing was replaced", async () => {
      const { describeChange } = await helpers();
      expect(describeChange(SUBMITTED)).toBe("status: pending");
    });

    it("says what a removal leaves behind: none, and the default now applies (scenario 3)", async () => {
      const { describeChange } = await helpers();
      expect(describeChange(ALLOWANCE_REMOVED)).toBe("days: 25 → none (the default now applies)");
    });

    it("orders the fields by meaning, not by the jsonb key order on the wire", async () => {
      const { describeChange } = await helpers();
      expect(describeChange(USER_CREATED)).toBe("role: employee; region: QLD; active: yes");
    });

    it("omits a field that did not move, even though the trigger wrote the pair", async () => {
      const { describeChange } = await helpers();
      // The leave_types trigger always writes both default_allowance and is_capped, because the
      // table constraint ties them together (20261116062030_audit_triggers.sql:320-330). A reader
      // does not need to be told a type stayed capped.
      expect(describeChange(DEFAULT_CHANGED)).toBe("default allowance: 20 → 25");
    });

    it("calls an uncapping default none, and shows the cap going with it", async () => {
      const { describeChange } = await helpers();
      const uncapped = entry({
        ...DEFAULT_CHANGED,
        before: { default_allowance: 25, is_capped: true },
        after: { default_allowance: null, is_capped: false },
      });
      expect(describeChange(uncapped)).toBe("default allowance: 25 → none; capped: yes → no");
    });

    it("joins several changed fields with a semicolon, since one save can write one entry with three", async () => {
      const { describeChange } = await helpers();
      expect(describeChange(TYPE_CHANGED)).toBe("name: Annual → Annual leave; order: 1 → 2");
    });
  });

  describe("describeWhen — the instant in the viewer's zone (FR-025)", () => {
    // 2026-11-17T15:30:00Z is 01:30 on the 18th in Brisbane and 23:30 on the 17th in Perth, so
    // the two zones disagree about the date as well as the clock. Containment rather than
    // equality: the punctuation and the am/pm belong to Intl and the en-AU locale, and A053 is
    // not a test of ICU's version.
    const AT = entry({ created_at: "2026-11-17T15:30:00Z" });

    it("moves the calendar day with the zone rather than the server's clock", async () => {
      const { describeWhen } = await helpers();
      expect(describeWhen(AT, "Australia/Brisbane")).toContain("18 Nov 2026");
      expect(describeWhen(AT, "Australia/Perth")).toContain("17 Nov 2026");
    });

    it("shows the time, not only the date", async () => {
      const { describeWhen } = await helpers();
      expect(describeWhen(AT, "Australia/Brisbane")).toMatch(/01:30/);
    });

    it("handles a half-hour offset zone", async () => {
      const { describeWhen } = await helpers();
      expect(describeWhen(AT, "Australia/Darwin")).toContain("18 Nov 2026");
      expect(describeWhen(AT, "Australia/Darwin")).toMatch(/01:00/);
    });

    it("gives two zones of the same instant different text, which is the whole point", async () => {
      const { describeWhen } = await helpers();
      expect(describeWhen(AT, "Australia/Brisbane")).not.toBe(describeWhen(AT, "Australia/Perth"));
    });
  });

  describe("describeLabels — Demo and System as words, never colour alone (FR-028, FR-019)", () => {
    it("has nothing to add to an ordinary entry", async () => {
      const { describeLabels } = await helpers();
      expect(describeLabels(APPROVED)).toEqual([]);
    });

    it("labels a demo entry, and a backfilled one, and both at once", async () => {
      const { describeLabels } = await helpers();
      expect(describeLabels(entry({ is_demo: true }))).toEqual(["Demo"]);
      expect(describeLabels(entry({ is_backfilled: true }))).toEqual(["Backfilled"]);
      expect(describeLabels(entry({ is_demo: true, is_backfilled: true, actor_id: null }))).toEqual([
        "System", "Demo", "Backfilled",
      ]);
    });

    it("labels System from the absence of an actor, not from a matching name", async () => {
      const { describeLabels } = await helpers();
      // A profile could be called "System" by whoever creates it. The label means "no signed-in
      // person made this change" (FR-009), so it follows actor_id and not the text.
      const named = entry({ actor_name: "System" });
      expect(describeLabels(named)).toEqual([]);
      const noActor = entry({ actor_id: null, actor_name: "System" });
      expect(describeLabels(noActor)).toEqual(["System"]);
    });

    it("keeps every label a plain string, so the list can render them as text", async () => {
      const { describeLabels } = await helpers();
      const labels = describeLabels(entry({ is_demo: true, is_backfilled: true, actor_id: null }));
      for (const label of labels) expect(typeof label).toBe("string");
    });
  });
});

// ---- A066: the URL query as the two audit functions want it ----------------------------------
//
// `audit_search` takes seven filters and a cursor, and every one of them arrives from an address
// bar a person can edit. So this is not "does zod work" — a filter this file cannot read can only
// be honoured by showing MORE than was asked for, because the function's own default for a null
// filter is "match anything". The tests below are arranged around that: what a bad value costs,
// what an empty one costs, and which ones are named back to the caller instead of dropped.
//
// The dates are the other half. A day range in the URL is two calendar days; in the database it is
// two instants, and which instants depends on where the viewer is standing. Brisbane and Sydney
// are both Australian eastern zones, they agree about the date and disagree about the instant for
// six months of the year — which makes them the pair that proves the zone is actually consulted
// rather than defaulted to UTC.
type AuditModule = typeof import("../../src/server/audit");

const BRISBANE = "Australia/Brisbane"; // +10 all year
const SYDNEY = "Australia/Sydney"; // +10, +11 from the first Sunday in October

// Valid v4 ids, not repeated digits: `z.uuid()` checks the variant nibble, so the all-ones shape
// people reach for as a fixture is refused and the filter silently never parses.
const PERSON = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

/** A client that only records. `Parameters<…>[0]` is the module's own `Db`, so the stub is the type
 * the real function demands rather than a cast past it. */
function stubClient(res: { data?: unknown; error?: unknown }): {
  c: Parameters<AuditModule["fetchAudit"]>[0];
  calls: { fn: string; args: Record<string, unknown> }[];
} {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  return {
    calls,
    c: {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        return { data: res.data ?? null, error: res.error ?? null };
      },
    } as unknown as Parameters<AuditModule["fetchAudit"]>[0],
  };
}

const NOT_ALLOWED = { message: "not_allowed", code: "P0001", details: "", hint: "" };

describe("audit filters (A066)", () => {
  describe("parseFilters — what each param means, and what a bad one costs", () => {
    it("reads nothing when the URL says nothing, and demo stays off", async () => {
      const { parseFilters } = await import("../../src/server/audit");
      const q = parseFilters({}, SYDNEY);
      expect(q.filters).toEqual({
        person: null,
        action: null,
        entity: null,
        role: null,
        demo: false,
        from: null,
        to: null,
      });
      expect(q.cursor).toEqual({});
      expect(q.rejected).toEqual([]);
    });

    it("reads all seven when the URL is a whole view", async () => {
      const { parseFilters } = await import("../../src/server/audit");
      const q = parseFilters(
        {
          person: PERSON,
          action: "request_approved",
          entity: "leave_request",
          role: "manager",
          demo: "true",
          from: "2026-11-02",
          to: "2026-11-09",
        },
        BRISBANE,
      );
      expect(q.rejected).toEqual([]);
      expect(q.filters.person).toBe(PERSON);
      expect(q.filters.action).toBe("request_approved");
      expect(q.filters.entity).toBe("leave_request");
      expect(q.filters.role).toBe("manager");
      expect(q.filters.demo).toBe(true);
      expect(q.filters.from).toBe("2026-11-01T14:00:00.000Z");
      expect(q.filters.to).toBe("2026-11-09T14:00:00.000Z");
    });

    it("keeps the filters that were typed correctly when one was not", async () => {
      const { parseFilters } = await import("../../src/server/audit");
      // The reason each key is parsed on its own. One safeParse over the whole object fails as a
      // unit, so this URL would lose the person and show every entry in the range instead.
      const q = parseFilters({ person: "not-a-uuid", action: "request_approved", role: "manager" }, BRISBANE);
      expect(q.rejected).toEqual(["person"]);
      expect(q.filters.person).toBeNull();
      expect(q.filters.action).toBe("request_approved");
      expect(q.filters.role).toBe("manager");
    });

    it("rejects an action the database would refuse to store", async () => {
      const { parseFilters, AUDIT_ACTIONS } = await import("../../src/server/audit");
      // `audit_log_action_known` is a check constraint over fifteen names, so anything else is a
      // filter that can only ever return nothing — worse than no filter at all.
      expect(AUDIT_ACTIONS).toHaveLength(15);
      const q = parseFilters({ action: "request_deleted" }, BRISBANE);
      expect(q.rejected).toEqual(["action"]);
      expect(q.filters.action).toBeNull();
    });

    it("rejects an entity and a role outside the columns' own domains", async () => {
      const { parseFilters, AUDIT_ENTITIES } = await import("../../src/server/audit");
      expect(AUDIT_ENTITIES).toEqual(["leave_request", "user", "allowance", "leave_type"]);
      const q = parseFilters({ entity: "payroll", role: "director" }, BRISBANE);
      expect(q.rejected).toEqual(["entity", "role"]);
      expect(q.filters.entity).toBeNull();
      expect(q.filters.role).toBeNull();
    });

    it("rejects a date that is not a calendar day", async () => {
      const { parseFilters } = await import("../../src/server/audit");
      const q = parseFilters({ from: "2026-13-05", to: "last tuesday" }, BRISBANE);
      expect(q.rejected).toEqual(["from", "to"]);
      expect(q.filters.from).toBeNull();
      expect(q.filters.to).toBeNull();
    });

    it("takes demo as three answers and no more", async () => {
      const { parseFilters } = await import("../../src/server/audit");
      expect(parseFilters({ demo: "true" }, BRISBANE).filters.demo).toBe(true);
      expect(parseFilters({ demo: "false" }, BRISBANE).filters.demo).toBe(false);
      const junk = parseFilters({ demo: "maybe" }, BRISBANE);
      expect(junk.rejected).toEqual(["demo"]);
      // Rejected does not mean "both": the default survives, so a broken box hides demo entries
      // rather than revealing them (D9).
      expect(junk.filters.demo).toBe(false);
    });

    it("treats a cleared filter as no filter, not as an error", async () => {
      const { parseFilters } = await import("../../src/server/audit");
      // An HTML GET form submits an empty value for an unselected <select>, so this is what Reset
      // sends. Naming it in `rejected` would put an error on the page for using the form normally.
      const q = parseFilters({ person: "", action: "", role: "", demo: "", from: "", to: "" }, BRISBANE);
      expect(q.rejected).toEqual([]);
      expect(q.filters).toEqual({
        person: null,
        action: null,
        entity: null,
        role: null,
        demo: false,
        from: null,
        to: null,
      });
    });

    it("takes the first of a repeated param rather than choosing silently later", async () => {
      const { parseFilters } = await import("../../src/server/audit");
      // Next hands a repeated key to the page as an array. The form writes each key once, so this is
      // a hand-made URL, and the first value is what the browser was told first.
      const q = parseFilters({ person: [PERSON, OTHER] }, BRISBANE);
      expect(q.rejected).toEqual([]);
      expect(q.filters.person).toBe(PERSON);
    });

    it("lists the fifteen actions the filter bar renders", async () => {
      const { AUDIT_ACTIONS } = await import("../../src/server/audit");
      // The count is the link to the constraint; the words are what A071's select will show, and an
      // option the database never writes is a filter that always answers "nothing".
      expect(new Set(AUDIT_ACTIONS).size).toBe(15);
      expect(AUDIT_ACTIONS).toContain("leave_type_default_changed");
      expect(AUDIT_ACTIONS).toContain("request_declined");
      expect(AUDIT_ACTIONS).toContain("request_withdrawn");
      expect(AUDIT_ACTIONS).toContain("cancellation_approved");
    });
  });

  describe("parseFilters — whole days in the viewer's zone", () => {
    it("puts the same date at different instants for two eastern zones", async () => {
      const { parseFilters } = await import("../../src/server/audit");
      // Nov 2026: Brisbane is +10 whatever the season, Sydney is +11. One date, two midnights.
      expect(parseFilters({ from: "2026-11-18" }, BRISBANE).filters.from).toBe("2026-11-17T14:00:00.000Z");
      expect(parseFilters({ from: "2026-11-18" }, SYDNEY).filters.from).toBe("2026-11-17T13:00:00.000Z");
    });

    it("ends the range at the next day's start, so p_to stays exclusive", async () => {
      const { parseFilters } = await import("../../src/server/audit");
      const q = parseFilters({ from: "2026-11-18", to: "2026-11-18" }, BRISBANE);
      expect(q.filters.to).toBe("2026-11-18T14:00:00.000Z");
      // One day named in the URL is one day of entries: the whole of it, and none of the next.
      expect(Date.parse(String(q.filters.to)) - Date.parse(String(q.filters.from))).toBe(24 * 60 * 60 * 1000);
    });

    it("counts a 23-hour day as 23 hours, because that is what the viewer lived", async () => {
      const { parseFilters } = await import("../../src/server/audit");
      // DST starts in Sydney on 4 Oct 2026 at 2am, so that calendar day is one hour short. A range
      // built by adding 24 hours would cut off the last hour of it, and an entry in that hour would
      // be missing from a page and from a file the admin exports on the same filter.
      const q = parseFilters({ from: "2026-10-04", to: "2026-10-04" }, SYDNEY);
      expect(q.filters.from).toBe("2026-10-03T14:00:00.000Z");
      expect(q.filters.to).toBe("2026-10-04T13:00:00.000Z");
      expect(Date.parse(String(q.filters.to)) - Date.parse(String(q.filters.from))).toBe(23 * 60 * 60 * 1000);
    });

    it("counts a 25-hour day as 25 hours", async () => {
      const { parseFilters } = await import("../../src/server/audit");
      // DST ends on 5 Apr 2026, which the viewer experiences as a day with an hour repeated in it.
      const q = parseFilters({ from: "2026-04-05", to: "2026-04-05" }, SYDNEY);
      expect(q.filters.from).toBe("2026-04-04T13:00:00.000Z");
      expect(q.filters.to).toBe("2026-04-05T14:00:00.000Z");
      expect(Date.parse(String(q.filters.to)) - Date.parse(String(q.filters.from))).toBe(25 * 60 * 60 * 1000);
    });

    it("keeps a one-sided range one-sided", async () => {
      const { parseFilters } = await import("../../src/server/audit");
      // `from` alone is "everything since that morning" and `to` alone is "up to that evening":
      // neither becomes a guess about the other end, because the function reads a null as no bound.
      expect(parseFilters({ from: "2026-11-18" }, BRISBANE).filters.to).toBeNull();
      expect(parseFilters({ to: "2026-11-18" }, BRISBANE).filters.from).toBeNull();
    });
  });

  describe("parseFilters — the cursor is the pair", () => {
    it("carries both halves of a cursor", async () => {
      const { parseFilters } = await import("../../src/server/audit");
      const q = parseFilters({ before_at: "2026-11-17T15:30:00Z", before_id: "9007199254740991" }, BRISBANE);
      expect(q.cursor).toEqual({ beforeAt: "2026-11-17T15:30:00Z", beforeId: 9007199254740991 });
    });

    it("reads a half cursor as no cursor", async () => {
      const { parseFilters } = await import("../../src/server/audit");
      // The same rule A055 and A069 state in SQL. A pasted link with one parameter is not a request
      // for the middle of a list, and an empty page would read as "no older history".
      expect(parseFilters({ before_at: "2026-11-17T15:30:00Z" }, BRISBANE).cursor).toEqual({});
      expect(parseFilters({ before_id: "12" }, BRISBANE).cursor).toEqual({});
    });

    it("drops a before_id that is not a row id rather than sending it", async () => {
      const { parseFilters } = await import("../../src/server/audit");
      for (const bad of ["abc", "-3", "0", "1.5", ""]) {
        const q = parseFilters({ before_at: "2026-11-17T15:30:00Z", before_id: bad }, BRISBANE);
        expect(q.cursor).toEqual({});
      }
    });

    it("passes an unreadable before_at through rather than rejecting it", async () => {
      const { parseFilters } = await import("../../src/server/audit");
      // /history makes the same choice for the same reason: Postgres knows what a timestamptz is and
      // this file does not, and a cursor the database refuses is how the error state gets reached
      // (A054). Rejecting it here would turn a refused read into a newest-page list.
      const q = parseFilters({ before_at: "yesterday", before_id: "12" }, BRISBANE);
      expect(q.cursor.beforeAt).toBe("yesterday");
      expect(q.rejected).toEqual([]);
    });
  });

  describe("fetchAudit and exportAuditCsv — one call each, in the shape the RPCs want", () => {
    it("asks audit_search once, with demo always sent and the unset filters left out", async () => {
      const { parseFilters, fetchAudit } = await import("../../src/server/audit");
      const { c, calls } = stubClient({ data: [] });
      const { filters, cursor } = parseFilters({}, BRISBANE);
      const res = await fetchAudit(c, filters, cursor);
      expect(calls.map((x) => x.fn)).toEqual(["audit_search"]);
      expect(calls[0].args.p_demo).toBe(false);
      expect(calls[0].args.p_limit).toBe(50);
      // `undefined`, not null: the body PostgREST builds drops these, so the function's own default
      // answers rather than a value the page invented.
      expect(calls[0].args.p_person).toBeUndefined();
      expect(calls[0].args.p_from).toBeUndefined();
      expect(res).toEqual({ entries: [], error: null });
    });

    it("sends every filter the URL carried, with the dates as instants", async () => {
      const { parseFilters, fetchAudit } = await import("../../src/server/audit");
      const { c, calls } = stubClient({ data: [] });
      const { filters, cursor } = parseFilters(
        {
          person: PERSON, action: "allowance_set", entity: "allowance", role: "admin", demo: "true",
          from: "2026-11-02", to: "2026-11-03", before_at: "2026-11-01T00:00:00Z", before_id: "41",
        },
        BRISBANE,
      );
      await fetchAudit(c, filters, cursor);
      expect(calls[0].args).toEqual({
        p_person: PERSON,
        p_action: "allowance_set",
        p_entity: "allowance",
        p_role: "admin",
        p_demo: true,
        p_from: "2026-11-01T14:00:00.000Z",
        p_to: "2026-11-03T14:00:00.000Z",
        p_before_at: "2026-11-01T00:00:00Z",
        p_before_id: 41,
        p_limit: 50,
      });
    });

    it("sends the cursor it was given and never invents the other half", async () => {
      const { fetchAudit } = await import("../../src/server/audit");
      const { c, calls } = stubClient({ data: [] });
      const noFilters = {
        person: null, action: null, entity: null, role: null, demo: false, from: null, to: null,
      };
      await fetchAudit(c, noFilters, { beforeAt: "2026-11-01T00:00:00Z", beforeId: null });
      expect(calls[0].args.p_before_at).toBe("2026-11-01T00:00:00Z");
      expect(calls[0].args.p_before_id).toBeUndefined();
      // Pair-or-nothing is decided once, in SQL: `audit_search` reads a half cursor as no cursor, and
      // `supabase/tests/audit_search.sql` asserts that at the row level. Repeating the rule here
      // would put two copies of it where one could drift from the other.
    });

    it("hands a refusal back as an error beside an empty list", async () => {
      const { parseFilters, fetchAudit } = await import("../../src/server/audit");
      const { c } = stubClient({ error: NOT_ALLOWED });
      const { filters } = parseFilters({}, BRISBANE);
      const res = await fetchAudit(c, filters);
      expect(res.entries).toEqual([]);
      expect(res.error).toEqual(NOT_ALLOWED);
      // The page has to be able to tell these apart (FR-029), which is why the error travels with
      // the entries rather than throwing past them.
    });

    it("widens the jsonb three to objects the formatters can read", async () => {
      const { parseFilters, fetchAudit, describeChange } = await import("../../src/server/audit");
      const row = {
        id: 8, created_at: "2026-11-17T15:30:00Z", actor_id: PERSON, actor_role: "manager",
        actor_name: "Sam Manager", action: "request_approved", entity: "leave_request",
        entity_id: OTHER, subject_id: OTHER, subject_name: "Alex Employee",
        before: { status: "pending" }, after: { status: "approved" }, context: null,
        comment: null, is_demo: false, is_backfilled: false, source_key: null,
      };
      const { c } = stubClient({ data: [row] });
      const { filters } = parseFilters({}, BRISBANE);
      const { entries } = await fetchAudit(c, filters);
      expect(entries[0].before).toEqual({ status: "pending" });
      expect(describeChange(entries[0])).toBe("status: pending → approved");
    });

    it("passes the viewer's zone to the export every time, and no paging at all", async () => {
      const { parseFilters, exportAuditCsv } = await import("../../src/server/audit");
      const { c, calls } = stubClient({ data: [{ csv: "time,actor\n", row_count: 0, truncated: false }] });
      const { filters } = parseFilters({ from: "2026-11-02" }, SYDNEY);
      const res = await exportAuditCsv(c, filters, SYDNEY);
      expect(calls.map((x) => x.fn)).toEqual(["audit_export_csv"]);
      // p_tz is optional in the generated type and mandatory in fact: a file whose times belong to
      // the database rather than to the reader is a wrong file nobody can tell from a right one.
      expect(calls[0].args.p_tz).toBe(SYDNEY);
      expect(calls[0].args.p_from).toBe("2026-11-01T13:00:00.000Z");
      expect(calls[0].args.p_demo).toBe(false);
      expect(calls[0].args.p_limit).toBeUndefined();
      expect(calls[0].args.p_before_at).toBeUndefined();
      expect(res).toEqual({ csv: "time,actor\n", rowCount: 0, truncated: false, error: null });
    });

    it("reports a truncated export without counting the rows itself", async () => {
      const { parseFilters, exportAuditCsv } = await import("../../src/server/audit");
      const { c } = stubClient({ data: [{ csv: "…", row_count: 10000, truncated: true }] });
      const { filters } = parseFilters({}, BRISBANE);
      expect(await exportAuditCsv(c, filters, BRISBANE)).toEqual({
        csv: "…", rowCount: 10000, truncated: true, error: null,
      });
    });

    it("answers a bad zone with an empty file and the error, not with a guessed one", async () => {
      const { parseFilters, exportAuditCsv } = await import("../../src/server/audit");
      const { c } = stubClient({ error: { message: "invalid_timezone", code: "P0001", details: "", hint: "" } });
      const { filters } = parseFilters({}, BRISBANE);
      const res = await exportAuditCsv(c, filters, "AEST");
      expect(res.csv).toBe("");
      expect(res.truncated).toBe(false);
      expect(res.error?.message).toBe("invalid_timezone");
    });
  });
});

// ---------------------------------------------------------------------------------------------
// A071 — the filter bar's query helpers.
//
// No markup is rendered here, because what goes wrong in this component is not a pixel: it is the
// query. A067 reads the rendered page in a real browser the day A072 exists. What has to be true
// before then is one property — the query the bar *generates* for its Export link parses to the same
// seven filters as the query the bar was *rendered with*. That is the whole distance between
// FR-025's "the currently filtered entries" and a file that quietly holds more than the screen does.
// ---------------------------------------------------------------------------------------------
describe("the filter bar's query (A071)", () => {
  async function bar() {
    return import("../../src/components/audit/filter-bar");
  }

  /** A generated query back as the record Next hands a page, so both halves meet `parseFilters`. */
  const asParams = (q: string) => Object.fromEntries(new URLSearchParams(q)) as Record<string, string>;

  describe("valuesFromSearchParams — what the controls echo", () => {
    it("echoes every value it was given, untouched", async () => {
      const { valuesFromSearchParams } = await bar();
      expect(valuesFromSearchParams({ person: PERSON, action: "request_approved", from: "2026-11-02", to: "2026-11-09" })).toEqual({
        person: PERSON, action: "request_approved", entity: "", role: "", demo: "false", from: "2026-11-02", to: "2026-11-09",
      });
    });

    it("echoes a value it cannot read, because the admin has to see what they typed", async () => {
      const { valuesFromSearchParams } = await bar();
      const v = valuesFromSearchParams({ from: "3 March", action: "request_sent" });
      expect(v.from).toBe("3 March");
      expect(v.action).toBe("request_sent");
      // Not validated on purpose: A072 names the rejected filters beside this bar, and a control that
      // silently corrected the URL would hide the one clue the reader needs.
    });

    it("takes the first of a repeated param, the way parseFilters does", async () => {
      const { valuesFromSearchParams } = await bar();
      expect(valuesFromSearchParams({ role: ["employee", "manager"] }).role).toBe("employee");
    });

    it("reads demo as a radio reads it: true, or Real for anything else", async () => {
      const { valuesFromSearchParams } = await bar();
      expect(valuesFromSearchParams({ demo: "true" }).demo).toBe("true");
      expect(valuesFromSearchParams({ demo: "false" }).demo).toBe("false");
      expect(valuesFromSearchParams({}).demo).toBe("false");
      expect(valuesFromSearchParams({ demo: "MAYBE" }).demo).toBe("false");
      // A radio group cannot be checked to a value it does not offer, and D9's default is Real — so
      // the control falls to the same answer parseFilters lands on when it rejects the param.
    });

    it("leaves the cursor out of the filters entirely", async () => {
      const { valuesFromSearchParams, queryFromValues } = await bar();
      const v = valuesFromSearchParams({ person: PERSON, before_at: "2026-11-01T00:00:00Z", before_id: "41" });
      expect(Object.keys(v)).toEqual(["person", "action", "entity", "role", "demo", "from", "to"]);
      expect(queryFromValues(v)).toBe(`person=${PERSON}`);
      // A file is not a page: paging belongs to the list, and an export query that carried a cursor
      // would be a second opinion about where the rows start.
    });
  });

  describe("queryFromValues — the query the links carry", () => {
    it("writes nothing for a blank bar, and no `demo=false` either", async () => {
      const { valuesFromSearchParams, queryFromValues } = await bar();
      expect(queryFromValues(valuesFromSearchParams({}))).toBe("");
      expect(queryFromValues(valuesFromSearchParams({ demo: "false", person: "", from: "" }))).toBe("");
      // Omitting the default is not tidiness. parseFilters reads an absent demo as false, so the
      // shorter query means the same thing and a shared link does not carry seven empty keys.
    });

    it("keeps the seven in one fixed order, so the same view is the same string twice", async () => {
      const { queryFromValues } = await bar();
      const q = queryFromValues({
        to: "2026-11-09", person: PERSON, demo: "true", role: "manager", action: "", entity: "leave_request", from: "2026-11-02",
      });
      expect(q).toBe(`person=${PERSON}&entity=leave_request&role=manager&demo=true&from=2026-11-02&to=2026-11-09`);
    });

    it("leaves the value byte-for-byte what the URL said, so uuids match what A067 looks for", async () => {
      const { valuesFromSearchParams, queryFromValues } = await bar();
      const q = queryFromValues(valuesFromSearchParams({ person: PERSON }));
      expect(q).toContain(`person=${PERSON}`);
      // tests/e2e/audit.spec.ts asserts the rendered link's href *contains* exactly this substring;
      // an encoder here that re-wrote the id would fail a browser test nobody can debug at 02:00.
    });
  });

  describe("the query the bar generates parses to the view the bar was rendered with", () => {
    const views: { name: string; raw: Record<string, string | string[] | undefined> }[] = [
      { name: "an empty URL", raw: {} },
      { name: "one person", raw: { person: PERSON } },
      { name: "a whole view", raw: { person: PERSON, action: "allowance_set", entity: "allowance", role: "admin", demo: "true", from: "2026-11-02", to: "2026-11-09" } },
      { name: "real entries asked for by name", raw: { demo: "false" } },
      { name: "a date range on a DST day", raw: { from: "2026-10-04", to: "2026-10-05" } },
      { name: "a mistyped closing date", raw: { person: PERSON, from: "2026-11-02", to: "3 March" } },
      { name: "an action the constraint does not know", raw: { action: "request_sent" } },
      { name: "a repeated role", raw: { role: ["employee", "manager"] } },
      { name: "a page from the middle of the list", raw: { person: PERSON, before_at: "2026-11-01T00:00:00Z", before_id: "41" } },
      { name: "a select the browser submitted empty", raw: { person: "", action: "", entity: "", role: "", demo: "false", from: "", to: "" } },
    ];

    for (const { name, raw } of views) {
      it(`the file and the screen agree when the URL is ${name}`, async () => {
        const { parseFilters } = await import("../../src/server/audit");
        const { valuesFromSearchParams, queryFromValues } = await bar();
        const onScreen = parseFilters(raw, SYDNEY);
        const inFile = parseFilters(asParams(queryFromValues(valuesFromSearchParams(raw))), SYDNEY);
        expect(inFile.filters).toEqual(onScreen.filters);
        expect(inFile.cursor).toEqual({});
        // The one key allowed to disappear from the rejected list is `demo`, and the test below says
        // why. Anything else that goes missing means the bar dropped a filter the page complained
        // about, which is the widening this property exists to prevent.
        expect(inFile.rejected).toEqual(onScreen.rejected.filter((k) => k !== "demo"));
        // `cursor`, not `onScreen.cursor`: the export does not page, so the generated query carries no
        // cursor whatever page the reader clicked the link on.
      });
    }

    it("differs only in what it names as rejected, and never in which rows match", async () => {
      const { parseFilters } = await import("../../src/server/audit");
      const { valuesFromSearchParams, queryFromValues } = await bar();
      const raw = { demo: "MAYBE" };
      const onScreen = parseFilters(raw, SYDNEY);
      const inFile = parseFilters(asParams(queryFromValues(valuesFromSearchParams(raw))), SYDNEY);
      expect(onScreen.rejected).toEqual(["demo"]);
      expect(inFile.rejected).toEqual([]);
      expect(inFile.filters).toEqual(onScreen.filters);
      // The one place the two are not identical strings. A hand-typed `demo` the page can name as
      // ignored is a `demo` the file simply does not carry; both answer with real entries, so the rows
      // cannot move. Saying "the export never disagrees" would be the lie — this is the truth.
    });
  });

  describe("labelFor — the options stay worth reading", () => {
    it("turns a stored value into its own words", async () => {
      const { labelFor } = await bar();
      expect(labelFor("request_approved")).toBe("Request approved");
      expect(labelFor("leave_type_default_changed")).toBe("Leave type default changed");
      expect(labelFor("leave_request")).toBe("Leave request");
      expect(labelFor("user")).toBe("User");
    });

    it("keeps every action and entity distinguishable, because two alike options cannot be aimed", async () => {
      const { AUDIT_ACTIONS, AUDIT_ENTITIES } = await import("../../src/server/audit");
      const { labelFor } = await bar();
      const actionLabels = AUDIT_ACTIONS.map(labelFor);
      const entityLabels = AUDIT_ENTITIES.map(labelFor);
      expect(new Set(actionLabels).size).toBe(AUDIT_ACTIONS.length);
      expect(new Set(entityLabels).size).toBe(AUDIT_ENTITIES.length);
      expect(actionLabels).not.toContain("");
      // The drift this guards against is a new action whose prettified words already exist: the check
      // constraint in the database would accept the row and the select would show the same words twice.
    });
  });
});

// ---------------------------------------------------------------------------------------------
// A073 — the query as the export route receives it.
//
// This is the seam between two callers of one parser. A page is handed a record by Next; a route
// handler is handed a `URLSearchParams` and has to convert it, and the conversion is where an
// otherwise invisible difference — which half of a repeated key wins — would enter. FR-025 says the
// file holds the entries the screen is showing, and no browser test can see the difference unless a
// URL with a repeated param is written down here.
// ---------------------------------------------------------------------------------------------
describe("the query an export route reads (A073)", () => {
  it("groups a repeated key into an array, the way Next hands a page", async () => {
    const { queryParams } = await import("../../src/server/audit");
    expect(queryParams(new URLSearchParams(`person=${PERSON}&role=employee&role=manager`))).toEqual({
      person: PERSON,
      role: ["employee", "manager"],
    });
  });

  it("keeps a single value a bare string, and a cleared one an empty string", async () => {
    const { queryParams } = await import("../../src/server/audit");
    expect(queryParams(new URLSearchParams("demo=true&from=2026-11-02"))).toEqual({ demo: "true", from: "2026-11-02" });
    // The empty value survives as `""` rather than vanishing: `single()` is what turns it into
    // "no filter", and an unfiltered select submitted by a browser arrives exactly like this.
    expect(queryParams(new URLSearchParams("to="))).toEqual({ to: "" });
    expect(queryParams(new URLSearchParams(""))).toEqual({});
  });

  const urls: { name: string; query: string; page: Record<string, string | string[] | undefined> }[] = [
    { name: "nothing at all", query: "", page: {} },
    {
      name: "a whole view",
      query: `person=${PERSON}&action=allowance_set&entity=allowance&role=admin&demo=true&from=2026-11-02&to=2026-11-09`,
      page: { person: PERSON, action: "allowance_set", entity: "allowance", role: "admin", demo: "true", from: "2026-11-02", to: "2026-11-09" },
    },
    { name: "a repeated role", query: "role=employee&role=manager", page: { role: ["employee", "manager"] } },
    { name: "a mistyped date", query: "from=2026-11-02&to=3+March", page: { from: "2026-11-02", to: "3 March" } },
    { name: "an action the constraint does not know", query: "action=request_sent", page: { action: "request_sent" } },
    { name: "a cleared demo", query: "demo=", page: { demo: "" } },
    {
      name: "a page from the middle of the list",
      query: `person=${PERSON}&before_at=2026-11-01T00:00:00Z&before_id=41`,
      page: { person: PERSON, before_at: "2026-11-01T00:00:00Z", before_id: "41" },
    },
  ];

  for (const { name, query, page } of urls) {
    it(`answers ${name} with the filters, cursor and complaints the screen reads`, async () => {
      const { queryParams, parseFilters } = await import("../../src/server/audit");
      expect(parseFilters(queryParams(new URLSearchParams(query)), SYDNEY)).toEqual(parseFilters(page, SYDNEY));
    });
  }

  it("is the difference between this and the one-line conversion, which is why it is a function", async () => {
    const { queryParams, parseFilters } = await import("../../src/server/audit");
    const query = "role=employee&role=manager";
    const tempted = parseFilters(Object.fromEntries(new URLSearchParams(query)), SYDNEY);
    const grouped = parseFilters(queryParams(new URLSearchParams(query)), SYDNEY);
    expect(tempted.filters.role).toBe("manager");
    expect(grouped.filters.role).toBe("employee");
    // `Object.fromEntries` is what the shortest answer is, and it reads the same address bar as
    // `?role=employee` while the page beside it reads as `?role=employee`. Neither of those rows is
    // wrong; the file would simply not be the list.
  });
});
