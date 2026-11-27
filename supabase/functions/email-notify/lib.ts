// Pure helpers for the email-notify Edge Function. No Deno APIs, so lint, tsc and vitest cover it —
// the same split as supabase/functions/calendar-sync/lib.ts, whose index.ts is excluded from both.

export type EmailEvent =
  | "request_submitted"
  | "request_approved"
  | "request_declined"
  | "cancellation_requested"
  | "cancellation_approved"
  | "cancellation_declined";

/** One claimed outbox row. Every field is nullable except the keys, because the request or the
 * person may have gone since the event happened; a null then means "nothing to say". */
export type EmailRow = {
  id: number;
  event: EmailEvent;
  attempts: number;
  recipient_email: string | null;
  recipient_name: string | null;
  subject_name: string | null;
  other_name: string | null;
  leave_type: string | null;
  start_date: string | null;
  end_date: string | null;
  working_days: number | null;
  detail: string | null;
};

/** `done` means the provider accepted the message and named it, not that anyone received it.
 *  `defer` is systemic — a refused credential — so it must not spend the row's attempts. */
export type Outcome = "done" | "retry" | "fail" | "defer" | "skipped";

export const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

/** Per-row ceiling. 10 rows x 8s stays inside the 3 minute row lock the claim sets. */
export const FETCH_TIMEOUT_MS = 8000;

export type TransacEmail = {
  sender: { name: string; email: string };
  to: { name?: string; email: string }[];
  subject: string;
  textContent: string;
};

export type Sender = { name: string; email: string };

/** The body is plain text on purpose. A person's note or comment goes into it verbatim; putting
 * the same text in HTML would need escaping and buys nothing an approver asked for. */
export function buildMessage(row: EmailRow, sender: Sender, siteUrl = ""): TransacEmail | null {
  const email = row.recipient_email?.trim();
  // The claim left-joins everything, so a null here is a fact: the request was deleted — a demo
  // reset cascades them — or the person it belongs to went with it. There is no sentence worth
  // sending about a leave nobody can open, so the row is reported rather than retried.
  if (!email || !row.subject_name || !row.start_date || !row.end_date) return null;

  const who = row.subject_name;
  const range = dateRange(row);
  const copy = COPY[row.event];

  const lines: string[] = [];
  if (copy.opening) lines.push(copy.opening(who, row.other_name));
  if (row.leave_type) lines.push(`Leave: ${row.leave_type}`);
  if (range) lines.push(`Dates: ${range}`);
  if (row.detail) lines.push(`Said: ${row.detail}`);
  lines.push("");
  lines.push(closing(row, siteUrl));

  return {
    sender,
    to: [{ email, ...(row.recipient_name ? { name: row.recipient_name } : {}) }],
    subject: copy.subject(who),
    textContent: lines.join("\n"),
  };
}

type Copy = {
  subject: (who: string) => string;
  /** Null when the sentence the subject already states is all there is to say. */
  opening: ((who: string, other: string | null) => string) | null;
};

const COPY: Record<EmailEvent, Copy> = {
  request_submitted: {
    subject: (who) => `New leave request — ${who}`,
    opening: (who) => `${who} has submitted a leave request for you to decide.`,
  },
  request_approved: {
    subject: () => "Your leave request was approved",
    opening: (_who, other) => `Your leave request was approved${other ? ` by ${other}` : ""}.`,
  },
  request_declined: {
    subject: () => "Your leave request was declined",
    opening: (_who, other) => `Your leave request was declined${other ? ` by ${other}` : ""}.`,
  },
  cancellation_requested: {
    subject: (who) => `${who} has asked to cancel approved leave`,
    opening: (who) => `${who} has asked to cancel leave that is already approved.`,
  },
  cancellation_approved: {
    subject: () => "Your cancellation was approved",
    opening: (_who, other) => `Your request to cancel the leave was approved${other ? ` by ${other}` : ""}.`,
  },
  cancellation_declined: {
    subject: () => "Your cancellation was declined",
    opening: (_who, other) => `Your request to cancel the leave was declined${other ? ` by ${other}` : ""}.`,
  },
};

/** Where the reader is standing next. The app has no request detail page, so this names the screen
 * that lists it rather than a deep link that would 404. */
function closing(row: EmailRow, siteUrl: string): string {
  if (!siteUrl) return "Sign in to Away to see it.";
  const path = row.event === "request_submitted" || row.event === "cancellation_requested" ? "/approvals" : "/requests";
  return `Sign in to Away to see it: ${siteUrl.replace(/\/+$/, "")}${path}`;
}

