import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";
import type { Viewer } from "../auth";

export type Db = SupabaseClient<Database>;

/** The signed-in user's client plus their profile. Every tool call runs through this. */
export type Session = { db: Db; me: Viewer };

/** True for keys that bypass RLS: new-style secret keys and legacy service_role JWTs. */
export function isPrivilegedKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}

/** Profile of the signed-in user, or an error code the tools can show. */
export async function loadViewer(db: Db): Promise<Viewer> {
  const { data, error } = await db.rpc("whoami");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("not_allowed"); // no profile, or deactivated
  return data as Viewer;
}
