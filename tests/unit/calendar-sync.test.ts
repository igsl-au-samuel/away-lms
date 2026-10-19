import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  buildEvent,
  CALENDAR_SCOPE,
  classify,
  eventId,
  normalisePem,
  processRows,
  signAssertion,
  type Outcome,
  type SyncRow,
} from "../../supabase/functions/calendar-sync/lib";

const ID = "0b9f3c1e-7a42-4d8e-9c55-1234567890ab";

describe("eventId", () => {
  it("is the uuid without dashes, base32hex-safe", () => {
    expect(eventId(ID)).toBe("0b9f3c1e7a424d8e9c551234567890ab");
    expect(eventId(ID)).toMatch(/^[0-9a-v]{5,1024}$/);
  });
});

describe("buildEvent", () => {
  const event = buildEvent({
    request_id: ID,
    full_name: "Ada Lovelace",
    start_date: "2026-12-30",
    end_date: "2026-12-31",
  });

  it("is an all-day event with an exclusive end date", () => {
    expect(event.start).toEqual({ date: "2026-12-30" });
    expect(event.end).toEqual({ date: "2027-01-01" });
  });

  it("titles it with the name and is transparent with no reminders", () => {
    expect(event.summary).toBe("Ada Lovelace — Away");
    expect(event.transparency).toBe("transparent");
    expect(event.reminders).toEqual({ useDefault: false, overrides: [] });
    expect(event).not.toHaveProperty("attendees");
  });

  it("carries the request id privately and nothing about the leave type or note", () => {
    expect(event.extendedProperties.private.lmsRequestId).toBe(ID);
    expect(Object.keys(event).sort()).toEqual(
      ["end", "extendedProperties", "id", "reminders", "start", "summary", "transparency"].sort(),
    );
  });
});

describe("classify", () => {
  it.each([
    ["create", 200, "done"],
    ["create", 409, "done"],
    ["create", 404, "fail"],
    ["create", 403, "fail"],
    ["create", 429, "retry"],
    ["create", 503, "retry"],
    ["create", 0, "retry"],
    ["delete", 204, "done"],
    ["delete", 404, "done"],
    ["delete", 410, "done"],
    ["delete", 409, "fail"],
    ["delete", 403, "fail"],
    ["delete", 500, "retry"],
    ["create", 401, "retry"],
    ["create", 408, "retry"],
  ] as const)("%s %i -> %s", (action, status, expected) => {
    expect(classify(action, status)).toBe(expected);
  });

  const reason = (r: string) => JSON.stringify({ error: { errors: [{ reason: r }] } });
  it.each([
    ["rateLimitExceeded", "retry"],
    ["userRateLimitExceeded", "retry"],
    ["quotaExceeded", "retry"],
    ["forbidden", "fail"],
    ["notFound", "fail"],
  ] as const)("403 with reason %s -> %s", (r, expected) => {
    expect(classify("create", 403, reason(r))).toBe(expected);
    expect(classify("delete", 403, reason(r))).toBe(expected);
  });

  it("treats a 403 with an unreadable body as a permanent failure", () => {
    expect(classify("create", 403, "<html>nope</html>")).toBe("fail");
  });
});

describe("signAssertion", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  // The .env.example format: one line, literal backslash-n between the PEM lines.
  const oneLine = pem.trim().replace(/\n/g, "\\n");

  it("turns literal \\n escapes back into newlines", () => {
    expect(oneLine).not.toContain("\n");
    expect(oneLine).toContain("\\n");
    expect(normalisePem(oneLine)).toBe(pem.trim());
  });

  it("signs an RS256 JWT with the right header and claims", async () => {
    const jwt = await signAssertion("sa@proj.iam.gserviceaccount.com", oneLine, 1_000_000);
    const [h, c, s] = jwt.split(".");
    const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString());
    expect(decode(h)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decode(c)).toEqual({
      iss: "sa@proj.iam.gserviceaccount.com",
      scope: CALENDAR_SCOPE,
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_000_000,
      exp: 1_003_600,
    });
    const { createVerify } = await import("node:crypto");
    const ok = createVerify("RSA-SHA256")
      .update(`${h}.${c}`)
      .verify(publicKey, Buffer.from(s, "base64url"));
    expect(ok).toBe(true);
  });
});

