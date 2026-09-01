import { runAcknowledgeReplyPipeline } from "@/lib/harness/pipelines/acknowledge-reply-pipeline";
import { runQuotePipeline } from "@/lib/harness/pipelines/quote-pipeline";
import type { Pipeline } from "@/lib/harness/types";

// Pipelines are code, not data — Agent.pipelineKey (a plain string column,
// not a foreign key) just looks up an entry here. Deliberately a small,
// fixed set of *shapes*, not a generic declarative workflow engine
// (CLAUDE.md #24/#30): "quote" is a real multi-step dependent tool chain
// that only a developer can add; "acknowledge_reply" is a single generic
// shape (extract -> optional lookup -> compose -> guardrail -> approve)
// that a business configures per category through Agent.extractionFields/
// instructions/guardrailKeywords with no code change — this replaced what
// used to be two separate, nearly-identical pipeline files ("complaints"
// and "general") once it became clear that's all they really were.
const PIPELINES: Record<string, Pipeline> = {
  quote: runQuotePipeline,
  acknowledge_reply: runAcknowledgeReplyPipeline,
};

export function getPipeline(pipelineKey: string | null): Pipeline | null {
  if (!pipelineKey) return null;
  return PIPELINES[pipelineKey] ?? null;
}
