import { describe, expect, it, vi } from "vitest";
import { formatPlainDate } from "../../src/lib/dates";
import {
  BREVO_ENDPOINT,
  buildMessage,
  classify,
  postEmail,
  processRows,
  type EmailRow,
  type Outcome,
  type Sender,
} from "../../supabase/functions/email-notify/lib";

const SENDER: Sender = { name: "Away", email: "away@example.gov.au" };

function row(over: Partial<EmailRow> = {}): EmailRow {
  return {
    id: 1,
    event: "request_submitted",
    attempts: 1,
    recipient_email: "mgr@example.gov.au",
    recipient_name: "Test manager",
    subject_name: "Test employee",
    other_name: "Test employee",
    leave_type: "Annual leave",
    start_date: "2026-12-07",
    end_date: "2026-12-09",
    working_days: 3,
    detail: "Family emergency",
    ...over,
  };
}

describe("buildMessage", () => {
  const message = buildMessage(row(), SENDER, "https://away.example.com/")!;

  it("addresses the one recipient the outbox row named and nothing else", () => {
    expect(message.to).toEqual([{ email: "mgr@example.gov.au", name: "Test manager" }]);
    expect(message).not.toHaveProperty("cc");
    expect(message).not.toHaveProperty("bcc");
    expect(message).not.toHaveProperty("replyTo");
  });

  it("carries the sender through untouched", () => {
    expect(message.sender).toEqual(SENDER);
  });

  it("is plain text only, so a person's note cannot be read as markup", () => {
    expect(Object.keys(message).sort()).toEqual(["sender", "subject", "textContent", "to"]);
    expect(message.textContent).not.toMatch(/</);
  });

  it("states the leave, the dates and what the person said", () => {
    expect(message.subject).toBe("New leave request — Test employee");
    expect(message.textContent).toContain("Test employee has submitted a leave request for you to decide.");
    expect(message.textContent).toContain("Leave: Annual leave");
    expect(message.textContent).toContain("Said: Family emergency");
    expect(message.textContent).toContain(
      `Dates: ${formatPlainDate("2026-12-07")} – ${formatPlainDate("2026-12-09")} (3.0 working days)`,
    );
  });

  it("links the screen that lists the work rather than a request page that does not exist", () => {
    expect(message.textContent).toContain("https://away.example.com/approvals");
    expect(message.textContent).not.toContain("https://away.example.com//");
    expect(buildMessage(row({ event: "request_approved" }), SENDER, "https://away.example.com")!.textContent).toContain(
      "/requests",
    );
  });

  it("says only the sentence without a site url", () => {
    expect(buildMessage(row(), SENDER)!.textContent).toContain("Sign in to Away to see it.");
  });

  it("names the decider when there is one and not when the row has no answer behind it", () => {
    expect(buildMessage(row({ event: "request_approved", other_name: "Test manager" }), SENDER)!.textContent).toContain(
      "Your leave request was approved by Test manager.",
    );
    expect(
      buildMessage(row({ event: "request_declined", other_name: null, detail: null }), SENDER)!.textContent,
    ).toContain("Your leave request was declined.\n");
  });

  it("keeps a subject line that already says it in the body", () => {
    const cancellation = buildMessage(row({ event: "cancellation_requested", detail: "Reef trip" }), SENDER)!;
    expect(cancellation.subject).toBe("Test employee has asked to cancel approved leave");
    expect(cancellation.textContent).toContain("Test employee has asked to cancel leave that is already approved.");
    expect(cancellation.textContent).toContain("Said: Reef trip");
  });

  it("omits the optional lines instead of printing null", () => {
    const bare = buildMessage(
      row({ leave_type: null, working_days: null, detail: null, recipient_name: null }),
      SENDER,
    )!;
    expect(bare.textContent).not.toContain("Leave:");
    expect(bare.textContent).not.toContain("Said:");
    expect(bare.textContent).not.toContain("working days");
    expect(bare.textContent).not.toContain("null");
    expect(bare.to).toEqual([{ email: "mgr@example.gov.au" }]);
  });

  it("collapses a single day to one date", () => {
    const one = buildMessage(row({ start_date: "2026-12-07", end_date: "2026-12-07" }), SENDER)!;
    expect(one.textContent).toContain(`Dates: ${formatPlainDate("2026-12-07")} – ${formatPlainDate("2026-12-07")}`);
  });

  // The recipient rule is SQL's (pgTAP row 49); what this half proves is that a message has no way
  // to carry anything the claim did not hand it, and that an unaddressable row is refused here
  // rather than sent as a sentence about Nobody.
  it.each([
    ["no address", row({ recipient_email: null })],
    ["a blank address", row({ recipient_email: "   " })],
    ["a deleted request", row({ subject_name: null, start_date: null, end_date: null })],
    ["no dates", row({ start_date: null, end_date: "2026-12-09" })],
  ])("sends nothing for %s", (_label, r) => {
    expect(buildMessage(r, SENDER, "https://away.example.com")).toBeNull();
  });
});

describe("classify", () => {
  it.each([
    [200, "done"],
    [201, "done"],
    [429, "retry"],
    [500, "retry"],
    [503, "retry"],
    [0, "retry"],
    [401, "defer"],
    [403, "defer"],
    [400, "fail"],
    [404, "fail"],
    [422, "fail"],
  ])("maps HTTP %i to %s", (status, outcome) => {
    expect(classify(status)).toBe(outcome);
  });

  it("refuses a credential without spending the batch's attempts", () => {
    // One fault for every row: `defer` refunds the attempt in SQL, so a bad key cannot drain the
    // retry budget of a queue that is otherwise fine.
    expect(classify(401)).toBe("defer");
    expect(classify(403)).toBe("defer");
  });
});