describe("processRows", () => {
  const row = (over: Partial<SyncRow> = {}): SyncRow => ({
    id: 1,
    request_id: ID,
    action: "create",
    attempts: 1,
    full_name: "Ada Lovelace",
    start_date: "2026-12-30",
    end_date: "2026-12-31",
    ...over,
  });

  function setup(status: number | Error, finishError: string | null = null) {
    const finished: [number, Outcome, string | null][] = [];
    const send = vi.fn(async () => {
      if (status instanceof Error) throw status;
      return new Response(status === 204 ? null : "body", { status });
    });
    const deps = {
      calendarId: "cal@group.calendar.google.com",
      getToken: async () => "tok",
      finish: async (r: SyncRow, o: Outcome, d: string | null) => {
        finished.push([r.id, o, d]);
        return finishError;
      },
      fetch: send as unknown as typeof fetch,
      log: vi.fn(),
    };
    return { deps, finished, send };
  }

  it("creates an event with a POST and reports done", async () => {
    const { deps, finished, send } = setup(200);
    const counts = await processRows([row()], deps);
    expect(counts.done).toBe(1);
    expect(finished).toEqual([[1, "done", null]]);
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://www.googleapis.com/calendar/v3/calendars/cal%40group.calendar.google.com/events");
    expect(init.method).toBe("POST");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("deletes by event id", async () => {
    const { deps, send } = setup(404);
    const counts = await processRows([row({ action: "delete", full_name: null })], deps);
    expect(counts.done).toBe(1);
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.endsWith(`/events/${eventId(ID)}`)).toBe(true);
    expect(init.method).toBe("DELETE");
  });

  it("treats a create whose request is gone or not approved as done without calling Google", async () => {
    const { deps, finished, send } = setup(200);
    await processRows([row({ full_name: null, start_date: null, end_date: null })], deps);
    expect(send).not.toHaveBeenCalled();
    expect(finished).toEqual([[1, "done", null]]);
  });

  it("defers every row when the token fails, without calling Google", async () => {
    const { deps, finished, send } = setup(200);
    deps.getToken = async () => {
      throw new Error("token exchange failed: 400");
    };
    const counts = await processRows([row({ id: 1 }), row({ id: 2, action: "delete" })], deps);
    expect(counts.defer).toBe(2);
    expect(send).not.toHaveBeenCalled();
    expect(finished.map(([, o, d]) => [o, d])).toEqual([
      ["defer", "token exchange failed: 400"],
      ["defer", "token exchange failed: 400"],
    ]);
  });

  it("retries on a network error or timeout", async () => {
    const { deps, finished } = setup(new DOMException("timed out", "TimeoutError"));
    const counts = await processRows([row()], deps);
    expect(counts.retry).toBe(1);
    expect(finished[0][1]).toBe("retry");
  });

  it("fails on a permanent 4xx and keeps the response text", async () => {
    const { deps, finished } = setup(403);
    await processRows([row()], deps);
    expect(finished[0][1]).toBe("fail");
    expect(finished[0][2]).toContain("HTTP 403: body");
  });

  it("retries a rate-limit 403 instead of failing it", async () => {
    const { deps, finished, send } = setup(403);
    send.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { errors: [{ reason: "rateLimitExceeded" }] } }), { status: 403 }),
    );
    await processRows([row()], deps);
    expect(finished[0][1]).toBe("retry");
  });

  it("carries on with the batch when finish throws", async () => {
    const { deps, finished } = setup(200);
    const seen: number[] = [];
    deps.finish = async (r: SyncRow, o: Outcome, d: string | null) => {
      seen.push(r.id);
      finished.push([r.id, o, d]);
      if (r.id === 1) throw new Error("network down");
      return null;
    };
    const counts = await processRows([row({ id: 1 }), row({ id: 2 })], deps);
    expect(seen).toEqual([1, 2]);
    expect(counts.finishErrors).toBe(1);
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining("outbox row 1: network down"));
  });

  it("logs and counts a finish that errors, and carries on with the next row", async () => {
    const { deps, finished } = setup(200, "connection reset");
    const counts = await processRows([row({ id: 1 }), row({ id: 2 })], deps);
    expect(counts.finishErrors).toBe(2);
    expect(finished).toHaveLength(2);
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining("outbox row 1: connection reset"));
  });

  it("does nothing for an empty batch", async () => {
    const { deps, send } = setup(200);
    deps.getToken = vi.fn(deps.getToken);
    const counts = await processRows([], deps);
    expect(counts.done).toBe(0);
    expect(deps.getToken).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
