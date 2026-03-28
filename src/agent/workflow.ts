/**
 * LangGraph workflow builder.
 *
 * Assembles the StateGraph with all 5 nodes and their edges.
 *
 * Node responsibilities:
 *   digitalTwin  — Supermemory SDK profile fetch (no MCP, no LLM)
 *   research     — HN native fetch + Apify MCP actor call via DeepSeek ReAct agent
 *   drafting     — DeepSeek structured output → linkedinDraft + xDraft
 *   reflection   — DeepSeek structured output → isApproved + critiqueFeedback
 *   finalOutput  — Gemini text polish + Gemini image generation
 *
 * Conditional edge after reflection:
 *   → finalOutput  if isApproved OR revisionCount >= 3
 *   → drafting     otherwise (passes critique feedback through state)
 */

import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState } from "../state/schema.js";
import type { AgentStateType } from "../state/schema.js";
import { createDigitalTwinNode } from "../nodes/digitalTwin.js";
import { createResearchNode } from "../nodes/research.js";
import { createDraftingNode } from "../nodes/drafting.js";
import { createReflectionNode } from "../nodes/reflection.js";
import { createFinalOutputNode } from "../nodes/finalOutput.js";
import type { StructuredToolInterface } from "@langchain/core/tools";

/**
 * Conditional router executed after the Reflection node.
 * `revisionCount` has already been incremented by the reflection node before this runs.
 *
 * @param state - Current agent state
 * @returns Node name to route to
 */
function routeAfterReflection(
  state: AgentStateType
): "finalOutput" | "drafting" {
  if (state.isApproved || state.revisionCount >= 3) {
    if (!state.isApproved) {
      console.log(
        `[Router] Max revisions (${state.revisionCount}/3) reached — routing to final output.`
      );
    } else {
      console.log("[Router] Drafts approved — routing to final output.");
    }
    return "finalOutput";
  }

  console.log(
    `[Router] Rejected (revision ${state.revisionCount}/3) — looping back to drafting.`
  );
  return "drafting";
}

/**
 * Builds and compiles the content generation StateGraph.
 *
 * Graph flow:
 *   START → research → digitalTwin → drafting → reflection
 *   reflection → (conditional) → finalOutput → END
 *                             ↘ → drafting (loop, max 3 revision cycles)
 *
 * Research runs first so digitalTwin can build a context-aware Supermemory
 * query from the actual topics found in HN + LinkedIn data.
 *
 * @param apifyTools - LangChain tools from the Apify MCP server
 * @returns Compiled LangGraph application ready to invoke
 */
export function buildWorkflow(apifyTools: StructuredToolInterface[]) {
  const workflow = new StateGraph(AgentState)
    .addNode("digitalTwin", createDigitalTwinNode())
    .addNode("research", createResearchNode(apifyTools))
    .addNode("drafting", createDraftingNode())
    .addNode("reflection", createReflectionNode())
    .addNode("finalOutput", createFinalOutputNode())
    .addEdge(START, "research")
    .addEdge("research", "digitalTwin")
    .addEdge("digitalTwin", "drafting")
    .addEdge("drafting", "reflection")
    .addConditionalEdges("reflection", routeAfterReflection)
    .addEdge("finalOutput", END);

  return workflow.compile();
}
