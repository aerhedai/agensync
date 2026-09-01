import { z } from "zod";

// Only "EMAIL" is offered at creation time — it's the only trigger type
// with real dispatch logic behind it (lib/routing/dispatch.ts). The enum
// itself already anticipates more (Slack, webhook, ...); this schema will
// grow with it once those exist, rather than needing a rewrite.
export const workflowInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().min(1, "Description is required").max(2000),
  trigger: z.enum(["EMAIL"]),
});

export type WorkflowInput = z.infer<typeof workflowInputSchema>;
