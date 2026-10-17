import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";
import { DEMO_EMAIL_DOMAIN, DEMO_EMPLOYEES, DEMO_REQUESTS, type DemoRequest } from "./roster";

type Db = SupabaseClient<Database>;

export type LoadDemoOptions = {
  /** Secret-key client: auth admin API and the demo `profiles` inserts. */
  admin: Db;
  /** A signed-in admin's client. Records the approve and decline decisions. */
  decider: Db;
  /** Sign-in password for every demo user. Used, never stored or logged. */
  password: string;
  /** The day the demo is loaded (YYYY-MM-DD). Defaults to today (UTC). */
  today?: string;
  /** A fresh, signed-out client for each demo user. Defaults to the publishable key. */
  newUserClient?: () => Db;
};

export const DEMO_PASSWORD_MIN = 10;

const isDemoEmail = (email: string | undefined) => !!email && email.toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`);

function defaultUserClient(): Db {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function check<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Demo ${what} failed: ${res.error.message}`);
  return res.data as T;
}

/**
 * Ids of every demo account: profiles flagged `is_demo`, plus demo-domain auth users
 * left without a profile by an interrupted load. A demo-domain account with a real
 * profile is not touched.
 */
async function demoUserIds(admin: Db): Promise<string[]> {
  const flagged = check(await admin.from("profiles").select("id").eq("is_demo", true), "profile lookup");
  const ids = new Set(flagged.map((p) => p.id));

  const domainUsers: string[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Demo user lookup failed: ${error.message}`);
    for (const u of data.users) if (isDemoEmail(u.email) && !ids.has(u.id)) domainUsers.push(u.id);
    if (data.users.length < 1000) break;
  }
  if (domainUsers.length) {
    // Only ids that have no profile at all: never a real profile.
    const withProfile = check(await admin.from("profiles").select("id").in("id", domainUsers), "profile lookup");
    const taken = new Set(withProfile.map((p) => p.id));
    for (const id of domainUsers) if (!taken.has(id)) ids.add(id);
  }
  return [...ids];
}

/** Deletes every demo account. Their profiles, requests and allowances cascade. */
export async function removeDemo(admin: Db): Promise<number> {
  const ids = await demoUserIds(admin);
  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw new Error(`Demo user delete failed: ${error.message}`);
  }
  return ids.length;
}

const DAY_MS = 86_400_000;
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The request's dates for a load on `today`, pushed `shiftWeeks` later. */
export function demoRequestDates(r: DemoRequest, today: string, shiftWeeks = 0): { start: string; end: string } {
  const t = Date.parse(`${today}T00:00:00Z`);
  const monday = t - ((new Date(t).getUTCDay() + 6) % 7) * DAY_MS;
  const start = monday + ((r.weekOffset + shiftWeeks) * 7 + r.weekday - 1) * DAY_MS;
  let end = start + (r.workdays - 1) * DAY_MS;
  // A request can't span two leave years: stop it on 31 December.
  const startYear = new Date(start).getUTCFullYear();
  if (new Date(end).getUTCFullYear() !== startYear) end = Date.UTC(startYear, 11, 31);
  return { start: toIso(start), end: toIso(end) };
}

/** A week of public holidays (late December) can leave no working days: try later weeks. */
const RETRYABLE = new Set(["no_working_days"]);
const MAX_SHIFTS = 3;

/**
 * Deletes the existing demo users, then creates the roster: auth users with the given
 * password, `is_demo` profiles, requests submitted by each demo user through
 * `submit_leave_request`, and decisions recorded by `decider` through
 * `decide_leave_request`. Never reads or writes a non-demo row (SC-007).
 */
export async function loadDemo(opts: LoadDemoOptions): Promise<{ users: number; requests: number }> {
  const { admin, decider, password } = opts;
  if (password.length < DEMO_PASSWORD_MIN) {
    throw new Error(`The demo password must be at least ${DEMO_PASSWORD_MIN} characters.`);
  }
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const newUserClient = opts.newUserClient ?? defaultUserClient;

  await removeDemo(admin);

  const types = check(await admin.from("leave_types").select("id, name, is_active, sort_order").order("sort_order"), "leave type lookup");
  const active = types.filter((t) => t.is_active);
  if (active.length === 0) throw new Error("There is no active leave type to request.");
  const typeId = (name: string) => (active.find((t) => t.name === name) ?? active[0]).id;

  // Calls are kept few on purpose: a Worker on the free plan gets 50 subrequests per
  // request, and a reset from the admin page makes about 45. One profile insert for all.
  const ids: string[] = [];
  for (const employee of DEMO_EMPLOYEES) {
    const created = await admin.auth.admin.createUser({ email: employee.email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error(`Demo user create failed: ${created.error?.message}`);
    ids.push(created.data.user.id);
  }
  check(
    await admin.from("profiles").insert(
      DEMO_EMPLOYEES.map((e, i) => ({
        id: ids[i],
        email: e.email,
        full_name: e.full_name,
        role: "employee" as const,
        region_code: e.region_code,
        timezone: e.timezone,
        is_demo: true,
      })),
    ),
    "profile insert",
  );

  let requests = 0;
  for (const employee of DEMO_EMPLOYEES) {
    // In-memory session, dropped with the client: no sign-out call needed.
    const client = newUserClient();
    const signIn = await client.auth.signInWithPassword({ email: employee.email, password });
    if (signIn.error) throw new Error(`Demo sign-in failed: ${signIn.error.message}`);

    for (const r of DEMO_REQUESTS.filter((x) => x.email === employee.email)) {
      let submitted: Database["public"]["Tables"]["leave_requests"]["Row"] | null = null;
      for (let shift = 0; !submitted; shift++) {
        const { start, end } = demoRequestDates(r, today, shift);
        const res = await client.rpc("submit_leave_request", {
          p_leave_type_id: typeId(r.leaveType),
          p_start: start,
          p_end: end,
          p_note: r.note,
        });
        if (!res.error) submitted = res.data;
        else if (!RETRYABLE.has(res.error.message) || shift >= MAX_SHIFTS) {
          throw new Error(`Demo request failed: ${res.error.message}`);
        }
      }
      requests++;

      if (r.status !== "pending") {
        check(
          await decider.rpc("decide_leave_request", {
            p_request_id: submitted.id,
            p_outcome: r.status,
            p_comment: r.comment,
          }),
          "decision",
        );
      }
    }
  }

  return { users: DEMO_EMPLOYEES.length, requests };
}
