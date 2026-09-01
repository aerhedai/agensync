import { z } from "zod";

// Only triggers with real dispatch logic behind them
// (lib/routing/dispatch.ts / app/api/webhooks/[integrationId]) are offered
// at creation time. The enum itself already anticipates more (Slack, ...);
// this schema grows with it once those exist, rather than needing a rewrite.
export const workflowInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().min(1, "Description is required").max(2000),
  trigger: z.enum(["EMAIL", "WEBHOOK"]),
  // Which specific connected account this workflow listens on — see
  // Workflow.triggerIntegrationId's schema.prisma comment. Required-ness
  // is trigger-dependent (enforced in workflow-service.ts, not here,
  // since it needs the trigger value to decide) rather than encoded as a
  // Zod refinement, so the one rule lives in one place.
  triggerIntegrationId: z.string().trim().min(1).nullable().optional(),
});

export type WorkflowInput = z.infer<typeof workflowInputSchema>;
