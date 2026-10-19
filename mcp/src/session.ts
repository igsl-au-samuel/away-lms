import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../../src/lib/database.types";
import { isPrivilegedKey, loadViewer, type Session } from "../../src/server/mcp/session";

const envSchema = z.object({
  LMS_SUPABASE_URL: z.url(),
  LMS_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  LMS_EMAIL: z.email(),
  LMS_PASSWORD: z.string().min(1),
});

export type McpEnv = z.infer<typeof envSchema>;

/**
 * Reads the server's settings from the environment. Throws on missing values, and refuses
 * any secret key: the server only ever acts as the signed-in user, so RLS applies.
 */
export function readEnv(env: Record<string, string | undefined> = process.env): McpEnv {
  if (env.SUPABASE_SECRET_KEY) {
    throw new Error("SUPABASE_SECRET_KEY is set. The LMS MCP server never uses the secret key; unset it.");
  }
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((i) => String(i.path[0])))];
    throw new Error(`Missing or invalid environment variables: ${names.join(", ")}. See mcp/README.md.`);
  }
  if (isPrivilegedKey(parsed.data.LMS_SUPABASE_PUBLISHABLE_KEY)) {
    throw new Error("LMS_SUPABASE_PUBLISHABLE_KEY is a secret key. Use the publishable (anon) key.");
  }
  return parsed.data;
}

/**
 * Signs in lazily on the first tool call and reuses the session after that. supabase-js
 * refreshes the access token in the background. A failed sign-in, or a session that is later
 * signed out (for example a refresh that fails for good), is retried on the next call.
 */
export function createSessionProvider(env: McpEnv): () => Promise<Session> {
  let pending: Promise<Session> | null = null;
  return () => {
    pending ??= (async () => {
      const db = createClient<Database>(env.LMS_SUPABASE_URL, env.LMS_SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: true },
      });
      const { error } = await db.auth.signInWithPassword({ email: env.LMS_EMAIL, password: env.LMS_PASSWORD });
      if (error?.code === "invalid_credentials") throw new Error("invalid_credentials");
      if (error) throw new Error("sign_in_failed", { cause: error.message });
      const session = { db, me: await loadViewer(db) };
      db.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") pending = null;
      });
      return session;
    })().catch((err) => {
      pending = null;
      throw err;
    });
    return pending;
  };
}
