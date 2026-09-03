import { failPipeline } from "@/lib/harness/pipeline-failure";
import { runStepProgramme } from "@/lib/harness/steps/run-steps";
import { stepProgrammeSchema } from "@/lib/harness/steps/schema";
import type { Pipeline } from "@/lib/harness/types";

/**
 * The generic pipeline: runs whatever step sequence this agent is
 * configured with, instead of a shape hardcoded in a file
 * (docs/agent-step-engine-design.md).
 *
 * Every other entry in the pipeline registry is one fixed process shape.
 * This one is the shape-agnostic replacement for all of them — an agent
 * that files an emailed invoice as a record and an agent that prices a
 * quote differ only in their configured steps, not in which code runs.
 *
 * Exported schema, same convention the other config-driven pipelines
 * follow: one source of truth validating both the runtime config and the
 * agent form, so the UI can't accept a programme the runtime would reject.
 */
export const pipelineConfigSchema = stepProgrammeSchema;

export const runStepsPipeline: Pipeline = async (context) => {
  const parsed = stepProgrammeSchema.safeParse(context.agent.pipelineConfig);
  if (!parsed.success) {
    return failPipeline(
      context,
      "This agent has no valid step sequence configured — add at least one step in the agent's settings.",
    );
  }
  return runStepProgramme(context, parsed.data.steps);
};
