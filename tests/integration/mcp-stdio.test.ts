import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, describe, expect, it } from "vitest";
import { cleanupUsers, createTestUser } from "./helpers";

afterAll(cleanupUsers);

describe("LMS MCP server over stdio", () => {
  it("starts from the real entry point, lists its tools and answers whoami", async () => {
    const user = await createTestUser("employee");
    // Only these variables (plus the SDK's safe defaults like PATH) reach the child:
    // the secret key loaded from .env.local does not.
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", "mcp/src/index.ts"],
      env: {
        LMS_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
        LMS_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        LMS_EMAIL: user.email,
        LMS_PASSWORD: user.password,
      },
      stderr: "pipe",
    });
    const client = new Client({ name: "stdio-test", version: "0.0.0" });
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      expect(tools.length).toBe(9);
      const res = await client.callTool({ name: "whoami", arguments: {} });
      expect(res.isError).toBeFalsy();
      expect(res.structuredContent).toMatchObject({ id: user.id, email: user.email });
    } finally {
      await client.close();
    }
  });
});
