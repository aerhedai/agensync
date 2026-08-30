import * as organisationRepository from "@/lib/organisations/organisation-repository";
import type { OrganisationInput } from "@/lib/organisations/schemas";

export function updateOrganisation(id: string, input: OrganisationInput) {
  return organisationRepository.updateOrganisation(id, input);
}
