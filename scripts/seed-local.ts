/**
 * Seeds a local admin, manager and two employees. Local stack only.
 * Usage: npm run seed:local -- --password <pw>   (or omit the flag to be prompted)
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (from `supabase status`).
 */
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline/promises";
import type { Database } from "../src/lib/database.types";
import { isLocalSupabaseUrl } from "./lib/local-guard";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

if (!isLocalSupabaseUrl(url)) {
  console.error(`Refusing to seed: ${url ?? "(no URL)"} is not a local Supabase URL.`);
  process.exit(1);
}
if (!secret) {
  console.error("SUPABASE_SECRET_KEY is not set.");
  process.exit(1);
}

async function getPassword(): Promise<string> {
  const i = process.argv.indexOf("--password");
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const pw = await rl.question("Password for seeded users: ");
  rl.close();
  return pw;
}

const USERS = [
  { email: "admin@away.test", full_name: "Alex Admin", role: "admin" },
  { email: "manager@away.test", full_name: "Morgan Manager", role: "manager" },
  { email: "employee1@away.test", full_name: "Eden Employee", role: "employee" },
  { email: "employee2@away.test", full_name: "Emery Employee", role: "employee" },
] as const;

async function main() {
  const password = await getPassword();
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }
  const supabase = createClient<Database>(url!, secret!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (const u of USERS) {
    let id: string | undefined;
    const created = await supabase.auth.admin.createUser({
      email: u.email,
      password,
      email_confirm: true,
    });
    if (created.error) {
      const list = await supabase.auth.admin.listUsers({ perPage: 1000 });
      id = list.data.users.find((x) => x.email === u.email)?.id;
      if (!id) throw created.error;
    } else {
      id = created.data.user.id;
    }
    const { error } = await supabase.from("profiles").upsert({
      id,
      email: u.email,
      full_name: u.full_name,
      role: u.role,
      region_code: "QLD",
      timezone: "Australia/Brisbane",
    });
    if (error) throw error;
    console.log(`seeded ${u.role}: ${u.email}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
