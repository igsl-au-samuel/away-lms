import { protectedResourceMetadata } from "../../../server/mcp/metadata";

export function GET(request: Request) {
  return protectedResourceMetadata(new URL(request.url).origin, process.env.NEXT_PUBLIC_SUPABASE_URL!);
}
