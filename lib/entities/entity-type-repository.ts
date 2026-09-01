import { prisma } from "@/lib/db/prisma";
import type { EntityTypeInput } from "@/lib/entities/schemas";

export function findEntityTypesByOrganisation(organisationId: string) {
  return prisma.customEntityType.findMany({
    where: { organisationId },
    orderBy: { name: "asc" },
    include: { _count: { select: { records: true } } },
  });
}

export function findEntityTypeById(organisationId: string, id: string) {
  return prisma.customEntityType.findFirst({
    where: { id, organisationId },
  });
}

// Used by the search_custom_entity MCP tool to resolve a name (what a
// pipeline's extractionFields.lookupEntityType stores) into the real row —
// name, not id, because that's what's human-readable in agent config.
export function findEntityTypeByName(organisationId: string, name: string) {
  return prisma.customEntityType.findFirst({
    where: { organisationId, name },
  });
}

export function createEntityType(
  organisationId: string,
  input: EntityTypeInput,
) {
  return prisma.customEntityType.create({
    data: { ...input, organisationId },
  });
}
