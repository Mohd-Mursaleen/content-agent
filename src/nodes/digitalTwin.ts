/**
 * Node 1: Digital Twin
 *
 * Uses the Supermemory SDK directly (not via MCP) to retrieve the user's
 * personal memory profile. The SDK's `profile()` method returns two structured
 * arrays:
 *   - `profile.static`  — long-term facts (interests, expertise, communication style)
 *   - `profile.dynamic` — recent activity and current focus
 *
 * No LLM is needed here — Supermemory handles memory extraction and profiling
 * server-side. The result is formatted into a context string for downstream nodes.
 */

import Supermemory from "supermemory";
import { env } from "../config/env.js";
import type { AgentStateType } from "../state/schema.js";

const hr = (label: string) =>
  console.log(`\n${"─".repeat(20)} ${label} ${"─".repeat(20)}`);

/**
 * Builds a Supermemory profile query from the research brief.
 * Uses the actual topics from today's research so the profile response surfaces
 * opinions and past thoughts that are directly relevant to the content being drafted.
 *
 * @param researchData - Research brief from the Research node
 * @returns Supermemory query string
 */
function buildProfileQuery(researchData: string): string {
  // Use the first 600 chars of the brief as topic context — enough for semantic
  // relevance without overwhelming the query with noise.
  const topicContext = researchData.slice(0, 600).trim();
  return (
    `Based on this research context: ${topicContext}\n\n` +
    `Retrieve my personal opinions, past experiences, and perspectives on these topics. ` +
    `Also include my tech interests, current projects, preferred writing tone, ` +
    `communication style, and writing personality.`
  );
}

/**
 * Factory that creates the Digital Twin node.
 * The Supermemory client is instantiated once and reused across invocations.
 *
 * @returns LangGraph node function
 */
export function createDigitalTwinNode() {
  // Reads SUPERMEMORY_API_KEY from env by default if apiKey is not passed explicitly
  const client = new Supermemory({ apiKey: env.SUPERMEMORY_API_KEY });

  /**
   * Fetches the user's memory profile and formats it into `personalContext`.
   *
   * @param state - Current agent state; `researchData` is used to build the Supermemory query
   * @returns Partial state update with `personalContext`
   */
  return async function digitalTwinNode(
    state: AgentStateType
  ): Promise<Partial<AgentStateType>> {
    console.log("[Node 1] Digital Twin — building query from research topics...");
    const query = buildProfileQuery(state.researchData);

    // containerTag is required by the Supermemory API (undefined → 400).
    // Set SUPERMEMORY_CONTAINER_TAG in .env to scope to your memory space.
    // Leave it unset to use an empty string which queries across all containers.
    const containerTag = process.env["SUPERMEMORY_CONTAINER_TAG"] ?? "";

    console.log(`[Node 1] Querying Supermemory (containerTag: "${containerTag || "all"}")...`);
    const result = await client.profile({ containerTag, q: query });

    const staticFacts = result.profile.static ?? [];
    const dynamicContext = result.profile.dynamic ?? [];

    // Build a readable context string from the profile arrays
    const sections: string[] = [];

    if (staticFacts.length > 0) {
      sections.push(
        `Background & Interests:\n${staticFacts.map((f) => `- ${f}`).join("\n")}`
      );
    }

    if (dynamicContext.length > 0) {
      sections.push(
        `Current Focus & Style:\n${dynamicContext.map((d) => `- ${d}`).join("\n")}`
      );
    }

    const personalContext =
      sections.length > 0
        ? sections.join("\n\n")
        : "No personal context stored yet. Write in a direct, first-person, conversational tone.";

    hr("Node 1 — Supermemory Profile");
    console.log(`Container tag : "${containerTag || "all"}"`);
    console.log(`Static facts (${staticFacts.length}):`);
    staticFacts.forEach((f, i) => console.log(`  [${i + 1}] ${f}`));
    console.log(`Dynamic context (${dynamicContext.length}):`);
    dynamicContext.forEach((d, i) => console.log(`  [${i + 1}] ${d}`));
    console.log(`\nPersonal context passed downstream:\n${personalContext}`);
    hr("End Node 1");

    return { personalContext };
  };
}