/** `Mon 2 Mar 2026 – Wed 4 Mar 2026 (3.0 working days)`, or the one date when they match. */
function dateRange(row: EmailRow): string {
  if (!row.start_date || !row.end_date) return "";
  const first = plainDate(row.start_date);
  const last = row.end_date === row.start_date ? first : plainDate(row.end_date);
  const days = row.working_days === null ? "" : ` (${row.working_days.toFixed(1)} working days)`;
  return `${first} – ${last}${days}`;
}

// Matches src/lib/dates.ts:12 so the mail and the screen say a date the same way -- including the
// Sept->Sep contraction that file applies, which this one cannot get from the locale alone.
const plainFormat = new Intl.DateTimeFormat("en-AU", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function plainDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const [, y, m, d] = match;
  return plainFormat
    .format(new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))))
    .replace(/,/g, "")
    .replace(/\bSept\b/, "Sep");
}

/**
 * Map a provider response (status 0 = network error, plus the response body) to what the outbox
 * should do.
 *
 * A 2xx means Brevo took the payload, not that it sent anything. With the transactional platform
 * switched off it answers the POST and then logs `Email not sent` against the message, which is how
 * #461's row 5 came to carry `done_at` and an empty `last_error` for a mail that left the building
 * and never arrived. `messageId` is the only handle the response gives for that later truth, so a
 * success without one is a retry — the row stays claimable and the provider's body lands in
 * `last_error`, which is where a failure can actually be seen. This is acceptance, not delivery:
 * confirming delivery needs the provider's event feed, and that needs a wider key than we have.
 *
 * 401 and 403 are `defer`, not `fail`: a rejected API key is one fault shared by every row in the
 * batch, and spending an attempt on each of them would empty the queue during the ten minutes it
 * takes to notice.
 */
export function classify(status: number, body: string): Outcome {
  if (status >= 200 && status < 300) return hasMessageId(body) ? "done" : "retry";
  if (status === 0 || status === 429 || status >= 500) return "retry";
  if (status === 401 || status === 403) return "defer";
  return "fail";
}

/** Brevo's documented success body is `{"messageId": "…"}`; an id of any other shape is not one. */
function hasMessageId(body: string): boolean {
  try {
    const id: unknown = (JSON.parse(body) as { messageId?: unknown })?.messageId;
    return typeof id === "string" && id.trim() !== "";
  } catch {
    return false;
  }
}

/** One send. Brevo answers 201 with a messageId and 4xx with a `message`. */
export async function postEmail(
  apiKey: string,
  message: TransacEmail,
  fetchImpl: typeof fetch = fetch,
): Promise<{ status: number; body: string }> {
  const res = await fetchImpl(BREVO_ENDPOINT, {
    method: "POST",
    headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  // Both bodies are read. On an error it is the sentence the outbox keeps; on a success it is the
  // messageId, and discarding it is what let #461's refusal look like a delivery.
  return { status: res.status, body: await res.text() };
}

export type Counts = Record<Outcome | "finishErrors", number>;

export type ProcessDeps = {
  sender: Sender;
  siteUrl?: string;
  apiKey: string;
  /** Reports an outcome for a claimed row. Resolves to an error message, or null on success. */
  finish: (row: EmailRow, outcome: Outcome, detail: string | null) => Promise<string | null>;
  send?: typeof postEmail;
  log?: (message: string) => void;
};

/**
 * Work one claimed batch and report each row's outcome.
 *
 * Every row answers `finish`, including the rows that never reached the network, so a claim cannot
 * leave a row locked for three minutes because its message could not be built.
 */
export async function processRows(rows: EmailRow[], deps: ProcessDeps): Promise<Counts> {
  const send = deps.send ?? postEmail;
  const log = deps.log ?? (() => {});
  const counts: Counts = { done: 0, retry: 0, fail: 0, defer: 0, skipped: 0, finishErrors: 0 };

  for (const row of rows) {
    let outcome: Outcome;
    let detail: string | null = null;

    const message = buildMessage(row, deps.sender, deps.siteUrl ?? "");
    if (!message) {
      // Nothing addressable to say: the person's row is gone, or the request underneath it is.
      outcome = "skipped";
      detail = row.recipient_email ? "the request it describes is gone" : "no recipient address";
    } else {
      try {
        const res = await send(deps.apiKey, message);
        outcome = classify(res.status, res.body);
        if (outcome !== "done") detail = `HTTP ${res.status}: ${res.body.slice(0, 300) || "no body"}`;
      } catch (e) {
        outcome = classify(0, "");
        detail = e instanceof Error ? e.message : String(e);
      }
    }

    counts[outcome]++;
    // A throwing finish must not strand the rest of the batch behind their 3 minute locks.
    const finishError = await deps.finish(row, outcome, detail).catch((e: unknown) =>
      e instanceof Error ? e.message : String(e),
    );
    if (finishError) {
      counts.finishErrors++;
      log(`email_notify_finish failed for outbox row ${row.id}: ${finishError}`);
    }
  }

  return counts;
}
