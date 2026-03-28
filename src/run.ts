/**
 * Pipeline runner with JSON output.
 *
 * Runs the full content generation agent and writes a structured snapshot of
 * every stage to `output/run-<timestamp>.json`. This includes:
 *   - Personal context from Supermemory
 *   - Research brief (HN stories + LinkedIn posts combined)
 *   - Each draft and reflection cycle summary
 *   - Final polished posts and image path
 *   - Run metadata (timestamp, provider, revision count)
 *
 * Run: npm run pipeline
 * Output: output/run-<ISO-timestamp>.json
 */

// Side-effect import: loads dotenv and validates all env vars before anything else
import "./config/env.js";

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createMcpClient, getApifyTools } from "./mcp/client.js";
import { buildWorkflow } from "./agent/workflow.js";
import { env } from "./config/env.js";

const OUTPUT_DIR = "output";

/**
 * Builds the structured JSON snapshot from the final agent state.
 *
 * @param finalState - Completed LangGraph state after graph.invoke()
 * @param startedAt - ISO timestamp when the run began
 * @param durationMs - Total wall-clock time in milliseconds
 * @returns Plain object ready for JSON serialisation
 */
function buildSnapshot(
  finalState: Record<string, unknown>,
  startedAt: string,
  durationMs: number
): Record<string, unknown> {
  return {
    meta: {
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs,
      finalOutputProvider: env.FINAL_OUTPUT_PROVIDER,
      revisionCycles: finalState["revisionCount"],
      approvedByReflection: finalState["isApproved"],
    },
    personalContext: finalState["personalContext"],
    research: {
      // researchData is the agent's full brief combining HN stories + LinkedIn posts
      brief: finalState["researchData"],
    },
    drafts: {
      // The last draft produced before final polish (may have been revised multiple times)
      linkedin: finalState["linkedinDraft"],
      x: finalState["xDraft"],
    },
    reflection: {
      approved: finalState["isApproved"],
      lastFeedback: finalState["critiqueFeedback"],
    },
    finalOutput: {
      linkedinPost: finalState["finalLinkedinPost"],
      xPost: finalState["finalXPost"],
      imagePath: finalState["finalImageUrl"],
    },
  };
}

/**
 * Returns a filesystem-safe ISO timestamp string.
 * Replaces colons and dots with dashes to avoid path issues on all OSes.
 *
 * @returns e.g. "2026-03-28T14-30-00-000Z"
 */
function safeTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const mcpClient = createMcpClient();

  try {
    console.log("Initializing Apify MCP connection (may take 10–30s on first run)...");
    await mcpClient.initializeConnections();

    const apifyTools = await getApifyTools(mcpClient);
    console.log(`Apify MCP ready — ${apifyTools.length} tool(s) loaded.`);

    const graph = buildWorkflow(apifyTools);

    console.log("\nRunning content generation agent...\n");
    const finalState = await graph.invoke({});

    // Build and persist the output JSON
    const snapshot = buildSnapshot(
      finalState as Record<string, unknown>,
      startedAt,
      Date.now() - startMs
    );

    await mkdir(OUTPUT_DIR, { recursive: true });

    const filename = `run-${safeTimestamp()}.json`;
    const outputPath = join(OUTPUT_DIR, filename);
    await writeFile(outputPath, JSON.stringify(snapshot, null, 2), "utf-8");

    // Print summary to console
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
    console.log(`Revision cycles : ${finalState.revisionCount}`);
    console.log(`Approved        : ${String(finalState.isApproved)}`);
    console.log(`Provider        : ${env.FINAL_OUTPUT_PROVIDER}`);
    console.log(`Duration        : ${((Date.now() - startMs) / 1000).toFixed(1)}s`);

    console.log(`\nJSON snapshot   : ${outputPath}`);
  } finally {
    console.log("\nClosing MCP connection...");
    await mcpClient.close();
    console.log("Done.");
  }
}

main().catch((error: unknown) => {
  console.error("Pipeline failed:", error);
  process.exit(1);
});
