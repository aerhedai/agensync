import type { PipelineContext } from "@/lib/harness/types";
import type { RunResult } from "@/lib/runtime/agent-runtime";
import { gateAndExecuteTool } from "@/lib/runtime/tool-execution";
import * as runRepository from "@/lib/runs/run-repository";

/**
 * The final step of every current pipeline: propose a terminal action
 * through the exact same deterministic gate the LOOP uses
 * (lib/runtime/tool-execution.ts) — approval-gated tools (currently just
 * send_email, see policy-engine.ts's REQUIRES_APPROVAL_BEFORE_EXECUTION)
 * are always held for human approval, no exceptions, same as LOOP mode.
 * This is the only place a pipeline finishes, whether that's "paused for
 * approval," "done," or "failed" (disallowed tool, or the call itself
 * errored).
 *
 * Which tool gets called here is Agent.actionTool, not a hardcoded
 * "send_email" — every pipeline today still only ever builds
 * {to, subject, body}-shaped args (there's no second action-tool shape to
 * generalize against yet), but the gate/status logic itself no longer
 * assumes send_email specifically. That's deliberate: a pipeline
 * proposing something other than send_email once a real second action
 * tool exists (e.g. create_invoice) is additive here, not a rewrite.
 */
export async function proposeAction(
  context: PipelineContext,
  action: { toolName: string; args: Record<string, unknown> },
): Promise<RunResult> {
  const result = await gateAndExecuteTool({
    runId: context.runId,
    organisationId: context.organisationId,
    mcpClient: context.mcpClient,
    allowedTools: context.allowedTools,
    callId: `harness_${context.runId}_${action.toolName}`,
    name: action.toolName,
    args: action.args,
  });

  if (result.status === "paused") {
    return { runId: context.runId, status: "WAITING_FOR_APPROVAL" };
  }

  if (result.status === "disallowed") {
    await runRepository.markRunStatus(context.runId, "FAILED", {
      completedAt: new Date(),
    });
    await runRepository.addRunStep(context.runId, "RUN_FAILED", result.error);
    return { runId: context.runId, status: "FAILED" };
  }

  if (result.isError) {
    await runRepository.markRunStatus(context.runId, "FAILED", {
      completedAt: new Date(),
    });
    await runRepository.addRunStep(
      context.runId,
      "RUN_FAILED",
      `Failed to complete the "${action.toolName}" action.`,
    );
    return { runId: context.runId, status: "FAILED" };
  }

  await runRepository.markRunStatus(context.runId, "COMPLETED", {
    completedAt: new Date(),
  });
  await runRepository.addRunStep(
    context.runId,
    "RUN_COMPLETED",
    `Action "${action.toolName}" completed.`,
  );
  return { runId: context.runId, status: "COMPLETED" };
}
