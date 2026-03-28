/**
 * Integration test runner for the content generation agent.
 *
 * Tests are organized into sections. Each section prints a clear PASS/FAIL banner
 * with timing and full error details on failure.
 *
 * Run modes (via npm scripts):
 *   npm run test:env       — env vars + imports only (fast, no API calls)
 *   npm run test:memory    — Supermemory SDK profile fetch
 *   npm run test:mcp       — Apify MCP connectivity
 *   npm run test:hn        — Hacker News fetch (no API key needed)
 *   npm run test:draft     — Drafting + Reflection nodes with fixture state
 *   npm run test:pipeline  — Full end-to-end graph run
 *   npm run test           — All sections in sequence
 */

// Must be first — validates env vars before any other import
import "./config/env.js";

import { env } from "./config/env.js";
import { createMcpClient, getApifyTools } from "./mcp/client.js";
import { createDigitalTwinNode } from "./nodes/digitalTwin.js";
import { createDraftingNode } from "./nodes/drafting.js";
import { createReflectionNode } from "./nodes/reflection.js";
import { buildWorkflow } from "./agent/workflow.js";
import type { AgentStateType } from "./state/schema.js";

// ---------------------------------------------------------------------------
// ANSI color helpers
// ---------------------------------------------------------------------------
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

function banner(title: string): void {
  const line = "─".repeat(60);
  console.log(`\n${c.cyan}${c.bold}${line}${c.reset}`);
  console.log(`${c.cyan}${c.bold}  ${title}${c.reset}`);
  console.log(`${c.cyan}${c.bold}${line}${c.reset}`);
}

function pass(label: string, ms: number): void {
  console.log(
    `${c.green}${c.bold}  ✓ PASS${c.reset} ${label} ${c.dim}(${ms}ms)${c.reset}`
  );
}

function fail(label: string, ms: number, error: unknown): void {
  console.log(
    `${c.red}${c.bold}  ✗ FAIL${c.reset} ${label} ${c.dim}(${ms}ms)${c.reset}`
  );
  if (error instanceof Error) {
    console.log(`${c.red}         ${error.message}${c.reset}`);
    if (error.stack) {
      error.stack
        .split("\n")
        .slice(1, 5)
        .forEach((l) => console.log(`${c.dim}         ${l.trim()}${c.reset}`));
    }
  } else {
    console.log(`${c.red}         ${String(error)}${c.reset}`);
  }
}

function info(msg: string): void {
  console.log(`${c.dim}         ${msg}${c.reset}`);
}

