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
 *
 * Container tag: identifies the memory space to query. Set SUPERMEMORY_CONTAINER_TAG
 * in your .env to use a custom tag (defaults to "content-agent-user").
 */

import Supermemory from "supermemory";
import { env } from "../config/env.js";
import type { AgentStateType } from "../state/schema.js";

const hr = (label: string) =>
  console.log(`\n${"─".repeat(20)} ${label} ${"─".repeat(20)}`);

// The container tag scopes all memory reads/writes to a single user's memory space.
// Override via SUPERMEMORY_CONTAINER_TAG env var if you manage multiple users.
const CONTAINER_TAG =
  process.env["SUPERMEMORY_CONTAINER_TAG"] ?? "content-agent-user";

const PROFILE_QUERY =
  "tech interests current projects preferred tone of voice communication style writing personality";

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
   * @param state - Current agent state (unused at this node, profile is user-scoped)
   * @returns Partial state update with `personalContext`
   */
  return async function digitalTwinNode(
    _state: AgentStateType
  ): Promise<Partial<AgentStateType>> {
    console.log(
      `[Node 1] Digital Twin — querying Supermemory (container: ${CONTAINER_TAG})...`
    );

    const result = await client.profile({
      containerTag: CONTAINER_TAG,
      q: PROFILE_QUERY,
    });

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
    console.log(`Container : ${CONTAINER_TAG}`);
    console.log(`Static facts (${staticFacts.length}):`);
    staticFacts.forEach((f, i) => console.log(`  [${i + 1}] ${f}`));
    console.log(`Dynamic context (${dynamicContext.length}):`);
    dynamicContext.forEach((d, i) => console.log(`  [${i + 1}] ${d}`));
    console.log(`\nPersonal context passed downstream:\n${personalContext}`);
    hr("End Node 1");

    return { personalContext };
  };
}
