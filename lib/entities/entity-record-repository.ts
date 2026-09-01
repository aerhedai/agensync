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

export function createRecord(
  organisationId: string,
  entityTypeId: string,
  data: Prisma.InputJsonValue,
) {
  return prisma.customEntityRecord.create({
    data: { organisationId, entityTypeId, data },
  });
}

// A record has no fixed columns to search against — its field names are
// only known at the entity-type level, not to the database schema. A raw
// substring match against the JSON's own text representation is the
// simplest thing that works at this scale (a business's own custom
// records, not a general search problem); revisit only if that stops
// being true (CLAUDE.md's "don't add infrastructure before there's a
// demonstrated need" — this is the same reasoning that's kept a vector
// database and full-text search off this project so far). Capped to 5,
// matching find_customer/find_product's own "first match wins" style —
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
