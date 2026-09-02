"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import * as entityTypeService from "@/lib/entities/entity-type-service";
import { entityTypeInputSchema } from "@/lib/entities/schemas";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";

export type EntityTypeFormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

// Shared by create and update — both forms submit the same {name,
// fieldName[], fieldDescription[]} shape (see EntityTypeForm).
function parseEntityTypeFormData(formData: FormData) {
  const fieldNames = formData.getAll("fieldName");
  const fieldDescriptions = formData.getAll("fieldDescription");
  const fields = fieldNames.map((name, i) => ({
    name: typeof name === "string" ? name : "",
    description:
      typeof fieldDescriptions[i] === "string"
        ? (fieldDescriptions[i] as string)
        : "",
  }));

  return entityTypeInputSchema.safeParse({
    name: formData.get("name"),
    fields,
  });
}

export async function createEntityTypeAction(
  _prevState: EntityTypeFormState,
  formData: FormData,
): Promise<EntityTypeFormState> {
  const parsed = parseEntityTypeFormData(formData);
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

// Existing records keep whatever data they already have under a field
// that's since been removed or renamed here — same "data outlives schema"
// behavior already used throughout the custom-entity system (e.g.
// updateRecordData's merge semantics), rather than trying to migrate or
// strip existing record data to match the edited field list.
export async function updateEntityTypeAction(
  id: string,
  _prevState: EntityTypeFormState,
  formData: FormData,
): Promise<EntityTypeFormState> {
  const parsed = parseEntityTypeFormData(formData);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const organisation = await getCurrentOrganisation();
  let updated: boolean;
  try {
    updated = await entityTypeService.updateEntityType(
      organisation.id,
      id,
      parsed.data,
    );
  } catch {
    return { error: "An entity type with that name already exists." };
  }
  if (!updated) {
    notFound();
  }
  redirect(`/catalog/entities/${id}`);
}

// Cascades to every record of this type — see schema.prisma's
// onDelete: Cascade comment.
export async function deleteEntityTypeAction(id: string) {
  const organisation = await getCurrentOrganisation();
  const deleted = await entityTypeService.deleteEntityType(organisation.id, id);
  if (!deleted) {
    notFound();
  }
  revalidatePath("/catalog/entities");
  redirect("/catalog/entities");
}
