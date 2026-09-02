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

export async function updateEntityType(
  organisationId: string,
  id: string,
  input: EntityTypeInput,
): Promise<boolean> {
  const { count } = await entityTypeRepository.updateEntityType(
    organisationId,
    id,
    input,
  );
  return count > 0;
}

export async function deleteEntityType(
  organisationId: string,
  id: string,
): Promise<boolean> {
  const { count } = await entityTypeRepository.deleteEntityType(
    organisationId,
    id,
  );
  return count > 0;
}
