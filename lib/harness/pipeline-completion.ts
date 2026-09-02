import type { PipelineContext } from "@/lib/harness/types";
import type { RunResult } from "@/lib/runtime/agent-runtime";
import * as runRepository from "@/lib/runs/run-repository";

// The direct-completion counterpart to proposeAction — for a pipeline
// whose configured actions for this transition don't include an
// approval-gated terminal step (e.g. only folders were created, no email
// configured for this status). proposeAction remains the only way a
// pipeline finishes when it does end in one.
export async function completePipeline(
  context: PipelineContext,
  message: string,
): Promise<RunResult> {
  await runRepository.markRunStatus(context.runId, "COMPLETED", {
    completedAt: new Date(),
  });
  await runRepository.addRunStep(context.runId, "RUN_COMPLETED", message);
  return { runId: context.runId, status: "COMPLETED" };
}
