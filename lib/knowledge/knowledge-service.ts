import { getAIProvider } from "@/lib/ai/organisation-ai-provider";
import { chunkDocument } from "@/lib/knowledge/chunking";
import * as knowledgeRepository from "@/lib/knowledge/knowledge-repository";
import type { RetrievedChunk } from "@/lib/knowledge/knowledge-repository";

/**
 * Ingestion and retrieval for a business's own knowledge.
 *
 * Why this exists at all: before it, the only place for "how this business
 * does things" was Agent.instructions, which is concatenated into every
 * single LLM call. Guidance therefore got linearly more expensive as it
 * grew. Retrieval carries only the few chunks a given run actually needs,
 * so cost stays flat as the knowledge base grows — this is a token *win*,
 * not a new cost.
 */

// nomic-embed-text: 768 dimensions, matching the vector column. Fixed
// rather than configurable because changing it invalidates every stored
// embedding — a different model would need a re-embed of everything, which
// is a migration, not a setting.
export const EMBEDDING_MODEL = "nomic-embed-text";

export class EmbeddingUnavailableError extends Error {
  constructor() {
    super(
      "This organisation's AI provider doesn't support embeddings, so knowledge can't be indexed or searched.",
    );
    this.name = "EmbeddingUnavailableError";
  }
}

async function embed(
  organisationId: string,
  inputs: string[],
): Promise<number[][]> {
  const provider = await getAIProvider(organisationId);
  if (!provider.generateEmbedding) {
    throw new EmbeddingUnavailableError();
  }
  const { embeddings } = await provider.generateEmbedding({
    model: EMBEDDING_MODEL,
    input: inputs,
  });
  return embeddings;
}

export function listDocuments(organisationId: string) {
  return knowledgeRepository.findDocuments(organisationId);
}

export function deleteDocument(organisationId: string, id: string) {
  return knowledgeRepository.deleteDocument(organisationId, id);
}

/**
 * Stores a document, splits it, embeds every chunk in one batched call,
 * and writes the chunks.
 *
 * The original text is kept on the document alongside its chunks, so a
 * later change to the chunking strategy can re-split what's already there
 * rather than asking the business to paste it again.
 */
export async function addDocument(
  organisationId: string,
  input: { title: string; content: string; source?: string },
): Promise<{ documentId: string; chunkCount: number }> {
  const chunks = chunkDocument(input.content);
  if (chunks.length === 0) {
    throw new Error("This document has no text to index.");
  }

  // Embedded before the document row is created, so a provider failure
  // leaves nothing half-written for a business to clean up.
  const embeddings = await embed(
    organisationId,
    chunks.map((c) => c.content),
  );

  const document = await knowledgeRepository.createDocument(organisationId, {
    title: input.title,
    source: input.source ?? "pasted",
    content: input.content,
  });

  await knowledgeRepository.insertChunks(
    organisationId,
    document.id,
    chunks.map((chunk, i) => ({
      ...chunk,
      embedding: embeddings[i] ?? [],
    })),
  );

  return { documentId: document.id, chunkCount: chunks.length };
}

export interface SearchOptions {
  limit?: number;
  /**
   * "hybrid" (default) runs both and merges; "semantic" and "keyword"
   * exist so the two can be compared directly on real content rather than
   * assuming which wins.
   */
  strategy?: "hybrid" | "semantic" | "keyword";
}

/**
 * Merges two ranked lists using reciprocal rank fusion.
 *
 * RRF rather than adding the raw scores: cosine similarity and ts_rank are
 * on completely different scales, so summing them would let whichever
 * happens to produce bigger numbers dominate regardless of how good its
 * ranking actually was. RRF uses only each result's *position* in its own
 * list, which is what makes the two comparable at all.
 */
function fuse(lists: RetrievedChunk[][], limit: number): RetrievedChunk[] {
  const K = 60; // standard RRF damping constant
  const scores = new Map<string, { chunk: RetrievedChunk; score: number }>();

  for (const list of lists) {
    list.forEach((chunk, index) => {
      const existing = scores.get(chunk.id);
      const contribution = 1 / (K + index + 1);
      if (existing) {
        existing.score += contribution;
      } else {
        scores.set(chunk.id, { chunk, score: contribution });
      }
    });
  }

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ chunk, score }) => ({ ...chunk, score }));
}

export async function search(
  organisationId: string,
  query: string,
  options: SearchOptions = {},
): Promise<RetrievedChunk[]> {
  const limit = options.limit ?? 4;
  const strategy = options.strategy ?? "hybrid";

  if (strategy === "keyword") {
    return knowledgeRepository.searchByText(organisationId, query, limit);
  }

  const [queryEmbedding] = await embed(organisationId, [query]);
  if (!queryEmbedding) return [];

  if (strategy === "semantic") {
    return knowledgeRepository.searchByEmbedding(
      organisationId,
      queryEmbedding,
      limit,
    );
  }

  // Over-fetch each side before fusing: a chunk ranked 5th semantically and
  // 5th by keyword can legitimately beat one ranked 1st by only one of
  // them, and it can't if each list was already truncated to `limit`.
  const overFetch = limit * 3;
  const [semantic, keyword] = await Promise.all([
    knowledgeRepository.searchByEmbedding(
      organisationId,
      queryEmbedding,
      overFetch,
    ),
    knowledgeRepository.searchByText(organisationId, query, overFetch),
  ]);

  return fuse([semantic, keyword], limit);
}
