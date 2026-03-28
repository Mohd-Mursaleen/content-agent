/**
 * Standalone test for OpenAI image generation using gpt-image-1-mini.
 *
 * Uses openai.images.generate() which returns b64_json by default for this model.
 * Writes the result to `test-image.png` in the project root.
 *
 * Run: npm run test:image
 */

import "dotenv/config";
import OpenAI from "openai";
import { writeFile } from "node:fs/promises";

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

function pass(label: string, detail = "") {
  console.log(`  ${green("PASS")} ${label}${detail ? dim(" — " + detail) : ""}`);
}

function fail(label: string, err: unknown) {
  console.log(`  ${red("FAIL")} ${label}`);
  if (err instanceof Error) {
    console.log(`       ${red(err.message)}`);
    if (err.stack) {
      console.log(dim(err.stack.split("\n").slice(1).join("\n")));
    }
  } else {
    console.log(`       ${red(String(err))}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(cyan("\n=== OpenAI Image Generation Test (gpt-image-1-mini) ===\n"));

  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    fail("OPENAI_API_KEY", new Error("OPENAI_API_KEY is not set in environment"));
    process.exit(1);
  }
  pass("OPENAI_API_KEY loaded", `${apiKey.slice(0, 8)}...`);

  const openai = new OpenAI({ apiKey });
  const OUTPUT_PATH = "test-image.png";

  console.log(cyan("\n[1] Image generation (gpt-image-1-mini)"));
  console.log(dim("      Calling openai.images.generate..."));

  try {
    const response = await openai.images.generate({
      model: "gpt-image-1-mini",
      prompt:
        "A professional, visually striking social media header image of a glowing neural network on a dark background. Minimalist tech aesthetic.",
      n: 1,
    });

    console.log(dim(`      Response data items: ${response.data?.length ?? 0}`));

    const firstItem = response.data?.[0];
    const b64 = firstItem?.b64_json;

    if (!b64) {
      throw new Error(
        "No b64_json field in response. " +
          `data[0] keys: ${Object.keys(firstItem ?? {}).join(", ")}`
      );
    }

    const buffer = Buffer.from(b64, "base64");
    await writeFile(OUTPUT_PATH, buffer);

    pass("gpt-image-1-mini", `${buffer.length} bytes → ${OUTPUT_PATH}`);
  } catch (err) {
    fail("gpt-image-1-mini image generation", err);
    process.exit(1);
  }

  console.log(cyan("\n=== Test passed ===\n"));
}

main().catch((err) => {
  console.error(red("\nUnhandled error:"), err);
  process.exit(1);
});
