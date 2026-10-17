import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
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

/** One whoami() per request for layouts and pages. */
export const getRequestViewer = cache(() => getViewer());

/** For admin pages: the viewer if they are an admin, else null. A layout alone is not a security boundary. */
export async function getAdminViewer(): Promise<Viewer | null> {
  const viewer = await getRequestViewer();
  return viewer?.role === "admin" ? viewer : null;
}
