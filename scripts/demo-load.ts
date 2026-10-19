/**
 * Loads or resets the fictional demo team on the LOCAL stack only (FR-029, SC-007).
 * Usage: npm run demo:load            (prompts for everything)
 *        npm run demo:load -- --password <demo pw> --admin-email <email> --admin-password <pw>
 * The admin (normally the one created by `seed:local`) records the demo decisions.
 * Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY.
 */
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline/promises";
import type { Database } from "../src/lib/database.types";
import { DEMO_PASSWORD_MIN, loadDemo } from "../src/server/demo/loader";
import { isLocalSupabaseUrl } from "./lib/local-guard";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;

if (!isLocalSupabaseUrl(url)) {
  console.error(`Refusing to load the demo: ${url ?? "(no URL)"} is not a local Supabase URL.`);
  process.exit(1);
}
if (!publishable || !secret) {
  console.error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY must be set.");
  process.exit(1);
}

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function ask(question: string, fallback?: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(fallback ? `${question} [${fallback}]: ` : `${question}: `);
  rl.close();
  return answer.trim() || fallback || "";
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };

async function main() {
  const password = flag("--password") ?? (await ask("Password for the demo users"));
  if (password.length < DEMO_PASSWORD_MIN) {
    console.error(`The demo password must be at least ${DEMO_PASSWORD_MIN} characters.`);
    process.exit(1);
  }
  const adminEmail = flag("--admin-email") ?? (await ask("Local admin email", "admin@away.test"));
  const adminPassword = flag("--admin-password") ?? (await ask("Local admin password"));

  const decider = createClient<Database>(url!, publishable!, options);
  const signIn = await decider.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
  if (signIn.error) {
    console.error("Could not sign in as the local admin. Run `npm run seed:local` first?");
    process.exit(1);
  }

  const started = Date.now();
  const result = await loadDemo({ admin: createClient<Database>(url!, secret!, options), decider, password });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`Demo loaded: ${result.users} users, ${result.requests} requests in ${seconds}s.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