/** Wraps a test case with timing, pass/fail output, and error capture. */
async function run(label: string, fn: () => Promise<void>): Promise<boolean> {
  const start = Date.now();
  try {
    await fn();
    pass(label, Date.now() - start);
    return true;
  } catch (err) {
    fail(label, Date.now() - start, err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Fixture state for unit-style tests (no MCP or Supermemory needed)
// ---------------------------------------------------------------------------
const FIXTURE_STATE: AgentStateType = {
  personalContext:
    "I am a software engineer focused on AI, developer tools, and Node.js. " +
    "I write in a direct, first-person tone. No fluff. Concise and opinionated.",
  researchData:
    "- HN: 'Why LLM agents keep failing at multi-step tasks' (score: 842)\n" +
    "- HN: 'Bun 2.0 released — 3x faster than Node' (score: 610)\n" +
    "- LinkedIn: AI agent orchestration is moving from PoC to production this year.\n" +
    "- LinkedIn: Node.js 22 LTS signals the ecosystem has matured for enterprise use.",
  linkedinDraft: "",
  xDraft: "",
  revisionCount: 0,
  critiqueFeedback: "",
  isApproved: false,
  finalImageUrl: "",
  finalLinkedinPost: "",
  finalXPost: "",
};

// ---------------------------------------------------------------------------
// Section 1 — Environment & Imports
// ---------------------------------------------------------------------------
async function testEnv(): Promise<boolean> {
  banner("SECTION 1 — Environment & Imports");
  let ok = true;

  ok =
    (await run("DEEPSEEK_API_KEY is set", async () => {
      if (!env.DEEPSEEK_API_KEY) throw new Error("empty");
      info(`Starts with: ${env.DEEPSEEK_API_KEY.slice(0, 6)}...`);
    })) && ok;

  ok =
    (await run("OPENAI_API_KEY is set", async () => {
      if (!env.OPENAI_API_KEY) throw new Error("empty");
      info(`Starts with: ${env.OPENAI_API_KEY.slice(0, 6)}...`);
    })) && ok;

  ok =
    (await run("SUPERMEMORY_API_KEY is set", async () => {
      if (!env.SUPERMEMORY_API_KEY) throw new Error("empty");
      info(`Starts with: ${env.SUPERMEMORY_API_KEY.slice(0, 6)}...`);
    })) && ok;

  ok =
    (await run("APIFY_TOKEN is set", async () => {
      if (!env.APIFY_TOKEN) throw new Error("empty");
      info(`Starts with: ${env.APIFY_TOKEN.slice(0, 6)}...`);
    })) && ok;

  ok =
    (await run("Critical npm imports resolve without error", async () => {
      await import("@langchain/langgraph");
      await import("@langchain/deepseek");
      await import("@google/genai");
      await import("@langchain/mcp-adapters");
      await import("supermemory");
      info("All imports OK.");
    })) && ok;

  return ok;
}

// ---------------------------------------------------------------------------
// Section 2 — Supermemory SDK
// ---------------------------------------------------------------------------
async function testSupermemory(): Promise<boolean> {
  banner("SECTION 2 — Supermemory SDK (Direct API)");
  let ok = true;

  ok =
    (await run("profile() call succeeds and returns arrays", async () => {
      const digitalTwinNode = createDigitalTwinNode();
      const result = await digitalTwinNode(FIXTURE_STATE);

      if (result.personalContext === undefined) {
        throw new Error("personalContext is undefined");
      }
      if (typeof result.personalContext !== "string") {
        throw new Error("personalContext is not a string");
      }

      info(`personalContext (${result.personalContext.length} chars):`);
      info(result.personalContext.slice(0, 200) + "...");
    })) && ok;

  return ok;
}

// ---------------------------------------------------------------------------
// Section 3 — Apify MCP Connectivity
// ---------------------------------------------------------------------------
async function testMcp(): Promise<boolean> {
  banner("SECTION 3 — Apify MCP Connectivity");
  let ok = true;
  const mcpClient = createMcpClient();

  try {
    ok =
      (await run(
        "initializeConnections() — Apify MCP server starts",
        async () => {
          await mcpClient.initializeConnections();
          info("Apify MCP process started.");
        }
      )) && ok;

    ok =
      (await run("Apify tools load (>= 1 tool)", async () => {
        const tools = await getApifyTools(mcpClient);
        if (tools.length === 0)
          throw new Error("No tools returned from Apify MCP server");
        info(
          `${tools.length} tool(s): ${tools
            .slice(0, 5)
            .map((t) => t.name)
            .join(", ")}${tools.length > 5 ? "..." : ""}`
        );
      })) && ok;
  } finally {
    await mcpClient.close();
    info("MCP connection closed.");
  }

  return ok;
}

// ---------------------------------------------------------------------------
// Section 4 — Hacker News Fetch (no API key)
// ---------------------------------------------------------------------------
async function testHackerNews(): Promise<boolean> {
  banner("SECTION 4 — Hacker News Fetch");
  let ok = true;

  ok =
    (await run("Top stories endpoint returns a non-empty array", async () => {
      const res = await fetch(
        "https://hacker-news.firebaseio.com/v0/topstories.json"
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const ids = (await res.json()) as number[];
      if (!Array.isArray(ids) || ids.length === 0)
        throw new Error("Expected non-empty array");
      info(`${ids.length} stories available.`);
    })) && ok;

  ok =
    (await run("Top 3 story details fetch successfully", async () => {
      const idsRes = await fetch(
        "https://hacker-news.firebaseio.com/v0/topstories.json"
      );
      const ids = (await idsRes.json()) as number[];

      const stories = await Promise.all(
        ids.slice(0, 3).map(async (id) => {
          const r = await fetch(
            `https://hacker-news.firebaseio.com/v0/item/${id}.json`
          );
          if (!r.ok) throw new Error(`Item ${id} failed: HTTP ${r.status}`);
          return r.json() as Promise<{ title: string; score: number }>;
        })
      );

      stories.forEach((s) => info(`"${s.title}" — score ${s.score}`));
    })) && ok;

  return ok;
}

// ---------------------------------------------------------------------------
// Section 5 — Drafting + Reflection (DeepSeek API, no MCP)
// ---------------------------------------------------------------------------
async function testDraftingAndReflection(): Promise<boolean> {
  banner("SECTION 5 — Drafting & Reflection Nodes (DeepSeek)");
  let ok = true;
  let draftedState: Partial<AgentStateType> = {};

  ok =
    (await run(
      "Drafting node returns linkedinDraft and xDraft",
      async () => {
        const draftNode = createDraftingNode();
        draftedState = await draftNode(FIXTURE_STATE);

        const { linkedinDraft, xDraft } = draftedState;
        if (!linkedinDraft?.trim()) throw new Error("linkedinDraft is empty");
        if (!xDraft?.trim()) throw new Error("xDraft is empty");
        if (xDraft.length > 280)
          throw new Error(`xDraft exceeds 280 chars (got ${xDraft.length})`);

        info(
          `LinkedIn (${linkedinDraft.length} chars): ${linkedinDraft.slice(0, 120)}...`
        );
        info(`X (${xDraft.length} chars): ${xDraft}`);
      }
    )) && ok;

  ok =
    (await run(
      "Reflection node returns isApproved + critiqueFeedback",
      async () => {
        const reflectionNode = createReflectionNode();
        const stateWithDrafts: AgentStateType = {
          ...FIXTURE_STATE,
          linkedinDraft: draftedState.linkedinDraft ?? "",
          xDraft: draftedState.xDraft ?? "",
        };

        const result = await reflectionNode(stateWithDrafts);

        if (result.isApproved === undefined)
          throw new Error("isApproved is undefined");
        if (!result.critiqueFeedback?.trim())
          throw new Error("critiqueFeedback is empty");
        if (result.revisionCount !== 1)
          throw new Error(
            `Expected revisionCount=1, got ${String(result.revisionCount)}`
          );

        info(`Approved: ${String(result.isApproved)}`);
        info(`Feedback: ${result.critiqueFeedback.slice(0, 150)}...`);
      }
    )) && ok;

  return ok;
}

// ---------------------------------------------------------------------------
// Section 6 — Full Pipeline (all APIs)
// ---------------------------------------------------------------------------
async function testFullPipeline(): Promise<boolean> {
  banner("SECTION 6 — Full Pipeline (end-to-end)");
  let ok = true;
  const mcpClient = createMcpClient();

  try {
    await mcpClient.initializeConnections();
    const apifyTools = await getApifyTools(mcpClient);
    const graph = buildWorkflow(apifyTools);

    ok =
      (await run(
        "graph.invoke({}) completes and all output fields are populated",
        async () => {
          const finalState = await graph.invoke({});

          const checks: Array<[string, unknown]> = [
            ["personalContext", finalState.personalContext],
            ["researchData", finalState.researchData],
            ["linkedinDraft", finalState.linkedinDraft],
            ["xDraft", finalState.xDraft],
            ["finalLinkedinPost", finalState.finalLinkedinPost],
            ["finalXPost", finalState.finalXPost],
            ["finalImageUrl", finalState.finalImageUrl],
          ];

          for (const [field, value] of checks) {
            if (!value || String(value).trim().length === 0)
              throw new Error(`"${field}" is empty in final state`);
          }

          if (finalState.xDraft.length > 280)
            throw new Error(
              `xDraft exceeds 280 chars: ${finalState.xDraft.length}`
            );

          info(`Revision cycles: ${finalState.revisionCount}`);
          info(`Approved: ${String(finalState.isApproved)}`);
          info(`Image: ${finalState.finalImageUrl}`);
          info(
            `LinkedIn (${finalState.finalLinkedinPost.length} chars): ${finalState.finalLinkedinPost.slice(0, 100)}...`
          );
          info(`X (${finalState.finalXPost.length} chars): ${finalState.finalXPost}`);
        }
      )) && ok;
  } finally {
    await mcpClient.close();
  }

  return ok;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
function printSummary(results: Array<[string, boolean]>): void {
  const line = "─".repeat(60);
  console.log(`\n${c.bold}${line}${c.reset}`);
  console.log(`${c.bold}  SUMMARY${c.reset}`);
  console.log(`${c.bold}${line}${c.reset}`);

  let passed = 0;
  for (const [name, ok] of results) {
    const icon = ok ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`;
    console.log(`  ${icon}  ${name}`);
    if (ok) passed++;
  }

  const color = passed === results.length ? c.green : c.red;
  console.log(
    `\n  ${color}${c.bold}${passed}/${results.length} sections passed${c.reset}\n`
  );
}

// ---------------------------------------------------------------------------
// Main — route by CLI arg or run all
// ---------------------------------------------------------------------------
const mode = process.argv[2] ?? "all";

const SECTIONS: Record<string, () => Promise<boolean>> = {
  env: testEnv,
  memory: testSupermemory,
  mcp: testMcp,
  hn: testHackerNews,
  draft: testDraftingAndReflection,
  pipeline: testFullPipeline,
};

async function main(): Promise<void> {
  console.log(
    `\n${c.bold}Content Agent — Test Runner${c.reset} ${c.dim}mode: ${mode}${c.reset}`
  );

  if (mode !== "all" && !(mode in SECTIONS)) {
    console.error(
      `${c.red}Unknown mode "${mode}". Valid: env | memory | mcp | hn | draft | pipeline | all${c.reset}`
    );
    process.exit(1);
  }

  const toRun =
    mode === "all"
      ? (Object.entries(SECTIONS) as Array<[string, () => Promise<boolean>]>)
      : [[mode, SECTIONS[mode]] as [string, () => Promise<boolean>]];

  const results: Array<[string, boolean]> = [];

  for (const [name, fn] of toRun) {
    const ok = await fn();
    results.push([name, ok]);
  }

  if (mode === "all") printSummary(results);

  process.exit(results.some(([, ok]) => !ok) ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error(`\n${c.red}${c.bold}Test runner crashed:${c.reset}`, err);
  process.exit(1);
});
