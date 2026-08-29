import { runComplaintsPipeline } from "@/lib/harness/pipelines/complaints-pipeline";
import { runGeneralPipeline } from "@/lib/harness/pipelines/general-pipeline";
import { runQuotePipeline } from "@/lib/harness/pipelines/quote-pipeline";
import type { Pipeline } from "@/lib/harness/types";

// Pipelines are code, not data — Agent.pipelineKey (a plain string column,
// not a foreign key) just looks up an entry here. Deliberately not a
// generic declarative engine (CLAUDE.md #24): three concrete pipelines,
// proven working, before any generalization into business-configurable
// pipeline definitions.
const PIPELINES: Record<string, Pipeline> = {
  quote: runQuotePipeline,
  complaints: runComplaintsPipeline,
  general: runGeneralPipeline,
};

export function getPipeline(pipelineKey: string | null): Pipeline | null {
  if (!pipelineKey) return null;
  return PIPELINES[pipelineKey] ?? null;
}
