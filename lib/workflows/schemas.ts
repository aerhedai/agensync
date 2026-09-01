import { z } from "zod";

// Only triggers with real dispatch logic behind them
// (lib/routing/dispatch.ts / app/api/webhooks/[integrationId]) are offered
// at creation time. The enum itself already anticipates more (Slack, ...);
// this schema grows with it once those exist, rather than needing a rewrite.
export const workflowInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().min(1, "Description is required").max(2000),
  trigger: z.enum(["EMAIL", "WEBHOOK"]),
});

export type WorkflowInput = z.infer<typeof workflowInputSchema>;
