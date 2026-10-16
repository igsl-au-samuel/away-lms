import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../lib/supabase/server";
import type { Database } from "../lib/database.types";

export type Viewer = {
  id: string;
  full_name: string;
  email: string;
  role: Database["public"]["Enums"]["app_role"];
  region_code: string;
  timezone: string;
  is_active: boolean;
  is_demo: boolean;
};

/** Current user's profile via whoami(), or null (signed out, no profile, inactive). */
export async function getViewer(client?: SupabaseClient<Database>): Promise<Viewer | null> {
  const supabase = client ?? (await createClient());
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase.rpc("whoami");
  return (data as Viewer | null) ?? null;
}

/** Returns the viewer if they are an admin, otherwise throws `not_allowed`. */
export async function assertAdmin(client: SupabaseClient<Database>): Promise<Viewer> {
  const viewer = await getViewer(client);
  if (!viewer || viewer.role !== "admin") throw new Error("not_allowed");
  return viewer;
}

/** For Server Actions. */
export async function requireAdmin(): Promise<Viewer> {
  return assertAdmin(await createClient());
}
