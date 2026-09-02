import { z } from "zod";

import { SUPPORTED_CURRENCIES } from "@/lib/currency/currency-symbols";

export const organisationInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  currency: z.enum(SUPPORTED_CURRENCIES),
});

export type OrganisationInput = z.infer<typeof organisationInputSchema>;

// Empty string means "clear the link" — coerced to null rather than stored
// as "", so "not set" only ever has one representation in the database.
const optionalUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => value === "" || z.url().safeParse(value).success, {
    message: "Must be a valid URL",
  })
  .transform((value) => (value === "" ? null : value));

export const legalLinksInputSchema = z.object({
  termsUrl: optionalUrl,
  privacyUrl: optionalUrl,
});

export type LegalLinksInput = z.infer<typeof legalLinksInputSchema>;
