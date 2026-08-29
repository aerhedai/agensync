import type { z } from "zod";

import { parseJsonResponse } from "@/lib/ai/json-extraction";
import type { PipelineContext } from "@/lib/harness/types";
import * as runRepository from "@/lib/runs/run-repository";

/**
 * The one place a pipeline asks the LLM an open-ended question — but a
 * narrow one: pull these specific fields out of this text, nothing else.
 * No tools offered, no decision to make, so there's nothing for it to
 * hallucinate a tool call for. Validated against `schema` before use
 * (CLAUDE.md #14 — never trust the model's output directly); returns null
 * on anything that doesn't parse or validate, which the caller must handle
 * as "extraction failed," not silently proceed with partial data.
 */
export async function extractFields<T>(
  context: PipelineContext,
  instructions: string,
  schema: z.ZodType<T>,
): Promise<T | null> {
  const response = await context.provider.generateResponse({
    model: context.agent.model,
    responseFormat: "json",
    messages: [
      { role: "system", content: instructions },
      { role: "user", content: context.input },
    ],
  });

  await runRepository.addRunStep(
    context.runId,
    "AGENT_DECISION",
    `Extracted: ${response.content}`,
    undefined,
    response.usage,
  );

  return parseJsonResponse(response.content, schema);
}
