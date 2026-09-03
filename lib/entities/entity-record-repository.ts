import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

export function findRecordsByEntityType(
  organisationId: string,
  entityTypeId: string,
) {
  return prisma.customEntityRecord.findMany({
    where: { organisationId, entityTypeId },
    orderBy: { createdAt: "desc" },
  });
}

export function findRecordById(organisationId: string, recordId: string) {
  return prisma.customEntityRecord.findFirst({
    where: { id: recordId, organisationId },
  });
}

export function createRecord(
  organisationId: string,
  entityTypeId: string,
  data: Prisma.InputJsonValue,
) {
  return prisma.customEntityRecord.create({
    data: { organisationId, entityTypeId, data },
  });
}

// deleteMany, org-scoped — same safety idiom as
// entity-type-repository.ts's deleteEntityType.
export function deleteRecord(organisationId: string, recordId: string) {
  return prisma.customEntityRecord.deleteMany({
    where: { id: recordId, organisationId },
  });
}

// Merges into the existing data blob rather than replacing it — an update
// almost always means "this one field changed" (e.g. status), not "here is
// the complete record again." A caller that genuinely wants to drop a
// field can still do so by passing an explicit `null`/undefined for it.
export async function updateRecordData(
  organisationId: string,
  recordId: string,
  patch: Record<string, unknown>,
) {
  const existing = await prisma.customEntityRecord.findFirst({
    where: { id: recordId, organisationId },
  });
  if (!existing) return null;
  const merged = {
    ...(existing.data as Record<string, unknown>),
    ...patch,
  } as Prisma.InputJsonValue;
  return prisma.customEntityRecord.update({
    where: { id: recordId },
    data: { data: merged },
  });
}

// An exact match on one field's value — distinct from searchRecords'
// fuzzy ILIKE-across-everything, which is built for an LLM's free-text
// guesses, not for deterministic code that needs to reliably find "the
// record where jobId is exactly this" before deciding create vs. update.
export async function findRecordByFieldValue(
  organisationId: string,
  entityTypeId: string,
  fieldName: string,
  value: string,
) {
  const rows = await prisma.$queryRaw<{ id: string; data: Prisma.JsonValue }[]>`
    SELECT "id", "data"
    FROM "CustomEntityRecord"
    WHERE "organisationId" = ${organisationId}
      AND "entityTypeId" = ${entityTypeId}
      AND "data"->>${fieldName} = ${value}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

// A record has no fixed columns to search against — its field names are
// only known at the entity-type level, not to the database schema. A raw
// substring match against the JSON's own text representation is the
// simplest thing that works at this scale (a business's own custom
// records, not a general search problem); revisit only if that stops
// being true (CLAUDE.md's "don't add infrastructure before there's a
// demonstrated need" — this is the same reasoning that's kept a vector
// database and full-text search off this project so far). Capped to 5,
// matching the built-in record lookups' own "first match wins" style —
// this feeds an LLM prompt, not a UI results page.
export async function searchRecords(
  organisationId: string,
  entityTypeId: string,
  query: string,
) {
  return prisma.$queryRaw<{ id: string; data: Prisma.JsonValue }[]>`
    SELECT "id", "data"
    FROM "CustomEntityRecord"
    WHERE "organisationId" = ${organisationId}
      AND "entityTypeId" = ${entityTypeId}
      AND "data"::text ILIKE ${"%" + query + "%"}
    ORDER BY "createdAt" DESC
    LIMIT 5
  `;
}
