import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/database.types";
import { isLocalSupabaseUrl } from "../../scripts/lib/local-guard";

export type Db = SupabaseClient<Database>;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!isLocalSupabaseUrl(url)) {
  throw new Error(`Integration tests refuse to run against ${url ?? "(no URL)"}: not a local Supabase URL.`);
}
if (!publishableKey || !secretKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY must be set (see `supabase status`).");
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };

export const TEST_PASSWORD = process.env.E2E_PASSWORD ?? "";

/** Anonymous client (publishable key, no session). */
export function anonClient(): Db {
  return createClient<Database>(url!, publishableKey!, options);
}

/** Service-role client. Bypasses RLS: use for set-up and clean-up only. */
export function secretClient(): Db {
  return createClient<Database>(url!, secretKey!, options);
}

/** Client signed in as the given user. Throws if sign-in fails. */
export async function signedInClient(email: string, password: string): Promise<Db> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

export type TestUser = { id: string; email: string; password: string };

const created: string[] = [];

/** Creates a confirmed auth user plus profile. Removed by `cleanupUsers()`. */
export async function createTestUser(
  role: Database["public"]["Enums"]["app_role"] = "employee",
  password = `Pw-${randomUUID()}`,
): Promise<TestUser> {
  const admin = secretClient();
  const email = `it-${randomUUID().slice(0, 8)}@away.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  created.push(data.user.id);
  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    email,
    full_name: `Test ${role}`,
    role,
    region_code: "QLD",
    timezone: "Australia/Brisbane",
  });
  if (profileError) throw profileError;
  return { id: data.user.id, email, password };
}

/** Tracks a user created outside `createTestUser` (e.g. by inviteUser) for clean-up. */
export function trackUser(id: string) {
  created.push(id);
}

/** Deletes every tracked user; profiles go with them (FK cascade). Ignores already-deleted users. */
export async function cleanupUsers() {
  const admin = secretClient();
  while (created.length) {
    const id = created.pop()!;
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
  }
}
