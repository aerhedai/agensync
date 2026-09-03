import { getAIProvider } from "@/lib/ai/organisation-ai-provider";
import type { AIProvider } from "@/lib/ai/provider";
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
  // Optional, resolved lazily below — an org with no active workflow at
  // all (or one whose keyword fast path always resolves routing, and
  // whose matched handler runs a zero-LLM HARNESS pipeline) never touches
  // AI provider configuration. Requiring it unconditionally would make
  // "no workflow configured" indistinguishable from "no AI provider
  // configured", two different setup gaps a business needs to fix in a
  // different order. Same reasoning as resumeRun's own optional provider.
  provider?: AIProvider,
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

  // Resolved here, not before — everything above this point (no active
  // workflow, no classifier, no active handler) can return without ever
  // needing an AI provider. Resolved unconditionally from this point on,
  // even though the deterministic keyword fast path just below sometimes
  // means the LLM is never actually called this time — a deliberate
  // simplification: fully deferring resolution until the exact call that
  // needs it would mean threading a lazy resolver through classifyIntent
  // and every HARNESS pipeline instead of a resolved value, for a case
  // (a workflow exists, its config makes classification keyword-only, and
  // the matched pipeline happens to be one of the zero-LLM ones) that's
  // real but narrow.
  const resolvedProvider = provider ?? (await getAIProvider(organisationId));

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
      resolvedProvider,
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
    resolvedProvider,
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
