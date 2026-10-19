import { parseAllowedClientIds } from "../../server/mcp/auth";
import { handleMcpPost, methodNotAllowed } from "../../server/mcp/handler";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleMcpPost(request, {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    allowedClientIds: parseAllowedClientIds(process.env.MCP_ALLOWED_CLIENT_IDS),
    confirmSecret: process.env.MCP_CONFIRM_SECRET,
  });
}

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
