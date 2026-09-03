import { z } from "zod";

/**
 * Record Type field definitions.
 *
 * Fields used to be untyped — every value was a required string. That was
 * the single blocker behind several open items: `compute`/`branch` steps
 * can't compare against a number that's stored as text, policies can't
 * express "total over £10,000", and nothing can sort by date or aggregate
 * (docs/agent-step-engine-design.md §4).
 *
 * Storage stays JSON on CustomEntityRecord.data — the reasoning in
 * schema.prisma still holds (a table per business-defined type would mean
 * a migration every time a business adds one). What changed is that the
 * shape is now *validated and coerced* per field type on the way in, so
 * what comes back out has a real type rather than a string that happens to
 * look like a number.
 */

const fieldNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(
    /^[a-zA-Z][a-zA-Z0-9_]*$/,
    "Must start with a letter and contain only letters, numbers, and underscores",
  );

const fieldBase = {
  name: fieldNameSchema,
  description: z.string().trim().min(1).max(500),
  // Defaults true, which is how every field behaved before types existed —
  // so an existing type's fields keep their current validation exactly.
  required: z.boolean().default(true),
};

export const FIELD_TYPES = [
  "text",
  "number",
  "currency",
  "date",
  "boolean",
  "select",
  "reference",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

const typedFieldSchema = z.discriminatedUnion("type", [
  z.object({ ...fieldBase, type: z.literal("text") }),
  z.object({ ...fieldBase, type: z.literal("number") }),
  // Distinct from number so the UI can show a currency symbol and the
  // value can round to 2dp on write — a price silently carrying float
  // dust is a real correctness problem, not a display one.
  z.object({ ...fieldBase, type: z.literal("currency") }),
  z.object({ ...fieldBase, type: z.literal("date") }),
  z.object({ ...fieldBase, type: z.literal("boolean") }),
  // A fixed option list is what makes a status field reliable — free text
  // means "Ready", "ready" and "READY" are three different statuses, which
  // silently breaks any branch or transition keyed on it.
  z.object({
    ...fieldBase,
    type: z.literal("select"),
    options: z.array(z.string().trim().min(1)).min(1).max(50),
  }),
  // Stores the target record's id. `recordType` names which type it points
  // at, so the UI can offer a picker and a lookup can resolve it.
  z.object({
    ...fieldBase,
    type: z.literal("reference"),
    recordType: z.string().trim().min(1),
  }),
]);

/**
 * Existing field definitions predate types and have no `type` key at all.
 * Defaulting them to "text" here rather than migrating the data keeps
 * every existing Record Type working untouched — and "text" is exactly
 * what they behaved as before.
 */
export const entityFieldSchema = z.preprocess((value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (record.type === undefined) return { ...record, type: "text" };
  }
  return value;
}, typedFieldSchema);

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

// Money is rounded on write so a stored price can't carry IEEE-754 dust
// into a later sum. Same reasoning as the step engine's compute operations
// and Product.unitPrice being a Decimal rather than a Float.
function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function schemaForField(field: EntityFieldConfig): z.ZodTypeAny {
  switch (field.type) {
    case "number":
      return z.coerce.number().refine(Number.isFinite, "Must be a number");
    case "currency":
      return z.coerce
        .number()
        .refine(Number.isFinite, "Must be an amount")
        .transform(roundMoney);
    case "boolean":
      // Accepts a form checkbox's "on"/"true" as well as a real boolean,
      // since HTML forms never submit a real boolean.
      return z.preprocess(
        (v) => (v === "on" || v === "true" ? true : v === "false" ? false : v),
        z.boolean(),
      );
    case "date":
      // Normalised to ISO on the way in, so every stored date sorts and
      // compares consistently regardless of what the form submitted.
      return z.coerce
        .date()
        .refine((d) => !Number.isNaN(d.getTime()), "Must be a date")
        .transform((d) => d.toISOString());
    case "select":
      return z.enum(field.options as [string, ...string[]]);
    case "reference":
      // The referenced record's id. Existence is checked at the service
      // layer, which can scope the lookup to the organisation — a schema
      // can't, and a reference that silently points at another business's
      // record would be a tenancy hole.
      return z.string().trim().min(1);
    case "text":
      return z.string().trim().min(1);
  }
}

/**
 * Builds the validator for one Record Type's `data` bag. A record's shape
 * isn't known until its type's own fields are, so this is constructed per
 * type rather than declared statically.
 */
export function buildRecordDataSchema(fields: EntityFieldConfig[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    const base = schemaForField(field);
    shape[field.name] = field.required
      ? base
      : // Optional fields accept absent, empty string (what an untouched
        // form input submits) and null, all normalised to undefined so a
        // blank field isn't stored as "".
        z.preprocess(
          (v) => (v === "" || v === null ? undefined : v),
          base.optional(),
        );
  }
  return z.object(shape);
}
