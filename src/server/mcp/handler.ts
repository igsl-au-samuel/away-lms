/**
 * The remote MCP endpoint, as a plain Request -> Response function so it can be tested without
 * Next (spec Decision 1). `src/app/mcp/route.ts` supplies the environment.
 *
 * Order matters: the bearer checks run before any Supabase client exists, so a bad token never
 * reaches the database. Logs carry the tool name, user id, outcome and duration, never the token,
 * arguments or response bodies.
 */
import { createClient } from "@supabase/supabase-js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Database } from "../../lib/database.types";
import { authenticate, type GetClaims } from "./auth";
import { isPrivilegedKey, loadViewer, type Db } from "./session";
import { createLmsServer } from "./tools";

export type McpEnv = {
  supabaseUrl: string | undefined;
  publishableKey: string | undefined;
  allowedClientIds: readonly string[];
  confirmSecret: string | undefined;
};

export type McpDeps = {
  /** Builds the per-request client. Tests replace it with a fake that throws if used. */
  makeClient?: (url: string, key: string, token: string) => Db;
  log?: (line: string) => void;
};

const JSON_HEADERS = { "Content-Type": "application/json" };

export function methodNotAllowed(): Response {
  return new Response(JSON.stringify({ error: "method_not_allowed" }), {
    status: 405,
    headers: { ...JSON_HEADERS, Allow: "POST" },
  });
}

function serverError(): Response {
  return new Response(JSON.stringify({ error: "server_error" }), { status: 500, headers: JSON_HEADERS });
}

function defaultClient(url: string, key: string, token: string): Db {
  return createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Tool name of a `tools/call` request, read from a clone so the transport still gets the body. */
async function calledTool(request: Request): Promise<string | null> {
  try {
    const body: unknown = await request.clone().json();
    const msg = Array.isArray(body) ? body[0] : body;
    if (msg?.method !== "tools/call") return null;
    return typeof msg.params?.name === "string" ? msg.params.name : null;
  } catch {
    return null;
  }
}

async function outcomeOf(response: Response): Promise<string> {
  if (response.status !== 200) return `http_${response.status}`;
  try {
    const body = (await response.clone().json()) as { result?: { isError?: boolean }; error?: unknown };
    return body.error || body.result?.isError ? "error" : "ok";
  } catch {
    return "ok";
  }
}

export async function handleMcpPost(request: Request, env: McpEnv, deps: McpDeps = {}): Promise<Response> {
  const { makeClient = defaultClient, log = (line) => console.log(line) } = deps;
  const { supabaseUrl, publishableKey, allowedClientIds, confirmSecret } = env;

  // Misconfiguration is ours to fix, so it is a 500 and never a hint to the caller. The secret-key
  // refusal mirrors the local server: this route must never hold a key that bypasses RLS.
  if (!supabaseUrl || !publishableKey || !confirmSecret || isPrivilegedKey(publishableKey)) {
    console.error("[mcp] not configured");
    return serverError();
  }

  // A throwaway client only verifies the signature (JWKS) and expiry; it never queries tables.
  // Built lazily so a request with no bearer token never touches Supabase at all.
  const getClaims: GetClaims = (t) => makeClient(supabaseUrl, publishableKey, "").auth.getClaims(t);
  const auth = await authenticate(request, { supabaseUrl, allowedClientIds, getClaims });
  if (auth instanceof Response) return auth;

  const started = Date.now();
  const tool = await calledTool(request);
  let response: Response;
  try {
    const db = makeClient(supabaseUrl, publishableKey, auth.token);
    // A null profile surfaces as the tool error `not_allowed` (see tools.ts `run`), not a 401.
    const server = createLmsServer(async () => ({ db, me: await loadViewer(db) }), {
      requireConfirmation: true,
      confirmSecret,
    });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    response = await transport.handleRequest(request);
  } catch {
    console.error("[mcp] request failed");
    response = serverError();
  }

  log(
    `[mcp] user=${auth.claims.sub} tool=${tool ?? "-"} outcome=${await outcomeOf(response)} ms=${Date.now() - started}`,
  );
  return response;
}
