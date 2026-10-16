import { NextResponse } from "next/server";

// Pass-through. The session refresh from @supabase/ssr lands here later.
export function proxy() {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
