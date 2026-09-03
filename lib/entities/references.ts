import * as entityRecordRepository from "@/lib/entities/entity-record-repository";
import * as entityTypeRepository from "@/lib/entities/entity-type-repository";
import type { EntityFieldConfig } from "@/lib/entities/schemas";

/**
 * Validation and resolution for `reference` fields — a field whose value
 * is another record's id.
 *
 * A schema can't do this part: it has no database access and, more
 * importantly, no organisation context. A reference that silently pointed
 * at another business's record would be a tenancy hole, so every check
 * here is scoped by organisationId rather than trusting the id alone
 * (CLAUDE.md §13).
 */

export class InvalidReferenceError extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = "InvalidReferenceError";
  }
}

/**
 * Checks every reference value in a record's data: the target type must
 * exist in this organisation, and the referenced record must exist, belong
 * to this organisation, and actually be of the declared type.
 *
 * That last check matters — without it a Customer id could be stored in a
 * field declared to point at Suppliers, and every later resolution would
 * quietly return the wrong shape.
 */
export async function validateReferences(
  organisationId: string,
  fields: EntityFieldConfig[],
  data: Record<string, unknown>,
): Promise<void> {
  for (const field of fields) {
    if (field.type !== "reference") continue;
    const value = data[field.name];
    if (value === undefined || value === null || value === "") continue;

    if (typeof value !== "string") {
      throw new InvalidReferenceError(
        field.name,
        `${field.name} must reference a record by id.`,
      );
    }

    const targetType = await entityTypeRepository.findEntityTypeByName(
      organisationId,
      field.recordType,
    );
    if (!targetType) {
      throw new InvalidReferenceError(
        field.name,
        `${field.name} points at record type "${field.recordType}", which doesn't exist.`,
      );
    }

    const record = await entityRecordRepository.findRecordById(
      organisationId,
      value,
    );
    if (!record) {
      throw new InvalidReferenceError(
        field.name,
        `${field.name} references a record that doesn't exist.`,
      );
    }
    if (record.entityTypeId !== targetType.id) {
      throw new InvalidReferenceError(
        field.name,
        `${field.name} must reference a ${field.recordType} record.`,
      );
    }
  }
}

export interface ResolvedReference {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

/**
 * Replaces reference ids with the referenced record itself, so an agent
 * reading an Order sees `{order.customer.data.name}` rather than an opaque
 * id it would have to make a second lookup for.
 *
 * Deliberately one level deep — no recursion. A reference chain could
 * cycle (Order → Customer → Order), and resolving depth-first would both
 * hang and balloon the prompt. One level is what a step's interpolation
 * actually needs; anything deeper is an explicit second `lookup` step.
 */
export async function resolveReferences(
  organisationId: string,
  fields: EntityFieldConfig[],
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const resolved: Record<string, unknown> = { ...data };

  for (const field of fields) {
    if (field.type !== "reference") continue;
    const value = data[field.name];
    if (typeof value !== "string" || value === "") continue;

    const record = await entityRecordRepository.findRecordById(
      organisationId,
      value,
    );
    if (!record) {
      // A dangling reference resolves to null rather than throwing: the
      // target may have been deleted since, and a read shouldn't fail
      // because of it. Writes are what validateReferences guards.
      resolved[field.name] = null;
      continue;
    }
    resolved[field.name] = {
      id: record.id,
      type: field.recordType,
      data: record.data as Record<string, unknown>,
    } satisfies ResolvedReference;
  }

  return resolved;
}
