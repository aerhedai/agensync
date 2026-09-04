import type { Prisma } from "@/lib/generated/prisma/client";
import * as entityRecordRepository from "@/lib/entities/entity-record-repository";
import * as entityTypeRepository from "@/lib/entities/entity-type-repository";
import {
  resolveReferences,
  validateReferences,
} from "@/lib/entities/references";
import { coerceRecordData, entityFieldsSchema } from "@/lib/entities/schemas";

export function listRecords(organisationId: string, entityTypeId: string) {
  return entityRecordRepository.findRecordsByEntityType(
    organisationId,
    entityTypeId,
  );
}

export function getRecord(organisationId: string, recordId: string) {
  return entityRecordRepository.findRecordById(organisationId, recordId);
}

// The edit form always submits every field the entity type currently
// defines, so this "merge" is a full replace for those fields in
// practice — any data under a field the type no longer defines (see
// entity-type-service.ts's updateEntityType) is left untouched, same
// "data outlives schema" behavior as everywhere else in this system.
export function updateRecord(
  organisationId: string,
  recordId: string,
  data: Record<string, unknown>,
) {
  return entityRecordRepository.updateRecordData(
    organisationId,
    recordId,
    data,
  );
}

// Validation against the entity type's own dynamic field schema happens
// at the call site (the record's shape depends on DB state, not
// something this thin a layer should own) — see
// app/catalog/[id]/actions.ts and
// lib/entities/schemas.ts's buildRecordDataSchema.
export function createRecord(
  organisationId: string,
  entityTypeId: string,
  data: Prisma.InputJsonValue,
) {
  return entityRecordRepository.createRecord(
    organisationId,
    entityTypeId,
    data,
  );
}

export async function deleteRecord(
  organisationId: string,
  recordId: string,
): Promise<boolean> {
  const { count } = await entityRecordRepository.deleteRecord(
    organisationId,
    recordId,
  );
  return count > 0;
}

/**
 * Loads a record type's parsed field definitions, or null if it doesn't
 * exist in this organisation. Shared by the reference-aware helpers below
 * so each doesn't repeat the lookup-and-parse.
 */
async function fieldsForType(organisationId: string, entityTypeId: string) {
  const type = await entityTypeRepository.findEntityTypeById(
    organisationId,
    entityTypeId,
  );
  if (!type) return null;
  const parsed = entityFieldsSchema.safeParse(type.fields);
  return parsed.success ? parsed.data : null;
}

/**
 * Create, rejecting any `reference` field pointing at a record that
 * doesn't exist, belongs to another organisation, or is the wrong type.
 *
 * Separate from createRecord rather than folded into it because the schema
 * layer genuinely can't do this check — it has no database access and no
 * organisation context — so it has to happen here, above the repository
 * (CLAUDE.md §13: a reference must never cross an organisation boundary).
 */
export async function createRecordChecked(
  organisationId: string,
  entityTypeId: string,
  data: Record<string, unknown>,
) {
  const fields = await fieldsForType(organisationId, entityTypeId);
  let values = data;
  if (fields) {
    // Partial on create too, deliberately. The bug being fixed is *type*
    // corruption — a currency field storing the string "12.5". Enforcing
    // required-ness here as well would be a second, riskier change: every
    // field defined before typed fields existed defaults to required:true
    // without anyone having chosen that, so agents already in production
    // that write partial records would start failing on deploy. Tightening
    // this is a deliberate decision to make separately; the Catalog form
    // still enforces required on the human path.
    values = coerceRecordData(fields, data, { partial: true });
    await validateReferences(organisationId, fields, values);
  }
  return entityRecordRepository.createRecord(
    organisationId,
    entityTypeId,
    values as Prisma.InputJsonValue,
  );
}

/** Update, with the same reference checks as createRecordChecked. */
export async function updateRecordChecked(
  organisationId: string,
  recordId: string,
  data: Record<string, unknown>,
) {
  const existing = await entityRecordRepository.findRecordById(
    organisationId,
    recordId,
  );
  if (!existing) return null;
  const fields = await fieldsForType(organisationId, existing.entityTypeId);
  let values = data;
  if (fields) {
    // Partial: an update merges a patch, so requiring every field would mean
    // resending the whole record to change one value.
    values = coerceRecordData(fields, data, { partial: true });
    await validateReferences(organisationId, fields, values);
  }
  return entityRecordRepository.updateRecordData(
    organisationId,
    recordId,
    values,
  );
}

/**
 * Reads a record with its references replaced by the referenced records,
 * so an agent sees {order.customer.data.name} rather than an opaque id it
 * would need a second lookup to make sense of.
 */
export async function getRecordResolved(
  organisationId: string,
  recordId: string,
) {
  const record = await entityRecordRepository.findRecordById(
    organisationId,
    recordId,
  );
  if (!record) return null;
  const fields = await fieldsForType(organisationId, record.entityTypeId);
  if (!fields) return record;
  return {
    ...record,
    data: await resolveReferences(
      organisationId,
      fields,
      record.data as Record<string, unknown>,
    ),
  };
}
