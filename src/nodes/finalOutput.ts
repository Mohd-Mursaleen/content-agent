/**
 * Node 5: Final Output & Image Generation
 *
 * Two-step finalization using the Google Gemini API directly (@google/genai):
 *
 *   Step 1 — Text polish:
 *     Uses `gemini-3.1-flash-preview` to do a final formatting pass on both drafts.
 *     Returns JSON with `finalLinkedinPost` and `finalXPost`.
 *
 *   Step 2 — Image generation:
 *     Uses `gemini-3.1-flash-image-preview` to generate a relevant post image.
 *     Extracts the base64 `inlineData.data` from the response parts, converts to
 *     a Buffer, and writes `post-image.png` to the project root.
 */

import { GoogleGenAI } from "@google/genai";
import { writeFile } from "node:fs/promises";
import { env } from "../config/env.js";
import type { AgentStateType } from "../state/schema.js";

const IMAGE_OUTPUT_PATH = "post-image.png";

interface PolishedPosts {
  finalLinkedinPost: string;
  finalXPost: string;
}

/**
 * Factory that creates the Final Output node.
 *
 * @returns LangGraph node function
 */
export function createFinalOutputNode() {
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

  /**
   * Polishes text drafts and generates a post image, then saves outputs to state.
   *
   * @param state - Current agent state
   * @returns Partial state update with `finalLinkedinPost`, `finalXPost`, and `finalImageUrl`
   * @throws Error if no image data is returned from the Gemini image model
   */
  return async function finalOutputNode(
    state: AgentStateType
  ): Promise<Partial<AgentStateType>> {
    // -------------------------------------------------------------------------
    // Step 1: Polish text with gemini-3.1-flash-preview
    // -------------------------------------------------------------------------
    console.log("[Node 5] Polishing final text with Gemini...");

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
    const { finalLinkedinPost, finalXPost } = JSON.parse(
      rawText
    ) as PolishedPosts;

    console.log("[Node 5] Text polished.");

    // -------------------------------------------------------------------------
    // Step 2: Generate image with gemini-3.1-flash-image-preview
    // responseModalities: ["IMAGE", "TEXT"] is required to receive image parts
    // -------------------------------------------------------------------------
    console.log("[Node 5] Generating post image with Gemini...");

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

    return {
      finalLinkedinPost,
      finalXPost,
      finalImageUrl: IMAGE_OUTPUT_PATH,
    };
  };
}
