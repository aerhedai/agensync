import { clerkClient } from "@clerk/nextjs/server";

import * as organisationRepository from "@/lib/organisations/organisation-repository";
import type {
  LegalLinksInput,
  OrganisationInput,
} from "@/lib/organisations/schemas";

export function updateOrganisation(id: string, input: OrganisationInput) {
  return organisationRepository.updateOrganisation(id, input);
}

export function updateLegalLinks(id: string, input: LegalLinksInput) {
  return organisationRepository.updateLegalLinks(id, input);
}

// Local data first, Clerk organisation second — if the Clerk call fails
// partway through, the worst case is a still-existing Clerk org with an
// already-empty local record (recoverable), not local data orphaned under
// an org id Clerk no longer knows about (unreachable — every page resolves
// org context through Clerk's session, see current-organisation.ts).
export async function deleteOrganisation(
  organisationId: string,
  clerkOrgId: string,
) {
  await organisationRepository.deleteOrganisationCascade(organisationId);
  const client = await clerkClient();
  await client.organizations.deleteOrganization(clerkOrgId);
}
