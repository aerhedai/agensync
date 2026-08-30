import { z } from "zod";

import { SUPPORTED_CURRENCIES } from "@/lib/currency/currency-symbols";

export const organisationInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  currency: z.enum(SUPPORTED_CURRENCIES),
});

export type OrganisationInput = z.infer<typeof organisationInputSchema>;
