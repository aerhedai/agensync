import type { PipelineContext } from "@/lib/harness/types";
import type { RunResult } from "@/lib/runtime/agent-runtime";
import * as runRepository from "@/lib/runs/run-repository";

export async function failPipeline(
  context: PipelineContext,
  reason: string,
): Promise<RunResult> {
  await runRepository.markRunStatus(context.runId, "FAILED", {
    completedAt: new Date(),
  });
  await runRepository.addRunStep(context.runId, "RUN_FAILED", reason);
  return { runId: context.runId, status: "FAILED" };
}
