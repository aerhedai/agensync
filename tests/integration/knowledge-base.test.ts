import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import * as knowledgeRepository from "@/lib/knowledge/knowledge-repository";
import { chunkDocument } from "@/lib/knowledge/chunking";

/**
 * Exercises the real pgvector column, the real HNSW index and the real
 * full-text index — the parts that can't be unit tested because they're
 * database behaviour, not application logic.
 *
 * Embeddings are deterministic stand-ins rather than real model output: the
 * point here is that storage, scoping and ranking work, and depending on a
 * live Ollama host would make this fail for reasons unrelated to what it
 * tests. Whether real embeddings retrieve *well* is a measurement question,
 * not a correctness one.
 */

// A trivial deterministic embedding: one hot-ish dimension per keyword, so
// "refund" queries land near "refund" chunks and far from unrelated ones.
function stubEmbedding(text: string): number[] {
  const vector = new Array<number>(768).fill(0);
  const keywords = ["refund", "delivery", "warranty", "invoice"];
  keywords.forEach((keyword, index) => {
    if (text.toLowerCase().includes(keyword)) vector[index] = 1;
  });
  // Never all-zero: cosine distance is undefined against a zero vector.
  vector[700] = 0.01;
  return vector;
}

describe("knowledge base", () => {
  const organisationId = "test-org-knowledge";
  const otherOrganisationId = "test-org-knowledge-other";

  async function addDoc(
    orgId: string,
    title: string,
    content: string,
  ): Promise<string> {
    const doc = await knowledgeRepository.createDocument(orgId, {
      title,
      source: "pasted",
      content,
    });
    const chunks = chunkDocument(content);
    await knowledgeRepository.insertChunks(
      orgId,
      doc.id,
      chunks.map((c) => ({ ...c, embedding: stubEmbedding(c.content) })),
    );
    return doc.id;
  }

  beforeAll(async () => {
    for (const id of [organisationId, otherOrganisationId]) {
      await prisma.organisation.create({
        data: { id, clerkOrgId: id, name: id, currency: "GBP" },
      });
    }

    await addDoc(
      organisationId,
      "Returns Policy",
      "Customers may request a refund within 30 days of delivery. A refund is issued to the original payment method.",
    );
    await addDoc(
      organisationId,
      "Delivery Terms",
      "Standard delivery takes three to five working days. Delivery to the Highlands may take longer.",
    );
    // Same wording, different organisation — the isolation fixture.
    await addDoc(
      otherOrganisationId,
      "Someone Else's Returns Policy",
      "Customers may request a refund within 30 days of delivery.",
    );
  });

  afterAll(async () => {
    const ids = [organisationId, otherOrganisationId];
    await prisma.knowledgeChunk.deleteMany({
      where: { organisationId: { in: ids } },
    });
    await prisma.knowledgeDocument.deleteMany({
      where: { organisationId: { in: ids } },
    });
    await prisma.organisation.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it("stores chunks with a real vector embedding", async () => {
    const count = await knowledgeRepository.countChunks(organisationId);
    expect(count).toBeGreaterThan(0);

    // Proves the vector column round-tripped: a similarity search can only
    // return rows whose embedding is non-null and correctly typed.
    const results = await knowledgeRepository.searchByEmbedding(
      organisationId,
      stubEmbedding("refund"),
      5,
    );
    expect(results.length).toBeGreaterThan(0);
  });

  it("ranks the semantically closest chunk first", async () => {
    const results = await knowledgeRepository.searchByEmbedding(
      organisationId,
      stubEmbedding("refund"),
      5,
    );
    expect(results[0]?.documentTitle).toBe("Returns Policy");
  });

  it("never returns another organisation's chunks from a vector search", async () => {
    // A vector index will happily hand back the nearest neighbour from
    // anyone's documents if the query isn't scoped — this is a real
    // boundary, not a formality.
    const results = await knowledgeRepository.searchByEmbedding(
      organisationId,
      stubEmbedding("refund"),
      20,
    );
    expect(
      results.every((r) => r.documentTitle !== "Someone Else's Returns Policy"),
    ).toBe(true);
  });

  it("finds chunks by keyword through full-text search", async () => {
    const results = await knowledgeRepository.searchByText(
      organisationId,
      "refund within 30 days",
      5,
    );
    expect(results[0]?.documentTitle).toBe("Returns Policy");
  });

  it("accepts ordinary human phrasing in full-text search without throwing", async () => {
    // websearch_to_tsquery rather than to_tsquery precisely so punctuation
    // and plain phrasing don't error the way boolean syntax would.
    await expect(
      knowledgeRepository.searchByText(
        organisationId,
        "what's the refund policy for damaged goods?",
        5,
      ),
    ).resolves.toBeDefined();
  });

  it("scopes full-text search to the organisation too", async () => {
    const results = await knowledgeRepository.searchByText(
      organisationId,
      "refund",
      20,
    );
    expect(
      results.every((r) => r.documentTitle !== "Someone Else's Returns Policy"),
    ).toBe(true);
  });

  it("deletes a document's chunks with it, rather than orphaning them", async () => {
    const docId = await addDoc(
      organisationId,
      "Temporary Warranty Note",
      "Warranty claims are handled by the supplier.",
    );
    const before = await knowledgeRepository.countChunks(organisationId);

    const deleted = await knowledgeRepository.deleteDocument(
      organisationId,
      docId,
    );
    expect(deleted).toBe(true);

    const after = await knowledgeRepository.countChunks(organisationId);
    expect(after).toBeLessThan(before);
  });

  it("refuses to delete another organisation's document", async () => {
    const [foreign] =
      await knowledgeRepository.findDocuments(otherOrganisationId);
    const deleted = await knowledgeRepository.deleteDocument(
      organisationId,
      foreign!.id,
    );
    expect(deleted).toBe(false);
  });
});
