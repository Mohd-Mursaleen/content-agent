/**
 * MCP client service — Apify only.
 *
 * Supermemory is accessed directly via the `supermemory` npm SDK (see digitalTwin node).
 * Apify is accessed via MCP because it exposes a dynamic actor catalog that maps
 * naturally to MCP tools.
 *
 * Lifecycle:
 *   await client.initializeConnections()  ← call once at startup
 *   await client.close()                  ← call in finally block
 *
 * PATH must be forwarded so that `npx` can find node/npm binaries
 * when spawned as a child process.
 */

import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { env } from "../config/env.js";
import type { StructuredToolInterface } from "@langchain/core/tools";

/**
 * Creates a configured MultiServerMCPClient for the Apify MCP server.
 * Does not connect — call `initializeConnections()` before using tools.
 *
 * @returns Configured (not yet connected) MCP client
 */
export function createMcpClient(): MultiServerMCPClient {
  return new MultiServerMCPClient({
    // useStandardContentBlocks: false forces the MCP adapter to convert tool result
    // content from MCP's [{type:"text", text:"..."}] array format into a plain string.
    // Without this, DeepSeek's API (which requires tool message content to be a string)
    // rejects the request with "invalid type: sequence, expected a string".
    useStandardContentBlocks: false,
    mcpServers: {
      apify: {
        transport: "stdio",
        command: "npx",
        args: ["-y", "@apify/actors-mcp-server"],
        env: {
          APIFY_TOKEN: env.APIFY_TOKEN,
          // PATH must be forwarded so npx can find binaries in the child process
          PATH: process.env["PATH"] ?? "",
        },
        stderr: "pipe",
      },
    },
  });
}

/**
 * Returns LangChain-compatible tools from the Apify MCP server.
 *
 * @param client - An initialized (connected) MultiServerMCPClient
 * @returns Array of structured tools for Apify actor calls
 */
export async function getApifyTools(
  client: MultiServerMCPClient
): Promise<StructuredToolInterface[]> {
  return client.getTools("apify");
}