describe("postEmail", () => {
  async function capture(res: Response) {
    const fetchImpl = vi.fn(async () => res);
    const out = await postEmail("key-123", buildMessage(row(), SENDER)!, fetchImpl as unknown as typeof fetch);
    return { fetchImpl, out };
  }

  it("posts the message to Brevo's transactional endpoint with the api-key header", async () => {
    const { fetchImpl, out } = await capture(new Response("", { status: 201 }));
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(BREVO_ENDPOINT);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["api-key"]).toBe("key-123");
    expect(JSON.parse(init.body as string).to).toEqual([{ email: "mgr@example.gov.au", name: "Test manager" }]);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(out).toEqual({ status: 201, body: "" });
  });

  it("keeps the error body for the outbox and drops the body of a success", async () => {
    const { out } = await capture(new Response("Invalid sender", { status: 400 }));
    expect(out).toEqual({ status: 400, body: "Invalid sender" });
  });

  it("surfaces a network failure as a throw the caller classifies as retry", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(
      postEmail("key", buildMessage(row(), SENDER)!, fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(TypeError);
  });
});

describe("processRows", () => {
  function setup(plan: Array<{ status?: number; throws?: Error }>, finishError: string | null = null) {
    const finished: [number, Outcome, string | null][] = [];
    let i = 0;
    const deps = {
      sender: SENDER,
      siteUrl: "https://away.example.com",
      apiKey: "key",
      finish: async (r: EmailRow, o: Outcome, d: string | null) => {
        finished.push([r.id, o, d]);
        return finishError;
      },
      send: vi.fn(async () => {
        const step = plan[Math.min(i, plan.length - 1)];
        i++;
        if (step.throws) throw step.throws;
        return { status: step.status ?? 201, body: "nope" };
      }),
      log: vi.fn(),
    };
    return { deps, finished, send: deps.send, log: deps.log };
  }

  it("reports one outcome per row and counts it", async () => {
    const { deps, finished, send } = setup([{ status: 201 }]);
    const counts = await processRows([row()], deps);
    expect(counts.done).toBe(1);
    expect(finished).toEqual([[1, "done", null]]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("keeps going when one recipient fails, because the retry unit is a send and not a message", async () => {
    const { deps, finished } = setup([{ status: 201 }, { status: 400 }, { status: 503 }]);
    const counts = await processRows(
      [row({ id: 1 }), row({ id: 2, event: "request_approved" }), row({ id: 3, event: "request_declined" })],
      deps,
    );
    expect(counts).toMatchObject({ done: 1, fail: 1, retry: 1, defer: 0, skipped: 0, finishErrors: 0 });
    expect(finished.map(([id, outcome]) => [id, outcome])).toEqual([
      [1, "done"],
      [2, "fail"],
      [3, "retry"],
    ]);
    expect(finished[1][2]).toBe("HTTP 400: nope");
  });

  it("classifies a thrown send as a retry and records the reason", async () => {
    const { deps, finished } = setup([{ throws: new Error("socket closed") }]);
    const counts = await processRows([row()], deps);
    expect(counts.retry).toBe(1);
    expect(finished).toEqual([[1, "retry", "socket closed"]]);
  });

  it("skips an unaddressable row without touching the network", async () => {
    const { deps, finished, send } = setup([{ status: 201 }]);
    const counts = await processRows(
      [row({ id: 7, recipient_email: null }), row({ id: 8, subject_name: null, start_date: null })],
      deps,
    );
    expect(counts.skipped).toBe(2);
    expect(send).not.toHaveBeenCalled();
    expect(finished).toEqual([
      [7, "skipped", "no recipient address"],
      [8, "skipped", "the request it describes is gone"],
    ]);
  });

  it("defers a whole batch on a refused key, so the attempts survive until it is fixed", async () => {
    const { deps, finished } = setup([{ status: 401 }]);
    const counts = await processRows([row({ id: 1 }), row({ id: 2 })], deps);
    expect(counts.defer).toBe(2);
    expect(finished.map(([id, o]) => [id, o])).toEqual([
      [1, "defer"],
      [2, "defer"],
    ]);
  });

  it("answers finish for every row even when finish itself is failing", async () => {
    const { deps, finished, log } = setup([{ status: 201 }], "rpc unavailable");
    const counts = await processRows([row({ id: 1 }), row({ id: 2 })], deps);
    expect(counts.finishErrors).toBe(2);
    expect(finished.map(([id]) => id)).toEqual([1, 2]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("outbox row 2"));
  });

  it("truncates a provider body so one verbose error cannot bloat the queue", async () => {
    const finished: [number, Outcome, string | null][] = [];
    const deps = {
      sender: SENDER,
      apiKey: "key",
      finish: async (r: EmailRow, o: Outcome, d: string | null) => {
        finished.push([r.id, o, d]);
        return null;
      },
      send: vi.fn(async () => ({ status: 400, body: "x".repeat(1200) })),
    };
    await processRows([row()], deps);
    expect(finished[0][2]).toBe(`HTTP 400: ${"x".repeat(300)}`);
  });
});
