import type { PipelineContext } from "@/lib/harness/types";
import type { RunResult } from "@/lib/runtime/agent-runtime";
import { gateAndExecuteTool } from "@/lib/runtime/tool-execution";
import * as runRepository from "@/lib/runs/run-repository";

/**
 * The final step of every current pipeline: propose the composed reply as
 * a send_email call, through the exact same deterministic gate the LOOP
 * uses (lib/runtime/tool-execution.ts) — send_email is always held for
 * human approval, no exceptions, same as LOOP mode. This is the only place
 * a pipeline finishes, whether that's "paused for approval," "sent," or
 * "failed" (disallowed tool, or the send itself errored).
 */
export async function proposeSendEmail(
  context: PipelineContext,
  email: { to: string; subject: string; body: string },
): Promise<RunResult> {
  const result = await gateAndExecuteTool({
    runId: context.runId,
    organisationId: context.organisationId,
    mcpClient: context.mcpClient,
    allowedTools: context.allowedTools,
    callId: `harness_${context.runId}_send_email`,
    name: "send_email",
    args: email,
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
      "Failed to send the email.",
    );
    return { runId: context.runId, status: "FAILED" };
  }

  await runRepository.markRunStatus(context.runId, "COMPLETED", {
    completedAt: new Date(),
  });
  await runRepository.addRunStep(context.runId, "RUN_COMPLETED", "Email sent.");
  return { runId: context.runId, status: "COMPLETED" };
}
