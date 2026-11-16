import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../lib/supabase/server";

/**
 * Ends the session for callers that need a URL. The app itself signs out through
 * the `signOut` Server Action in `src/components/nav.tsx`.
 */
export function GET() {
  // Refused: a GET here can be fired by a cross-site <img> or a prefetched <Link>.
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

export async function POST(request: NextRequest) {
  // A cross-site form can post too, so the request must come from this app.
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return new NextResponse(null, { status: 403 });
  }
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/sign-in", request.nextUrl.origin));
}
