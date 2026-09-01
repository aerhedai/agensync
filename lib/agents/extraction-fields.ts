import { z } from "zod";

// A business-defined field to pull out of an inbound message for the
// "acknowledge_reply" pipeline — e.g. {name: "caseNumber", description:
// "the case number if mentioned"}. Kept to name+description only: the
// extracted value is always treated as a nullable string (matches how
// extractFields' schemas already work for every existing pipeline — see
// quote/complaints/general-pipeline.ts's fieldsSchema), so there's no
// separate "type" concept to validate or coerce.
export const extractionFieldSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_]*$/,
      "Must start with a letter and contain only letters, numbers, and underscores",
    ),
  description: z.string().trim().min(1).max(500),
});

// "customerEmail" is always extracted automatically by the pipeline (see
// acknowledge-reply-pipeline.ts) — reserved so a business can't
// accidentally define a second, conflicting field with the same name.
export const RESERVED_EXTRACTION_FIELD_NAMES = ["customerEmail"];

// Capped, not unbounded — this list is resent as part of the extraction
// prompt on every single run of the category, so an unbounded list is
// both a real token-cost footgun and a sign the category should probably
// be split into two.
export const extractionFieldsSchema = z
  .array(extractionFieldSchema)
  .max(10)
  .refine(
    (fields) => fields.every((f) => !RESERVED_EXTRACTION_FIELD_NAMES.includes(f.name)),
    { message: '"customerEmail" is extracted automatically — no need to add it' },
  )
  .refine((fields) => new Set(fields.map((f) => f.name)).size === fields.length, {
    message: "Field names must be unique",
  });

export type ExtractionFieldConfig = z.infer<typeof extractionFieldSchema>;
