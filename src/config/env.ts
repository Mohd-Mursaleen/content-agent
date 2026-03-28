/**
 * Environment configuration module.
 * Loads and validates all required environment variables at import time.
 * This is the single source of truth for env vars — no other file reads process.env directly.
 *
 * FINAL_OUTPUT_PROVIDER controls which provider handles Node 5 (text polish + image):
 *   "openai"  → OpenAI chat completions + gpt-image-1-mini  (default)
 *   "gemini"  → Vertex AI via @google/genai + Gemini image model
 *               Requires GOOGLE_APPLICATION_CREDENTIALS and GOOGLE_PROJECT_ID
 */

import "dotenv/config";
import { z } from "zod";

const EnvSchema = z
  .object({
    DEEPSEEK_API_KEY: z.string().min(1, "DEEPSEEK_API_KEY is required"),
    OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
    SUPERMEMORY_API_KEY: z.string().min(1, "SUPERMEMORY_API_KEY is required"),
    APIFY_TOKEN: z.string().min(1, "APIFY_TOKEN is required"),

    // Selects the provider used by the Final Output node (Node 5).
    FINAL_OUTPUT_PROVIDER: z.enum(["gemini", "openai"]).default("openai"),

    // Required only when FINAL_OUTPUT_PROVIDER=gemini.
    // GOOGLE_APPLICATION_CREDENTIALS: path to a GCP service account JSON file.
    // The @google/genai SDK reads this automatically via ADC.
    GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
    GOOGLE_PROJECT_ID: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.FINAL_OUTPUT_PROVIDER === "gemini") {
      if (!data.GOOGLE_APPLICATION_CREDENTIALS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "GOOGLE_APPLICATION_CREDENTIALS is required when FINAL_OUTPUT_PROVIDER=gemini",
          path: ["GOOGLE_APPLICATION_CREDENTIALS"],
        });
      }
      if (!data.GOOGLE_PROJECT_ID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "GOOGLE_PROJECT_ID is required when FINAL_OUTPUT_PROVIDER=gemini",
          path: ["GOOGLE_PROJECT_ID"],
        });
      }
    }
  });

export type Env = z.infer<typeof EnvSchema>;

/**
 * Parsed and validated environment variables.
 * Throws a ZodError at import time if any required variable is missing or empty.
 */
export const env: Env = EnvSchema.parse(process.env);
