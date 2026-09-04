import * as entityTypeRepository from "@/lib/entities/entity-type-repository";
import { entityTypeInputSchema } from "@/lib/entities/schemas";
import { STARTER_RECORD_TYPES } from "@/lib/records/starter-record-types";

/**
 * Seeds Product and Customer as ordinary Record Types for an organisation.
 *
 * Called when the "Email Handling" template is provisioned, because its
 * Quote agent looks records up by type name and would otherwise reference
 * types that don't exist. This is a template bringing its Record Types with
 * it (CLAUDE.md §6), not the platform deciding every business sells
 * products.
 *
 * Skips any name the business already has, rather than overwriting: a
 * business that has renamed a field on its Product type, or defined its own
 * type that happens to be called Product, must not have that quietly
 * reverted on the next provisioning run — and provisioning is deliberately
 * re-runnable.
 *
 * Returns the names actually created, so a caller can tell "seeded" from
 * "already there" instead of guessing.
 */
export async function seedStarterRecordTypes(
  organisationId: string,
): Promise<string[]> {
  const created: string[] = [];

  for (const definition of STARTER_RECORD_TYPES) {
    const existing = await entityTypeRepository.findEntityTypeByName(
      organisationId,
      definition.name,
    );
    if (existing) continue;

    // Parsed rather than passed straight through, so a malformed starter
    // definition fails here instead of producing a record type whose own
    // records can never validate against it.
    const parsed = entityTypeInputSchema.parse(definition);
    await entityTypeRepository.createEntityType(organisationId, parsed);
    created.push(parsed.name);
  }

  return created;
}
