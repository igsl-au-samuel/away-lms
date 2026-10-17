import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../lib/supabase/server";

/** Used by the app layout when a session has no active profile. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/sign-in", request.nextUrl.origin));
}
