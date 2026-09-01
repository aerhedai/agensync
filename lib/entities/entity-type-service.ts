import * as entityTypeRepository from "@/lib/entities/entity-type-repository";
import type { EntityTypeInput } from "@/lib/entities/schemas";

export function listEntityTypes(organisationId: string) {
  return entityTypeRepository.findEntityTypesByOrganisation(organisationId);
}

export function getEntityType(organisationId: string, id: string) {
  return entityTypeRepository.findEntityTypeById(organisationId, id);
}

export function createEntityType(
  organisationId: string,
  input: EntityTypeInput,
) {
  return entityTypeRepository.createEntityType(organisationId, input);
}
