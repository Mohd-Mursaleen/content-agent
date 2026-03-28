/**
 * Node 4: Reflection
 *
 * Acts as a strict editor that reviews the current drafts against the humanization
 * rules and the author's personal context. Returns a structured verdict.
 *
 * Increments `revisionCount` on every pass. The conditional edge in the workflow
 * uses `isApproved` and `revisionCount` to decide whether to loop back to drafting
 * or proceed to final output.
 */

import { ChatDeepSeek } from "@langchain/deepseek";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { env } from "../config/env.js";
import { ReflectionOutputSchema } from "../state/schema.js";
import type { AgentStateType } from "../state/schema.js";

const REFLECTION_SYSTEM_PROMPT = `You are a strict editorial critic reviewing social media content for authenticity.

Evaluate both drafts against ALL of the following criteria:
1. No em dashes (—) anywhere in the text.
2. No banned words: "delve", "leverage", "tapestry", "paramount", "in the realm of", "testament", "transformative", "groundbreaking", "game-changer", "revolutionary", "synergy", "ecosystem", "seamlessly", "cutting-edge".
3. First-person voice throughout ("I" or "we").
4. Sentence variance — mix of short and long sentences. No wall-of-text paragraphs.
5. No generic openers (e.g., "In today's world...", "As we navigate...", "It's no secret that...").
6. LinkedIn post: 150 to 300 words, strong opening hook, max 3 hashtags.
7. X post: strictly under 280 characters.
8. Tone matches the author's personal context provided.

Set passed=true ONLY if every single criterion is met across both drafts.
In feedback, be specific — name the exact violation and the sentence that caused it.`;

/**
 * Factory that creates the Reflection node.
 *
 * @returns LangGraph node function
 */
export function createReflectionNode() {
  const llm = new ChatDeepSeek({
    model: "deepseek-chat",
    apiKey: env.DEEPSEEK_API_KEY,
    // Low temperature for deterministic, consistent critique
    temperature: 0.1,
  });

  const structuredLlm = llm.withStructuredOutput(ReflectionOutputSchema, {
    name: "evaluate_drafts",
  });

  /**
   * Critiques the current drafts and returns approval status and feedback.
   * Always increments `revisionCount` regardless of the verdict.
   *
   * @param state - Current agent state
   * @returns Partial state update with `isApproved`, `critiqueFeedback`, and incremented `revisionCount`
   */
  return async function reflectionNode(
    state: AgentStateType
  ): Promise<Partial<AgentStateType>> {
    console.log(
      `[Node 4] Reflection — evaluating drafts (cycle ${state.revisionCount + 1})...`
    );

    const result = await structuredLlm.invoke([
      new SystemMessage(REFLECTION_SYSTEM_PROMPT),
      new HumanMessage(
        `AUTHOR'S PERSONAL CONTEXT:\n${state.personalContext}\n\n` +
          `LINKEDIN DRAFT:\n${state.linkedinDraft}\n\n` +
          `X DRAFT:\n${state.xDraft}`
      ),
    ]);

    const verdict = result.passed ? "APPROVED" : "REJECTED";
    console.log(`[Node 4] Verdict: ${verdict}. Feedback: ${result.feedback}`);

    return {
      isApproved: result.passed,
      critiqueFeedback: result.feedback,
      // revisionCount increments here — the conditional edge reads this updated value
      revisionCount: state.revisionCount + 1,
    };
  };
}
