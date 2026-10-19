/** RFC 9728 protected-resource metadata for /mcp (spec Decision 1). */
export function protectedResourceMetadata(origin: string, supabaseUrl: string): Response {
  const body = {
    resource: `${origin}/mcp`,
    authorization_servers: [`${supabaseUrl.replace(/\/+$/, "")}/auth/v1`],
    bearer_methods_supported: ["header"],
  };
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
  });
}
