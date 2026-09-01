import { z } from "zod";

// Same {name, description} shape as Agent.extractionFields
// (lib/agents/extraction-fields.ts) — deliberately not shared code with
// that file, since the two have different rules (extraction fields
// reserve "customerEmail"; entity fields don't extract anything, they're
// just what a record looks like) even though the shape happens to match.
export const entityFieldSchema = z.object({
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

export const entityFieldsSchema = z
  .array(entityFieldSchema)
  .min(1, "At least one field is required")
  .max(20)
  .refine(
    (fields) => new Set(fields.map((f) => f.name)).size === fields.length,
    {
      message: "Field names must be unique",
    },
  );

export type EntityFieldConfig = z.infer<typeof entityFieldSchema>;

export const entityTypeInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  fields: entityFieldsSchema,
});

export type EntityTypeInput = z.infer<typeof entityTypeInputSchema>;

// A record's shape isn't known until its entity type's own fields are —
// unlike extraction fields (always optional/nullable, since the LLM might
// not find a given fact in the message), a record is a human filling in a
// form, so every field is required here, same precedent as Product/
// Customer's own required fields.
export function buildRecordDataSchema(fields: EntityFieldConfig[]) {
  const shape: Record<string, z.ZodType<string>> = {};
  for (const field of fields) {
    shape[field.name] = z.string().trim().min(1, `${field.name} is required`);
  }
  return z.object(shape);
}
