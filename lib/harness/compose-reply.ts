import type { PipelineContext } from "@/lib/harness/types";
import * as runRepository from "@/lib/runs/run-repository";

/**
 * The other narrow LLM call a pipeline makes: write the reply text, given
 * facts that are already fully resolved (real tool results, not something
 * the model has to remember from several turns ago). That's what killed
 * the placeholder/made-up-figure bug in LOOP mode — the number is handed
 * in at generation time, not recalled.
 */
export async function composeReply(
  context: PipelineContext,
  instructions: string,
  facts: string,
): Promise<string> {
  const response = await context.provider.generateResponse({
    model: context.agent.model,
    messages: [
      { role: "system", content: instructions },
      { role: "user", content: facts },
    ],
  });

  await runRepository.addRunStep(
    context.runId,
    "AGENT_DECISION",
    response.content,
    undefined,
    response.usage,
  );

  return response.content;
}
