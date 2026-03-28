/**
 * Entry point for the content generation agent.
 *
 * Execution order:
 *   1. Load and validate environment variables (fails fast if any are missing)
 *   2. Initialize Apify MCP connection
 *   3. Build and invoke the LangGraph workflow
 *      - Supermemory is accessed inside the digitalTwin node via SDK (no MCP needed)
 *      - Apify tools are passed into the research node via MCP
 *   4. Log final output to console
 *   5. Close MCP connection in finally block (prevents orphan child processes)
 */

// Side-effect import: loads dotenv and validates all env vars before anything else runs
import "./config/env.js";

import { createMcpClient, getApifyTools } from "./mcp/client.js";
import { buildWorkflow } from "./agent/workflow.js";

async function main(): Promise<void> {
  const mcpClient = createMcpClient();

  try {
    console.log("Initializing Apify MCP connection (may take 10–30s on first run)...");
    await mcpClient.initializeConnections();

    const apifyTools = await getApifyTools(mcpClient);
    console.log(`Apify MCP ready — ${apifyTools.length} tool(s) loaded.`);

    const graph = buildWorkflow(apifyTools);

    console.log("\nRunning content generation agent...\n");
    // invoke({}) — all state fields have defaults defined in AgentState
    const finalState = await graph.invoke({});

    console.log("\n" + "=".repeat(60));
    console.log("FINAL OUTPUT");
    console.log("=".repeat(60));

    console.log("\n--- LinkedIn Post ---\n");
    console.log(finalState.finalLinkedinPost);

    console.log("\n--- X Post ---\n");
    console.log(finalState.finalXPost);

    console.log("\n--- Image ---");
    console.log(`Saved to: ${finalState.finalImageUrl}`);

    console.log("\n--- Stats ---");
    console.log(`Revision cycles: ${finalState.revisionCount}`);
    console.log(`Approved by reflection: ${String(finalState.isApproved)}`);
  } finally {
    console.log("\nClosing MCP connection...");
    await mcpClient.close();
    console.log("Done.");
  }
}

main().catch((error: unknown) => {
  console.error("Agent failed:", error);
  process.exit(1);
});
