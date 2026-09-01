import { z } from "zod";

import { extractionFieldsSchema } from "@/lib/agents/extraction-fields";
import { TOOL_NAMES } from "@/lib/mcp/tool-registry";

// What a business actually picks in the form — translated below into the
// Prisma-shaped executionMode/pipelineKey pair, so nothing above this
// schema (the form, the server action) needs to know those two columns
// have to agree with each other. "loop" is the free-form, advanced
// option (lib/runtime/agent-runtime.ts) — not what a business reaches for
// to add a new email category; "acknowledge_reply" is (see
// lib/harness/pipelines/acknowledge-reply-pipeline.ts).
const categoryTypeSchema = z.enum(["loop", "acknowledge_reply", "quote"]);
export type CategoryType = z.infer<typeof categoryTypeSchema>;

export const agentInputSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(200),
    description: z.string().trim().min(1, "Description is required").max(2000),
    instructions: z
      .string()
      .trim()
      .min(1, "Instructions are required")
      .max(10000),
    model: z.string().trim().min(1, "Model is required").max(200),
    categoryType: categoryTypeSchema,
    // HARNESS-only. Empty string normalizes to null — "use the pipeline's
    // hardcoded default subject" (e.g. "Re: your inquiry").
    replySubjectTemplate: z
      .string()
      .trim()
      .max(200)
      .transform((v) => (v.length > 0 ? v : null))
      .nullable()
      .default(null),
    // Deterministic pre-classifier keywords (lib/routing/deterministic-classify.ts).
    keywords: z.array(z.string().trim().min(1)).default([]),
    // Validated against the canonical registry so a submitted tool name that
    // isn't real can never reach the database (lib/mcp/tool-registry.ts).
    toolNames: z.array(z.enum(TOOL_NAMES)).default([]),
    // "acknowledge_reply"-only — ignored (but harmless to submit) for
    // "loop"/"quote" categories.
    extractionFields: extractionFieldsSchema.default([]),
    guardrailKeywords: z.array(z.string().trim().min(1)).default([]),
    // Which connected account actionTool uses — see
    // Agent.actionIntegrationId's schema.prisma comment. Empty string (the
    // "use the organisation's default account" option in the form)
    // normalizes to null, same pattern as replySubjectTemplate above.
    actionIntegrationId: z
      .string()
      .trim()
      .max(200)
      .transform((v) => (v.length > 0 ? v : null))
      .nullable()
      .default(null),
  })
  .transform(({ categoryType, ...rest }) => ({
    ...rest,
    executionMode:
      categoryType === "loop" ? ("LOOP" as const) : ("HARNESS" as const),
    pipelineKey: categoryType === "loop" ? null : categoryType,
  }));

export type AgentInput = z.infer<typeof agentInputSchema>;
// The subset that's actually a column on the Agent model — toolNames is
// AgentTool rows, written separately (see agent-service.ts).
export type AgentColumnsInput = Omit<AgentInput, "toolNames">;
