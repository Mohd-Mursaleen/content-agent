/**
 * Environment configuration module.
 * Loads and validates all required environment variables at import time.
 * This is the single source of truth for env vars — no other file reads process.env directly.
 */

import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  DEEPSEEK_API_KEY: z.string().min(1, "DEEPSEEK_API_KEY is required"),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  SUPERMEMORY_API_KEY: z.string().min(1, "SUPERMEMORY_API_KEY is required"),
  APIFY_TOKEN: z.string().min(1, "APIFY_TOKEN is required"),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Parsed and validated environment variables.
 * Throws a ZodError at import time if any required variable is missing or empty.
 */
export const env: Env = EnvSchema.parse(process.env);
