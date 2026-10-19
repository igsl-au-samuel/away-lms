import { getCloudflareContext } from "@opennextjs/cloudflare";
import { parseAllowedClientIds } from "../../server/mcp/auth";
import { handleMcpPost, methodNotAllowed } from "../../server/mcp/handler";
import { limiter, type RateLimitBinding } from "../../server/mcp/rate-limit";

export const dynamic = "force-dynamic";

// Module level so the in-memory fallback's counts survive between requests in an isolate.
const fallback = limiter(undefined);

/** The Workers binding, or the fallback where there is none (next dev, tests, a refused plan). */
function rateLimit() {
  try {
    const binding = (getCloudflareContext().env as { MCP_LIMITER?: RateLimitBinding }).MCP_LIMITER;
    return binding ? limiter(binding) : fallback;
  } catch {
    return fallback;
  }
}

export function POST(request: Request) {
  return handleMcpPost(
    request,
    {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      allowedClientIds: parseAllowedClientIds(process.env.MCP_ALLOWED_CLIENT_IDS),
      confirmSecret: process.env.MCP_CONFIRM_SECRET,
    },
    { rateLimit: rateLimit() },
  );
}

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
