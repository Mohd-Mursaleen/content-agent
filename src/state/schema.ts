/**
 * LangGraph state schema and Zod schemas for structured LLM output.
 *
 * All state fields use a last-write-wins reducer — each node returns only the
 * fields it modifies, and LangGraph merges them into the running state.
 */

import { Annotation } from "@langchain/langgraph";
import { z } from "zod";

/** Last-write-wins string field */
const stringField = (defaultVal = "") =>
  Annotation<string>({
    reducer: (_old: string, newVal: string) => newVal,
    default: () => defaultVal,
  });

/** Last-write-wins number field */
const numberField = (defaultVal = 0) =>
  Annotation<number>({
    reducer: (_old: number, newVal: number) => newVal,
    default: () => defaultVal,
  });

/** Last-write-wins boolean field */
const booleanField = (defaultVal = false) =>
  Annotation<boolean>({
    reducer: (_old: boolean, newVal: boolean) => newVal,
    default: () => defaultVal,
  });

/**
 * Root state definition for the content generation agent graph.
 * Each field represents a discrete piece of state passed between nodes.
 */
export const AgentState = Annotation.Root({
  /** Digital Twin data retrieved from Supermemory — tech interests, tone, current projects */
  personalContext: stringField(),

  /** Aggregated research from Hacker News and Apify LinkedIn search */
  researchData: stringField(),

  /** Current LinkedIn post draft (no character limit) */
  linkedinDraft: stringField(),

  /** Current X/Twitter post draft (max 280 characters) */
  xDraft: stringField(),

  /** Number of completed reflection cycles. Incremented inside the reflection node. */
  revisionCount: numberField(0),

  /** Structured critique feedback from the reflection node for revision guidance */
  critiqueFeedback: stringField(),

  /** Whether the reflection node approved the current drafts */
  isApproved: booleanField(false),

  /** File path where the generated post image was saved */
  finalImageUrl: stringField(),

  /** Final polished LinkedIn post ready for publishing */
  finalLinkedinPost: stringField(),

  /** Final polished X post ready for publishing */
  finalXPost: stringField(),
});

/** TypeScript type of the full agent state */
export type AgentStateType = typeof AgentState.State;

// ---------------------------------------------------------------------------
// Zod schemas for structured LLM output
// ---------------------------------------------------------------------------

/**
 * Output schema for the Drafting node.
 * Used with `llm.withStructuredOutput()` to get typed drafts from DeepSeek.
 */
export const DraftOutputSchema = z.object({
  linkedinDraft: z
    .string()
    .describe("Complete LinkedIn post draft with no character limit"),
  xDraft: z
    .string()
    .max(280)
    .describe("X/Twitter post draft, strictly under 280 characters"),
});

export type DraftOutput = z.infer<typeof DraftOutputSchema>;

/**
 * Output schema for the Reflection node.
 * Used with `llm.withStructuredOutput()` to get a structured critique from DeepSeek.
 */
export const ReflectionOutputSchema = z.object({
  passed: z
    .boolean()
    .describe(
      "True only if ALL humanization rules are satisfied across both drafts"
    ),
  feedback: z
    .string()
    .describe(
      "Detailed critique specifying exactly which rules were violated and how to fix them"
    ),
});

export type ReflectionOutput = z.infer<typeof ReflectionOutputSchema>;
