import * as customerRepository from "@/lib/customers/customer-repository";
import * as entityRecordRepository from "@/lib/entities/entity-record-repository";
import * as entityTypeRepository from "@/lib/entities/entity-type-repository";
import * as productRepository from "@/lib/products/product-repository";

/**
 * One uniform shape for every record an agent can read, whether it came
 * from a built-in table (Product/Customer) or a business-defined
 * CustomEntityType. This is the whole point of the module: tools speak
 * "record type + fields", never "which table".
 *
 * `data` is deliberately a flat string-keyed bag rather than a typed
 * per-source shape — an agent gets the same envelope regardless of where
 * the row lives, so when Product/Customer eventually become ordinary
 * seeded record types (CLAUDE.md §7), the tool layer above this does not
 * change at all. That migration is a swap inside `readBuiltIn`, nothing
 * more.
 */
export interface ResolvedRecord {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

// Built-in record types, matched case-insensitively so an LLM writing
// "product" instead of "Product" still resolves. These are not privileged
// concepts — they are record types that happen to have real columns today
// because they predate CustomEntityType (CLAUDE.md §4.3).
const BUILT_IN_TYPES = ["Customer", "Product"] as const;
type BuiltInType = (typeof BUILT_IN_TYPES)[number];

function resolveBuiltIn(typeName: string): BuiltInType | null {
  return (
    BUILT_IN_TYPES.find(
      (t) => t.toLowerCase() === typeName.trim().toLowerCase(),
    ) ?? null
  );
}

function customerToRecord(c: {
  id: string;
  name: string;
  email: string;
  company: string;
}): ResolvedRecord {
  return {
    id: c.id,
    type: "Customer",
    data: { name: c.name, email: c.email, company: c.company },
  };
}

function productToRecord(p: {
  id: string;
  sku: string;
  name: string;
  unitPrice: number;
  stockQuantity: number;
}): ResolvedRecord {
  return {
    id: p.id,
    type: "Product",
    // stockQuantity is exposed as an ordinary field rather than through a
    // separate "check stock" tool — availability is a property of the
    // product, not a distinct capability (CLAUDE.md §4.5).
    data: {
      sku: p.sku,
      name: p.name,
      unitPrice: p.unitPrice,
      stockQuantity: p.stockQuantity,
    },
  };
}

/**
 * Every record type name this organisation can address, built-ins first.
 * Used to give a caller a real list when it names a type that does not
 * exist — an LLM guessing "Jobs" instead of "Job" gets told what is
 * actually available rather than a bare "not found".
 */
export async function listRecordTypeNames(
  organisationId: string,
): Promise<string[]> {
  const custom =
    await entityTypeRepository.findEntityTypesByOrganisation(organisationId);
  return [...BUILT_IN_TYPES, ...custom.map((t) => t.name)];
}

async function findBuiltInByField(
  organisationId: string,
  type: BuiltInType,
  field: string,
  value: string,
): Promise<ResolvedRecord | null> {
  const wanted = value.trim().toLowerCase();

  if (type === "Customer") {
    if (field === "id") {
      const all =
        await customerRepository.findCustomersByOrganisation(organisationId);
      const hit = all.find((c) => c.id === value);
      return hit ? customerToRecord(hit) : null;
    }
    const candidates = await customerRepository.searchCustomers(
      organisationId,
      value,
    );
    const hit = candidates.find(
      (c) =>
        String(customerToRecord(c).data[field] ?? "")
          .trim()
          .toLowerCase() === wanted,
    );
    return hit ? customerToRecord(hit) : null;
  }

  if (field === "id") {
    const product = await productRepository.findProductById(
      organisationId,
      value,
    );
    return product ? productToRecord(product) : null;
  }
  const candidates = await productRepository.searchProducts(
    organisationId,
    value,
  );
  const hit = candidates.find(
    (p) =>
      String(productToRecord(p).data[field] ?? "")
        .trim()
        .toLowerCase() === wanted,
  );
  return hit ? productToRecord(hit) : null;
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
  const builtIn = resolveBuiltIn(typeName);
  if (builtIn) {
    return findBuiltInByField(organisationId, builtIn, field, value);
  }

  const type = await entityTypeRepository.findEntityTypeByName(
    organisationId,
    typeName,
  );
  if (!type) {
    throw new UnknownRecordTypeError(typeName);
  }

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
 * Fuzzy multi-record search, for an LLM's free-text guesses. Capped
 * per-source (5 for custom records, first match onward for built-ins) —
 * this feeds a prompt, not a results page.
 */
export async function searchRecords(
  organisationId: string,
  typeName: string,
  query: string,
): Promise<ResolvedRecord[]> {
  const builtIn = resolveBuiltIn(typeName);
  if (builtIn === "Customer") {
    const rows = await customerRepository.searchCustomers(
      organisationId,
      query,
    );
    return rows.slice(0, 5).map(customerToRecord);
  }
  if (builtIn === "Product") {
    const rows = await productRepository.searchProducts(organisationId, query);
    return rows.slice(0, 5).map(productToRecord);
  }

  const type = await entityTypeRepository.findEntityTypeByName(
    organisationId,
    typeName,
  );
  if (!type) {
    throw new UnknownRecordTypeError(typeName);
  }

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
 * Raised when a write is attempted against a built-in record type.
 *
 * Reads work uniformly across built-in and custom types, but writes do
 * not yet: Product/Customer have real typed columns (notably
 * `Product.unitPrice`, a Decimal) that an untyped `Record<string,
 * unknown>` cannot safely populate — coercing a model-supplied string
 * into a money column is exactly the kind of silent corruption this
 * codebase avoids elsewhere. Refused loudly rather than half-supported.
 *
 * This asymmetry disappears when Product/Customer become ordinary seeded
 * record types, which is gated on typed Record Type fields landing first
 * (CLAUDE.md §4.3 and §7). Until then a human creates these in the
 * Catalog UI.
 */
export class BuiltInRecordTypeError extends Error {
  constructor(public readonly typeName: string) {
    super(
      `"${typeName}" is a built-in record type and can't be written to by an agent yet — add or edit it in the Catalog instead.`,
    );
    this.name = "BuiltInRecordTypeError";
  }
}

/**
 * Turns a record-type failure into a message worth showing a model,
 * appending the list of types that actually exist when it named one that
 * doesn't. Returns null for anything else, so callers rethrow genuine
 * faults instead of reporting them as ordinary tool errors.
 *
 * Shared by all four record tools — without it each repeats the same
 * catch block, and they drift.
 */
export async function describeRecordTypeError(
  organisationId: string,
  error: unknown,
): Promise<string | null> {
  if (error instanceof UnknownRecordTypeError) {
    const available = await listRecordTypeNames(organisationId);
    return `${error.message} Available record types: ${available.join(", ")}.`;
  }
  if (error instanceof BuiltInRecordTypeError) {
    return error.message;
  }
  return null;
}

/**
 * Resolves a record type that an agent may write to, rejecting both
 * unknown names and (for now) built-in types. Shared by create_record and
 * update_record so the two cannot drift apart on which types are
 * writable.
 */
export async function resolveWritableType(
  organisationId: string,
  typeName: string,
): Promise<{ id: string; name: string }> {
  if (resolveBuiltIn(typeName)) {
    throw new BuiltInRecordTypeError(typeName);
  }
  const type = await entityTypeRepository.findEntityTypeByName(
    organisationId,
    typeName,
  );
  if (!type) {
    throw new UnknownRecordTypeError(typeName);
  }
  return { id: type.id, name: type.name };
}
