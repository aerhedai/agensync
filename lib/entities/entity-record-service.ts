import type { Prisma } from "@/lib/generated/prisma/client";
import * as entityRecordRepository from "@/lib/entities/entity-record-repository";

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
// app/catalog/entities/[id]/actions.ts and
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
