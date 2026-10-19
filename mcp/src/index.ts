/**
 * Away LMS MCP server over stdio. Acts as one real user (email + password sign-in), so RLS
 * and the RPCs stay the only authorization. stdout carries the protocol: log to stderr only.
 * Usage: npm run mcp   (env: see mcp/README.md)
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createSessionProvider, readEnv } from "./session";
import { createLmsServer } from "../../src/server/mcp/tools";

async function main() {
  const env = readEnv();
  const server = createLmsServer(createSessionProvider(env));
  await server.connect(new StdioServerTransport());
  console.error(`[lms] ready as ${env.LMS_EMAIL} on ${env.LMS_SUPABASE_URL}`);
}

main().catch((err) => {
  console.error(`[lms] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
