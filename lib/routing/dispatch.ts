import type { AIProvider } from "@/lib/ai/provider";
import { getAIProvider } from "@/lib/ai/get-provider";
import { classifyIntent } from "@/lib/routing/classify-intent";
import { runAgent } from "@/lib/runtime/agent-runtime";
import type { RunResult } from "@/lib/runtime/agent-runtime";
import * as workflowService from "@/lib/workflows/workflow-service";

export type DispatchResult =
  | { matched: true; agentId: string; agentName: string; run: RunResult }
  | { matched: false; reason: "no_workflow" | "no_match" };

/**
 * Runs a Workflow's classifier against an inbound message and, if it picks
 * a handler, runs that handler through the exact same runAgent()/policy/
 * approval path as any other run — this only decides *which* agent gets
 * called, never how the chosen agent executes once picked. Runs nothing if
 * no agent's scope clearly fits (CLAUDE.md #14 — no agent acting outside
 * its stated scope, not even a best guess).
 */
export async function dispatchInboundMessage(
  organisationId: string,
  trigger: "EMAIL",
  input: string,
  provider: AIProvider = getAIProvider(),
): Promise<DispatchResult> {
  const workflow =
    trigger === "EMAIL"
      ? await workflowService.findActiveEmailWorkflow(organisationId)
      : null;
  if (!workflow) {
    return { matched: false, reason: "no_workflow" };
  }

  const classifierMember = workflow.members.find(
    (m) => m.role === "CLASSIFIER",
  );
  const handlerMembers = workflow.members.filter(
    (m) => m.role === "HANDLER" && m.agent.status === "ACTIVE",
  );
  if (!classifierMember || handlerMembers.length === 0) {
    return { matched: false, reason: "no_workflow" };
  }

  const matchedAgentId = await classifyIntent(
    {
      model: classifierMember.agent.model,
      instructions: classifierMember.agent.instructions,
    },
    input,
    handlerMembers.map((m) => ({
      id: m.agent.id,
      name: m.agent.name,
      description: m.agent.description,
    })),
    provider,
  );

  if (!matchedAgentId) {
    return { matched: false, reason: "no_match" };
  }

  const handler = handlerMembers.find((m) => m.agent.id === matchedAgentId);
  if (!handler) {
    return { matched: false, reason: "no_match" };
  }

  const run = await runAgent(handler.agent, input, provider);
  return {
    matched: true,
    agentId: handler.agent.id,
    agentName: handler.agent.name,
    run,
  };
}
