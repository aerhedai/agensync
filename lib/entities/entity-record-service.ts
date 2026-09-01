import type { Prisma } from "@/lib/generated/prisma/client";
import * as entityRecordRepository from "@/lib/entities/entity-record-repository";

export function listRecords(organisationId: string, entityTypeId: string) {
  return entityRecordRepository.findRecordsByEntityType(
    organisationId,
    entityTypeId,
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
