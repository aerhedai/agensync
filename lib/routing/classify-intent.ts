import { z } from "zod";

import { getAIProvider } from "@/lib/ai/get-provider";
import { parseJsonResponse } from "@/lib/ai/json-extraction";
import type { AIProvider } from "@/lib/ai/provider";

export interface ClassifierAgent {
  model: string;
  instructions: string;
}

export interface AgentCandidate {
  id: string;
  name: string;
  description: string;
}

const classificationSchema = z.object({
  agentId: z.string().nullable(),
});

/**
 * Decides which single handler agent, if any, should deal with an inbound
 * message. The classifier itself is a real, business-editable Agent row
 * (its instructions and model, same as any other agent) — this is a
 * single-shot classification call using that agent's config, not a full
 * agentic tool-loop (see the classifier's Workflow membership in
 * lib/workflows for how it's wired up).
 *
 * The model's answer is never trusted on its own (CLAUDE.md #14): it must
 * parse as valid JSON and name an id that's actually in the candidate list
 * passed in, or this returns null — the same "app code decides" principle
 * already applied to tool calls, applied here to routing.
 */
export async function classifyIntent(
  classifier: ClassifierAgent,
  input: string,
  candidates: AgentCandidate[],
  provider: AIProvider = getAIProvider(),
): Promise<string | null> {
  if (candidates.length === 0) return null;

  const candidateList = candidates
    .map(
      (c) => `- id: "${c.id}", name: "${c.name}" — handles: ${c.description}`,
    )
    .join("\n");

  const response = await provider.generateResponse({
    model: classifier.model,
    responseFormat: "json",
    messages: [
      {
        role: "system",
        content:
          `${classifier.instructions}\n\n` +
          `Available agents:\n${candidateList}\n\n` +
          'Respond with ONLY a JSON object, no other text: {"agentId": "<id>"} if exactly one agent clearly fits, or {"agentId": null} if none of them are a clear fit — do not guess, and never invent an id that is not in the list above.',
      },
      { role: "user", content: input },
    ],
  });

  const parsed = parseJsonResponse(response.content, classificationSchema);
  const agentId = parsed?.agentId ?? null;
  if (agentId === null) return null;

  return candidates.some((c) => c.id === agentId) ? agentId : null;
}
