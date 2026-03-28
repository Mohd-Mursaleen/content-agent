/**
 * Node 3: Drafting
 *
 * Generates LinkedIn and X drafts using DeepSeek with structured output.
 * On revision passes (revisionCount > 0), the critique feedback from the
 * Reflection node is injected into the prompt for targeted improvement.
 *
 * Strict humanization rules are enforced in the system prompt to prevent
 * AI-sounding language patterns.
 */

import { ChatDeepSeek } from "@langchain/deepseek";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { env } from "../config/env.js";
import { DraftOutputSchema } from "../state/schema.js";
import type { AgentStateType } from "../state/schema.js";

const hr = (label: string) =>
  console.log(`\n${"─".repeat(20)} ${label} ${"─".repeat(20)}`);

const HUMANIZATION_SYSTEM_PROMPT = `You are my digital twin — a ghostwriter who writes exactly like me.

Write two posts based on the provided research data, aligned strictly with my personal context.

STRICT HUMANIZATION RULES (all must be followed):
1. NO Em Dashes (—). Use commas, periods, or line breaks instead.
2. Sentence Variance: Mix short punchy sentences (under 5 words) with longer conversational ones.
3. First-Person Voice: Use "I" or "we" based on my personal context.
4. Direct & Concrete: Open with a direct statement or observation. No generic openers like "In today's world..." or "As we navigate...".
5. BANNED WORDS — never use: "delve", "leverage", "tapestry", "paramount", "in the realm of", "testament", "transformative", "groundbreaking", "game-changer", "revolutionary", "synergy", "ecosystem", "seamlessly", "cutting-edge".
6. Tone: Match exactly the tone defined in my personal context.
7. LinkedIn: 150 to 300 words. Strong hook on the first line. Max 3 hashtags at the end.
8. X post: Strictly under 280 characters. Punchy, direct, with a hook. Include a link placeholder [LINK] if relevant.`;

/**
 * Factory that creates the Drafting node.
 *
 * @returns LangGraph node function
 */
export function createDraftingNode() {
  const llm = new ChatDeepSeek({
    model: "deepseek-chat",
    apiKey: env.DEEPSEEK_API_KEY,
    temperature: 0.7,
  });

  // withStructuredOutput converts DraftOutputSchema to a named function call.
  // The `name` field is required for DeepSeek's OpenAI-compatible function calling API.
  const structuredLlm = llm.withStructuredOutput(DraftOutputSchema, {
    name: "generate_drafts",
  });

  /**
   * Generates LinkedIn and X drafts, incorporating critique feedback on revision passes.
   *
   * @param state - Current agent state
   * @returns Partial state update with `linkedinDraft` and `xDraft`
   */
  return async function draftingNode(
    state: AgentStateType
  ): Promise<Partial<AgentStateType>> {
    const isRevision = state.revisionCount > 0;
    console.log(
      `[Node 3] Drafting — ${isRevision ? `revision pass #${state.revisionCount}` : "initial draft"}...`
    );

    const revisionSection =
      isRevision && state.critiqueFeedback
        ? `\n\nPREVIOUS DRAFTS WERE REJECTED. You must revise based on this critique:\n${state.critiqueFeedback}\n\nFix every point raised above.`
        : "";

    const result = await structuredLlm.invoke([
      new SystemMessage(HUMANIZATION_SYSTEM_PROMPT),
      new HumanMessage(
        `MY PERSONAL CONTEXT:\n${state.personalContext}\n\n` +
          `RESEARCH DATA:\n${state.researchData}` +
          revisionSection
      ),
    ]);

    hr(`Node 3 — LinkedIn Draft (${result.linkedinDraft.split(/\s+/).length} words)`);
    console.log(result.linkedinDraft);
    hr(`Node 3 — X Draft (${result.xDraft.length} chars)`);
    console.log(result.xDraft);
    hr("End Node 3");

    return {
      linkedinDraft: result.linkedinDraft,
      xDraft: result.xDraft,
    };
  };
}
