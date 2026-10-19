import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./lib/database.types";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  // getUser() validates the token with Auth and refreshes cookies (research R3).
  await supabase.auth.getUser();
  return response;
}

export const config = {
  // /mcp and /.well-known authenticate with bearer tokens (or not at all), so skip the cookie round trip.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|mcp(?:/|$)|\\.well-known(?:/|$)).*)"],
};
