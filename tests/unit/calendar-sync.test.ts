import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildEvent,
  CALENDAR_SCOPE,
  classify,
  eventId,
  normalisePem,
  signAssertion,
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
  ] as const)("%s %i -> %s", (action, status, expected) => {
    expect(classify(action, status)).toBe(expected);
  });
});

describe("signAssertion", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const oneLine = pem.trim().replace(/\n/g, "\n");

  it("turns literal \n escapes back into newlines", () => {
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
