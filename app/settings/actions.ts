"use server";

import { revalidatePath } from "next/cache";

import * as integrationService from "@/lib/integrations/integration-service";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";
import * as organisationService from "@/lib/organisations/organisation-service";
import { organisationInputSchema } from "@/lib/organisations/schemas";

export async function disconnectIntegrationAction(integrationId: string) {
  const organisation = await getCurrentOrganisation();
  await integrationService.disconnectIntegration(
    organisation.id,
    integrationId,
  );
  revalidatePath("/settings");
}

export type WebhookAccountFormState = {
  error?: string;
  // Only ever set once, in the response to the request that created it —
  // never re-fetched or persisted anywhere the client can read it again.
  created?: { integrationId: string; secret: string };
};

export async function createWebhookAccountAction(
  _prevState: WebhookAccountFormState,
  formData: FormData,
): Promise<WebhookAccountFormState> {
  const name = formData.get("name");
  if (typeof name !== "string" || name.trim().length === 0) {
    return { error: "Name is required." };
  }

  const organisation = await getCurrentOrganisation();

  // Unlike Gmail, where "same name" (the connected email) genuinely means
  // "the same account, safe to refresh" — a webhook's name is just a
  // free-text label a business typed. Reusing upsertIntegration's
  // same-name-overwrites semantics here unchecked would let a duplicate
  // name silently regenerate another account's secret instead of creating
  // a new one, with no warning.
  const existing = await integrationService.listIntegrationsByProvider(
    organisation.id,
    "webhook",
  );
  if (existing.some((i) => i.name === name.trim())) {
    return {
      error: `An account named "${name.trim()}" already exists — pick a different name.`,
    };
  }

  const { integration, secret } =
    await integrationService.connectWebhookAccount(
      organisation.id,
      name.trim(),
    );
  revalidatePath("/settings");
  return { created: { integrationId: integration.id, secret } };
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
