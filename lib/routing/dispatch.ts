import type { AIProvider } from "@/lib/ai/provider";
import { getAIProvider } from "@/lib/ai/get-provider";
import type { WorkflowTriggerType } from "@/lib/generated/prisma/client";
import type { ResolvedAttachment } from "@/lib/harness/types";
import { classifyIntent } from "@/lib/routing/classify-intent";
import { deterministicClassify } from "@/lib/routing/deterministic-classify";
import { runAgentByExecutionMode } from "@/lib/runtime/run-agent-by-mode";
import type { RunResult } from "@/lib/runtime/agent-runtime";
import * as workflowService from "@/lib/workflows/workflow-service";

export type DispatchResult =
  | { matched: true; agentId: string; agentName: string; run: RunResult }
  | { matched: false; reason: "no_workflow" | "no_match" };

/**
 * Runs a Workflow's classifier against an inbound message and, if it picks
 * a handler, runs that handler — through its own configured execution mode
 * (lib/harness/ for HARNESS, lib/runtime/agent-runtime.ts for LOOP) — this
 * only decides *which* agent gets called and *how much it costs to decide
 * that*, never how the chosen agent executes once picked. Runs nothing if
 * no agent's scope clearly fits (CLAUDE.md #14 — no agent acting outside
 * its stated scope, not even a best guess).
 *
 * `input` should be the message's actual content (subject + body) only —
 * never the sender's address. Both the keyword fast path and the LLM
 * classifier match/reason over `input` directly, and a customer's own
 * email address can accidentally collide with a keyword (found live: an
 * address containing "price" silently routed every message to the Quote
 * Agent, regardless of content). The sender goes through `senderEmail`
 * instead, used only for identification (customer lookup / reply-to) by the
 * harness pipelines — it never influences what a message is classified as
 * or what gets extracted from it.
 *
 * triggerIntegrationId narrows the workflow lookup to one bound to that
 * specific connected account (see Workflow.triggerIntegrationId's
 * schema.prisma comment) — null (the default) matches the generic
 * org-wide workflow for this trigger type, today's only behavior for
 * triggers with no natural per-account binding (e.g. EMAIL).
 */
export async function dispatchInboundMessage(
  organisationId: string,
  trigger: WorkflowTriggerType,
  input: string,
  provider: AIProvider = getAIProvider(),
  senderEmail: string | null = null,
  triggerIntegrationId: string | null = null,
  getAttachments?: () => Promise<ResolvedAttachment[]>,
): Promise<DispatchResult> {
  const workflow = await workflowService.findActiveWorkflowForDispatch(
    organisationId,
    trigger,
    triggerIntegrationId,
  );
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

  // Fast path: a deterministic keyword match skips the LLM classify call
  // entirely. Only falls through to it on ambiguity (see
  // deterministic-classify.ts) — the LLM remains the safety net, not the
  // primary mechanism.
  const matchedAgentId =
    deterministicClassify(
      input,
      handlerMembers.map((m) => ({
        id: m.agent.id,
        keywords: m.agent.keywords,
      })),
    ) ??
    (await classifyIntent(
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
    ));

  if (!matchedAgentId) {
    return { matched: false, reason: "no_match" };
  }

  const handler = handlerMembers.find((m) => m.agent.id === matchedAgentId);
  if (!handler) {
    return { matched: false, reason: "no_match" };
  }

  const run = await runAgentByExecutionMode(
    handler.agent,
    input,
    provider,
    senderEmail,
    getAttachments,
  );

  return {
    matched: true,
    agentId: handler.agent.id,
    agentName: handler.agent.name,
    run,
  };
}
