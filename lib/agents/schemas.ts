import { z } from "zod";

import { TOOL_NAMES } from "@/lib/mcp/tool-registry";

export const agentInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().min(1, "Description is required").max(2000),
  instructions: z
    .string()
    .trim()
    .min(1, "Instructions are required")
    .max(10000),
  model: z.string().trim().min(1, "Model is required").max(200),
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
});

export type AgentInput = z.infer<typeof agentInputSchema>;
// The subset that's actually a column on the Agent model — toolNames is
// AgentTool rows, written separately (see agent-service.ts).
export type AgentColumnsInput = Omit<AgentInput, "toolNames">;
