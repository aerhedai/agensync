"use server";

import { redirect } from "next/navigation";

import * as entityTypeService from "@/lib/entities/entity-type-service";
import { entityTypeInputSchema } from "@/lib/entities/schemas";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";

export type EntityTypeFormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function createEntityTypeAction(
  _prevState: EntityTypeFormState,
  formData: FormData,
): Promise<EntityTypeFormState> {
  const fieldNames = formData.getAll("fieldName");
  const fieldDescriptions = formData.getAll("fieldDescription");
  const fields = fieldNames.map((name, i) => ({
    name: typeof name === "string" ? name : "",
    description:
      typeof fieldDescriptions[i] === "string"
        ? (fieldDescriptions[i] as string)
        : "",
  }));

  const parsed = entityTypeInputSchema.safeParse({
    name: formData.get("name"),
    fields,
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const organisation = await getCurrentOrganisation();
  let entityTypeId: string;
  try {
    const entityType = await entityTypeService.createEntityType(
      organisation.id,
      parsed.data,
    );
    entityTypeId = entityType.id;
  } catch {
    return { error: "An entity type with that name already exists." };
  }
  redirect(`/catalog/entities/${entityTypeId}`);
}
