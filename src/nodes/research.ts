/**
 * Node 2: Research
 *
 * Two-step research pipeline:
 *   1. Natively fetches the top 3 Hacker News stories via the Firebase API.
 *   2. Uses a ReAct agent (DeepSeek + Apify MCP tools) to run the
 *      `harvestapi/linkedin-post-search` actor and retrieve relevant LinkedIn posts.
 *
 * The LLM summarizes both sources into a single `researchData` string.
 */

import { ChatDeepSeek } from "@langchain/deepseek";
import { HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { env } from "../config/env.js";
import type { AgentStateType } from "../state/schema.js";

const HN_TOP_STORIES_URL = "https://hacker-news.firebaseio.com/v0/topstories.json";
const HN_ITEM_URL = (id: number) =>
  `https://hacker-news.firebaseio.com/v0/item/${id}.json`;

interface HNStory {
  id: number;
  title: string;
  url?: string;
  score: number;
  by: string;
}

/**
 * Fetches the top 3 Hacker News stories and formats them as a readable string.
 *
 * @returns Formatted multi-line string of the top 3 HN stories
 * @throws Error if the HN API request fails
 */
async function fetchTopHackerNewsStories(): Promise<string> {
  const idsRes = await fetch(HN_TOP_STORIES_URL);
  if (!idsRes.ok) {
    throw new Error(`HN API failed: ${idsRes.status} ${idsRes.statusText}`);
  }

  const ids: number[] = (await idsRes.json()) as number[];
  const top3 = ids.slice(0, 3);

  const stories = await Promise.all(
    top3.map(async (id) => {
      const res = await fetch(HN_ITEM_URL(id));
      if (!res.ok) {
        throw new Error(`HN item ${id} fetch failed: ${res.status}`);
      }
      return (await res.json()) as HNStory;
    })
  );

  return stories
    .map(
      (s) =>
        `- "${s.title}" by ${s.by} (score: ${s.score})${s.url ? ` — ${s.url}` : ""}`
    )
    .join("\n");
}

/**
 * Normalizes ToolMessage content from MCP's array-of-content-blocks format to a
 * plain string, which DeepSeek's OpenAI-compatible API requires.
 *
 * MCP tools return: [{type: "text", text: "..."}]
 * DeepSeek expects:  "..."
 *
 * This runs as a messageModifier before every LLM call in the ReAct loop,
 * acting as a safety net on top of the useStandardContentBlocks: false client setting.
 *
 * @param messages - The full message list about to be sent to the LLM
 * @returns Messages with all ToolMessage content coerced to strings
 */
function normalizeMcpToolMessages(messages: BaseMessage[]): BaseMessage[] {
  return messages.map((msg) => {
    if (msg instanceof ToolMessage && Array.isArray(msg.content)) {
      const text = (msg.content as Array<{ type?: string; text?: string }>)
        .filter((block) => block.type === "text" && typeof block.text === "string")
        .map((block) => block.text as string)
        .join("\n");

      return new ToolMessage({
        content: text || JSON.stringify(msg.content),
        tool_call_id: msg.tool_call_id,
        name: msg.name,
      });
    }
    return msg;
  });
}

/**
 * Factory that creates the Research node with bound Apify tools.
 *
 * @param apifyTools - LangChain tools from the Apify MCP server
 * @returns LangGraph node function
 */
export function createResearchNode(apifyTools: StructuredToolInterface[]) {
  const llm = new ChatDeepSeek({
    model: "deepseek-chat",
    apiKey: env.DEEPSEEK_API_KEY,
    temperature: 0.2,
  });

  const agent = createReactAgent({
    llm,
    tools: apifyTools,
    // Normalize MCP tool result content from arrays to strings before each LLM call.
    // DeepSeek requires tool message content to be a plain string.
    messageModifier: normalizeMcpToolMessages,
  });

  /**
   * Fetches HN stories and LinkedIn posts, then summarizes them into `researchData`.
   *
   * @param state - Current agent state
   * @returns Partial state update with `researchData`
   */
  return async function researchNode(
    state: AgentStateType
  ): Promise<Partial<AgentStateType>> {
    console.log("[Node 2] Research — fetching Hacker News stories...");
    const hnStories = await fetchTopHackerNewsStories();
    console.log("[Node 2] HN stories fetched. Querying Apify LinkedIn search...");

    const result = await agent.invoke({
      messages: [
        new SystemMessage(
          "You are a research agent. Use the Apify tools available to you to search LinkedIn posts."
        ),
        new HumanMessage(
          `Today's top Hacker News stories:\n${hnStories}\n\n` +
            `Now use the Apify tool to call the actor "harvestapi/linkedin-post-search" ` +
            `with the following input JSON:\n` +
            `{"queries": ["AI Agents", "Node.js"], "postedLimit": "week", "sortBy": "relevance", "maxPosts": 3}\n\n` +
            `After getting the LinkedIn results, write a concise research brief that summarizes ` +
            `key themes and insights from BOTH the Hacker News stories AND the LinkedIn posts.`
        ),
      ],
    });

    const lastMessage = result.messages[result.messages.length - 1];
    const researchData =
      typeof lastMessage.content === "string"
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);

    console.log("[Node 2] Research complete.");
    return { researchData };
  };
}
