import { z } from "zod";

export const agentInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().min(1, "Description is required").max(2000),
  instructions: z
    .string()
    .trim()
    .min(1, "Instructions are required")
    .max(10000),
  model: z.string().trim().min(1, "Model is required").max(200),
});

export type AgentInput = z.infer<typeof agentInputSchema>;
