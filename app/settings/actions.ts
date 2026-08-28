"use server";

import { revalidatePath } from "next/cache";

import * as integrationService from "@/lib/integrations/integration-service";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";

export async function disconnectGmailAction() {
  const organisation = await getCurrentOrganisation();
  await integrationService.disconnectGmail(organisation.id);
  revalidatePath("/settings");
}
