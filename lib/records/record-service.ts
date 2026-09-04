import * as entityRecordRepository from "@/lib/entities/entity-record-repository";
import * as entityTypeRepository from "@/lib/entities/entity-type-repository";

/**
 * One uniform shape for every record an agent can read or write.
 *
 * Tools speak "record type + fields", never "which table" — and as of the
 * catalog collapse there is only one table, so that promise is now
 * structural rather than something this module has to maintain by hand.
 *
 * Product and Customer used to be real Postgres tables handled by a
 * parallel code path here: their own repositories, their own row-to-record
 * mappers, their own branch in every lookup, and a `BuiltInRecordTypeError`
 * that refused agent writes outright. All of that is gone. They are
 * ordinary Record Types seeded from lib/records/starter-record-types.ts,
 * which is what makes them editable, extendable and deletable by the
 * business that owns them (CLAUDE.md §4.3, §7).
 */
export interface ResolvedRecord {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

/**
 * Every record type name this organisation can address.
 *
 * Used to give a caller a real list when it names a type that does not
 * exist — an LLM guessing "Jobs" instead of "Job" gets told what is
 * actually available rather than a bare "not found".
 */
export async function listRecordTypeNames(
  organisationId: string,
): Promise<string[]> {
  const types =
    await entityTypeRepository.findEntityTypesByOrganisation(organisationId);
  return types.map((t) => t.name);
}

/**
 * Resolves a record type by name, case-insensitively.
 *
 * The case-insensitive match is deliberate and predates the collapse: an
 * LLM writing "product" for a type named "Product" is a naming slip, not a
 * different type, and failing on it would strand an agent that is
 * otherwise correct.
 */
async function resolveType(
  organisationId: string,
  typeName: string,
): Promise<{ id: string; name: string }> {
  const exact = await entityTypeRepository.findEntityTypeByName(
    organisationId,
    typeName,
  );
  if (exact) return { id: exact.id, name: exact.name };

  const wanted = typeName.trim().toLowerCase();
  const all =
    await entityTypeRepository.findEntityTypesByOrganisation(organisationId);
  const hit = all.find((t) => t.name.trim().toLowerCase() === wanted);
  if (!hit) {
    throw new UnknownRecordTypeError(typeName);
  }
  return { id: hit.id, name: hit.name };
}

/**
 * Exact single-record lookup — deliberately distinct from searchRecords'
 * fuzzy match. Deterministic pipelines need to reliably resolve "the Job
 * whose jobId is exactly this" before deciding create-vs-update; a fuzzy
 * search cannot make that call safely.
 *
 * Throws for an unknown record type rather than returning "not found":
 * those are different failures, and collapsing them would let a
 * misconfigured agent look like it is working against an empty dataset.
 */
export async function findRecord(
  organisationId: string,
  typeName: string,
  field: string,
  value: string,
): Promise<ResolvedRecord | null> {
  const type = await resolveType(organisationId, typeName);

  const record = await entityRecordRepository.findRecordByFieldValue(
    organisationId,
    type.id,
    field,
    value,
  );
  return record
    ? {
        id: record.id,
        type: type.name,
        data: record.data as Record<string, unknown>,
      }
    : null;
}

/**
 * Fuzzy multi-record search, for an LLM's free-text guesses. Capped by the
 * repository — this feeds a prompt, not a results page.
 */
export async function searchRecords(
  organisationId: string,
  typeName: string,
  query: string,
): Promise<ResolvedRecord[]> {
  const type = await resolveType(organisationId, typeName);

  const rows = await entityRecordRepository.searchRecords(
    organisationId,
    type.id,
    query,
  );
  return rows.map((r) => ({
    id: r.id,
    type: type.name,
    data: r.data as Record<string, unknown>,
  }));
}

/**
 * Distinguishes "you named a type that does not exist" from "that type
 * exists and has no matching row", so tools can return a genuinely
 * actionable message (including what types *do* exist) rather than a
 * misleading empty result.
 */
export class UnknownRecordTypeError extends Error {
  constructor(public readonly typeName: string) {
    super(`No record type named "${typeName}" exists.`);
    this.name = "UnknownRecordTypeError";
  }
}

/**
 * Turns a record-type failure into a message worth showing a model,
 * appending the list of types that actually exist when it named one that
 * doesn't. Returns null for anything else, so callers rethrow genuine
 * faults instead of reporting them as ordinary tool errors.
 *
 * Shared by all four record tools — without it each repeats the same catch
 * block, and they drift.
 */
export async function describeRecordTypeError(
  organisationId: string,
  error: unknown,
): Promise<string | null> {
  if (error instanceof UnknownRecordTypeError) {
    const available = await listRecordTypeNames(organisationId);
    return available.length > 0
      ? `${error.message} Available record types: ${available.join(", ")}.`
      : `${error.message} This business hasn't defined any record types yet.`;
  }
  return null;
}

/**
 * Resolves a record type an agent may write to. Shared by create_record and
 * update_record so the two cannot drift apart on which types are writable.
 *
 * Every record type is writable now. It previously refused Product and
 * Customer, because their real `Decimal`/`Int` columns couldn't be safely
 * populated from an untyped bag a model produced. Typed fields removed that
 * reason — `currency` rounds to 2dp and `number` is validated on write — and
 * the collapse removed the columns.
 */
export async function resolveWritableType(
  organisationId: string,
  typeName: string,
): Promise<{ id: string; name: string }> {
  return resolveType(organisationId, typeName);
}
