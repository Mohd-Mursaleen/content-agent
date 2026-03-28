/**
 * Node 5: Final Output & Image Generation
 *
 * Provider-switched node — controlled by FINAL_OUTPUT_PROVIDER env var:
 *
 *   "openai" (default):
 *     - Text polish: gpt-4o with JSON mode via openai.chat.completions.create()
 *     - Image:       gpt-image-1-mini via openai.images.generate()
 *
 *   "gemini":
 *     - Text polish: gemini-3.1-flash-preview via Vertex AI (@google/genai, vertexai: true)
 *     - Image:       gemini-3.1-flash-image-preview via Vertex AI
 *     - Auth:        ADC reads GOOGLE_APPLICATION_CREDENTIALS automatically
 */

import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { writeFile } from "node:fs/promises";
import { env } from "../config/env.js";
import type { AgentStateType } from "../state/schema.js";

const hr = (label: string) =>
  console.log(`\n${"─".repeat(20)} ${label} ${"─".repeat(20)}`);

const IMAGE_OUTPUT_PATH = "post-image.png";

interface PolishedPosts {
  finalLinkedinPost: string;
  finalXPost: string;
}

// ---------------------------------------------------------------------------
// OpenAI path
// ---------------------------------------------------------------------------

/**
 * Polishes drafts and generates an image using OpenAI.
 *
 * @param state - Current agent state
 * @returns Partial state update with finalLinkedinPost, finalXPost, finalImageUrl
 * @throws Error if OpenAI returns no image data
 */
async function runOpenAIFinalOutput(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  // Step 1: Text polish
  console.log("[Node 5] Polishing final text with OpenAI (gpt-4o)...");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a text editor. Return valid JSON with exactly two keys: " +
          '"finalLinkedinPost" and "finalXPost".',
      },
      {
        role: "user",
        content:
          `Do a final light polish on these social media posts. ` +
          `Preserve the human voice and structure. Fix formatting issues only.\n\n` +
          `LinkedIn draft:\n${state.linkedinDraft}\n\n` +
          `X draft:\n${state.xDraft}`,
      },
    ],
  });

  const rawText = completion.choices[0]?.message?.content ?? "{}";
  const { finalLinkedinPost, finalXPost } = JSON.parse(rawText) as PolishedPosts;

  hr("Node 5 — Final LinkedIn Post (OpenAI)");
  console.log(finalLinkedinPost);
  hr(`Node 5 — Final X Post (${finalXPost.length} chars)`);
  console.log(finalXPost);
  hr("End text polish");

  // Step 2: Image generation
  console.log("[Node 5] Generating post image with gpt-image-1-mini...");

  const imgResponse = await openai.images.generate({
    model: "gpt-image-1-mini",
    prompt:
      `Create a professional, visually striking social media header image ` +
      `that represents the theme of this post:\n\n` +
      `${finalLinkedinPost.slice(0, 300)}`,
    n: 1,
  });

  const firstItem = imgResponse.data?.[0];
  const b64 = firstItem?.b64_json;
  if (!b64) {
    throw new Error(
      "No b64_json returned from gpt-image-1-mini. " +
        `data[0] keys: ${Object.keys(firstItem ?? {}).join(", ")}`
    );
  }

  const buffer = Buffer.from(b64, "base64");
  await writeFile(IMAGE_OUTPUT_PATH, buffer);

  console.log(`[Node 5] Image saved to ${IMAGE_OUTPUT_PATH}.`);

  return { finalLinkedinPost, finalXPost, finalImageUrl: IMAGE_OUTPUT_PATH };
}

// ---------------------------------------------------------------------------
// Gemini (Vertex AI) path
// ---------------------------------------------------------------------------

/**
 * Polishes drafts and generates an image using Vertex AI via @google/genai.
 * Auth is handled by GOOGLE_APPLICATION_CREDENTIALS (ADC).
 *
 * @param state - Current agent state
 * @returns Partial state update with finalLinkedinPost, finalXPost, finalImageUrl
 * @throws Error if no image data is returned from the Gemini image model
 */
async function runGeminiFinalOutput(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const ai = new GoogleGenAI({
    vertexai: true,
    project: env.GOOGLE_PROJECT_ID!,
    location: "us-central1",
  });

  // Step 1: Text polish
  console.log("[Node 5] Polishing final text with Vertex AI (gemini-3.1-flash-preview)...");

  const textResponse = await ai.models.generateContent({
    model: "gemini-3.1-flash-preview",
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              `Do a final light polish on these social media posts. ` +
              `Preserve the human voice and structure. Fix any formatting issues only. ` +
              `Return valid JSON with exactly two keys: "finalLinkedinPost" and "finalXPost".\n\n` +
              `LinkedIn draft:\n${state.linkedinDraft}\n\n` +
              `X draft:\n${state.xDraft}`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
    },
  });

  const rawText =
    textResponse.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  const { finalLinkedinPost, finalXPost } = JSON.parse(rawText) as PolishedPosts;

  hr("Node 5 — Final LinkedIn Post (Gemini/Vertex)");
  console.log(finalLinkedinPost);
  hr(`Node 5 — Final X Post (${finalXPost.length} chars)`);
  console.log(finalXPost);
  hr("End text polish");

  // Step 2: Image generation
  // responseModalities: ["IMAGE", "TEXT"] is required — without it no image parts are returned.
  console.log("[Node 5] Generating post image with Vertex AI (gemini-3.1-flash-image-preview)...");

  const imageResponse = await ai.models.generateContent({
    model: "gemini-3.1-flash-image-preview",
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              `Create a professional, visually striking social media header image ` +
              `that represents the theme of this post:\n\n` +
              `${finalLinkedinPost.slice(0, 300)}`,
          },
        ],
      },
    ],
    config: {
      responseModalities: ["IMAGE", "TEXT"],
    },
  });

  const parts = imageResponse.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find(
    (p) => p.inlineData !== undefined && p.inlineData.data !== undefined
  );

  if (!imagePart?.inlineData?.data) {
    throw new Error(
      "No image data returned from Gemini image model. " +
        "Ensure the model supports image generation and responseModalities is set correctly."
    );
  }

  const imageBuffer = Buffer.from(imagePart.inlineData.data, "base64");
  await writeFile(IMAGE_OUTPUT_PATH, imageBuffer);

  console.log(`[Node 5] Image saved to ${IMAGE_OUTPUT_PATH}.`);

  return { finalLinkedinPost, finalXPost, finalImageUrl: IMAGE_OUTPUT_PATH };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Factory that creates the Final Output node, selecting the provider at startup
 * based on FINAL_OUTPUT_PROVIDER env var.
 *
 * @returns LangGraph node function
 */
export function createFinalOutputNode() {
  const provider = env.FINAL_OUTPUT_PROVIDER;
  console.log(`[Node 5] Using provider: ${provider}`);

  return async function finalOutputNode(
    state: AgentStateType
  ): Promise<Partial<AgentStateType>> {
    if (provider === "openai") {
      return runOpenAIFinalOutput(state);
    }
    return runGeminiFinalOutput(state);
  };
}
