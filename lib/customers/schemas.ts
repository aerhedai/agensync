import { z } from "zod";

export const customerInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.email("Must be a valid email"),
  company: z.string().trim().min(1, "Company is required").max(200),
});

export type CustomerInput = z.infer<typeof customerInputSchema>;
