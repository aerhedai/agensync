import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";

/**
 * Database access for the knowledge base.
 *
 * The embedding column is `Unsupported("vector(768)")` in schema.prisma —
 * Prisma can create and index it but cannot read or write it — so every
 * statement touching it is raw SQL here. That is contained to this file
 * deliberately: nothing above the repository layer should know the
 * storage is a vector column rather than an ordinary one.
 *
 * Every query is scoped by organisationId, including the similarity search
 * — a vector index will happily return the nearest neighbour from another
 * business's documents if you let it (CLAUDE.md §13).
 */

export interface RetrievedChunk {
  id: string;
  documentId: string;
  documentTitle: string;
  content: string;
  /** 0–1, higher is better. Comparable across the two search strategies. */
  score: number;
}

export function findDocuments(organisationId: string) {
  return prisma.knowledgeDocument.findMany({
    where: { organisationId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { chunks: true } } },
  });
}

export function findDocumentById(organisationId: string, id: string) {
  return prisma.knowledgeDocument.findFirst({
    where: { id, organisationId },
  });
}

export function createDocument(
  organisationId: string,
  input: { title: string; source: string; content: string },
) {
  return prisma.knowledgeDocument.create({
    data: { organisationId, ...input },
  });
}

export async function deleteDocument(organisationId: string, id: string) {
  // Chunks cascade (see schema.prisma) — deleting the document is enough.
  const { count } = await prisma.knowledgeDocument.deleteMany({
    where: { id, organisationId },
  });
  return count > 0;
}

/** Removes a document's chunks so it can be re-chunked and re-embedded. */
export function deleteChunksForDocument(documentId: string) {
  return prisma.knowledgeChunk.deleteMany({ where: { documentId } });
}

/**
 * Inserts chunks with their embeddings. Raw SQL because of the vector
 * column, parameterised throughout — the content is a business's own
 * document text and must never be concatenated into the statement.
 */
export async function insertChunks(
  organisationId: string,
  documentId: string,
  chunks: { position: number; content: string; embedding: number[] }[],
): Promise<void> {
  for (const chunk of chunks) {
    await prisma.$executeRaw`
      INSERT INTO "KnowledgeChunk" ("id", "documentId", "organisationId", "position", "content", "embedding", "createdAt")
      VALUES (
        gen_random_uuid()::text,
        ${documentId},
        ${organisationId},
        ${chunk.position},
        ${chunk.content},
        ${`[${chunk.embedding.join(",")}]`}::vector,
        NOW()
      )
    `;
  }
}

/**
 * Semantic search: nearest neighbours by cosine distance.
 *
 * pgvector's `<=>` returns cosine *distance* (0 = identical, 2 = opposite),
 * so it's converted to a 0–1 similarity here to be comparable with the
 * full-text score in hybrid retrieval.
 */
export function searchByEmbedding(
  organisationId: string,
  embedding: number[],
  limit: number,
): Promise<RetrievedChunk[]> {
  const vector = `[${embedding.join(",")}]`;
  return prisma.$queryRaw<RetrievedChunk[]>`
    SELECT
      c."id",
      c."documentId",
      d."title" AS "documentTitle",
      c."content",
      1 - (c."embedding" <=> ${vector}::vector) AS "score"
    FROM "KnowledgeChunk" c
    JOIN "KnowledgeDocument" d ON d."id" = c."documentId"
    WHERE c."organisationId" = ${organisationId}
      AND c."embedding" IS NOT NULL
    ORDER BY c."embedding" <=> ${vector}::vector
    LIMIT ${limit}
  `;
}

/**
 * Keyword search over the same chunks, using Postgres full-text.
 *
 * Kept as a real, equal alternative rather than a fallback: it costs no
 * embedding call, and whether semantic search actually beats it on a given
 * business's content is a question to measure, not assume (CLAUDE.md §18's
 * caution about adding machinery before a demonstrated need).
 *
 * websearch_to_tsquery rather than plain to_tsquery — it accepts ordinary
 * human phrasing ("refund policy for damaged goods") instead of requiring
 * boolean operator syntax, and never throws on punctuation.
 */
export function searchByText(
  organisationId: string,
  query: string,
  limit: number,
): Promise<RetrievedChunk[]> {
  return prisma.$queryRaw<RetrievedChunk[]>`
    SELECT
      c."id",
      c."documentId",
      d."title" AS "documentTitle",
      c."content",
      ts_rank(to_tsvector('english', c."content"), websearch_to_tsquery('english', ${query})) AS "score"
    FROM "KnowledgeChunk" c
    JOIN "KnowledgeDocument" d ON d."id" = c."documentId"
    WHERE c."organisationId" = ${organisationId}
      AND to_tsvector('english', c."content") @@ websearch_to_tsquery('english', ${query})
    ORDER BY "score" DESC
    LIMIT ${limit}
  `;
}

export function countChunks(organisationId: string) {
  return prisma.knowledgeChunk.count({ where: { organisationId } });
}

// Re-exported so callers can catch a genuinely unavailable extension
// distinctly from an ordinary query failure.
export { Prisma };
