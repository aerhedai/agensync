"use server";

import { revalidatePath } from "next/cache";

import * as integrationService from "@/lib/integrations/integration-service";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";
import * as organisationService from "@/lib/organisations/organisation-service";
import { organisationInputSchema } from "@/lib/organisations/schemas";

export async function disconnectGmailAction() {
  const organisation = await getCurrentOrganisation();
  await integrationService.disconnectGmail(organisation.id);
  revalidatePath("/settings");
}

export type BusinessProfileFormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function updateBusinessProfileAction(
  _prevState: BusinessProfileFormState,
  formData: FormData,
): Promise<BusinessProfileFormState> {
  const parsed = organisationInputSchema.safeParse({
    name: formData.get("name"),
    currency: formData.get("currency"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const organisation = await getCurrentOrganisation();
  await organisationService.updateOrganisation(organisation.id, parsed.data);
  revalidatePath("/settings");
  return {};
}
