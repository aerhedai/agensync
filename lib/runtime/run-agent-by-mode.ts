import { getAIProvider } from "@/lib/ai/get-provider";
import type { AIProvider } from "@/lib/ai/provider";
import type { Agent } from "@/lib/generated/prisma/client";
import { runHarnessPipeline } from "@/lib/harness/run-harness-pipeline";
import type { ResolvedAttachment } from "@/lib/harness/types";
import { runAgent } from "@/lib/runtime/agent-runtime";
import type { RunResult } from "@/lib/runtime/agent-runtime";

/**
 * The one place that decides LOOP vs HARNESS for a given agent — used by
 * both routing (lib/routing/dispatch.ts) and the manual "Run agent" button
 * (app/agents/[id]/actions.ts), so a harness-mode agent can't accidentally
 * run through the free-form loop just because it was triggered by hand
 * instead of by the classifier. getAttachments is HARNESS-only for now —
 * LOOP mode has no pipeline that reads it yet.
 */
export function runAgentByExecutionMode(
  agent: Agent,
  input: string,
  provider: AIProvider = getAIProvider(),
  senderEmail: string | null = null,
  getAttachments?: () => Promise<ResolvedAttachment[]>,
): Promise<RunResult> {
  return agent.executionMode === "HARNESS"
    ? runHarnessPipeline(agent, input, provider, senderEmail, getAttachments)
    : runAgent(agent, input, provider);
}
