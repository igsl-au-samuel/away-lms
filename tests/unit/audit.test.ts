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

    it("covers all eleven actions the table allows, so a new one cannot slip past unworded", async () => {
      const { describeEntry } = await helpers();
      const actions = [
        "request_submitted", "request_approved", "request_declined",
        "allowance_set", "allowance_removed",
        "user_created", "user_role_changed", "user_region_changed", "user_active_changed",
        "leave_type_default_changed", "leave_type_changed",
      ];
      const sentences = actions.map((action) => describeEntry(entry({ action })));
      expect(sentences).toHaveLength(11);
      // An unworded action would fall through to something generic; every one of these has to
      // name an actor, and no two may read alike.
      expect(new Set(sentences).size).toBe(11);
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
