import { prisma } from "@/lib/db/prisma";
import type { OrganisationInput } from "@/lib/organisations/schemas";

export function findOrganisationById(id: string) {
  return prisma.organisation.findUnique({ where: { id } });
}

export function updateOrganisation(id: string, input: OrganisationInput) {
  return prisma.organisation.update({
    where: { id },
    data: input,
  });
}
