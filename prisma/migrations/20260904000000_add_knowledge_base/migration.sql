-- Knowledge base: a business's own unstructured text, retrievable by
-- meaning rather than by exact key (docs/agent-step-engine-design.md).
--
-- pgvector is an extension on the Postgres we already run, not a new
-- database or a new vendor — which is why this isn't the "vector database"
-- CLAUDE.md §18 warns against adding without demonstrated need. Verified
-- available on Neon (version 0.8.6) before writing this.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "KnowledgeDocument" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'pasted',
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    -- 768 dimensions: nomic-embed-text's output size, already available on
    -- the org's own Ollama host so embeddings cost no new infrastructure.
    "embedding" vector(768),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KnowledgeDocument_organisationId_idx" ON "KnowledgeDocument"("organisationId");
CREATE INDEX "KnowledgeChunk_documentId_idx" ON "KnowledgeChunk"("documentId");
CREATE INDEX "KnowledgeChunk_organisationId_idx" ON "KnowledgeChunk"("organisationId");

ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_organisationId_fkey"
    FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cascade: a chunk has no meaning without its document. Unlike a run's
-- audit trail there is nothing here worth preserving on its own.
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_organisationId_fkey"
    FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- HNSW rather than IVFFlat: it needs no training step and stays accurate
-- on a small, growing table, which is exactly the shape here (a business
-- adds documents one at a time, not a bulk load). Cosine distance to match
-- how nomic-embed-text's vectors are compared.
CREATE INDEX "KnowledgeChunk_embedding_idx" ON "KnowledgeChunk"
    USING hnsw ("embedding" vector_cosine_ops);

-- Full-text index alongside the vector one: hybrid retrieval needs both,
-- and this is what makes it possible to measure whether semantic search
-- actually beats keyword search on a given business's content rather than
-- assuming it does.
CREATE INDEX "KnowledgeChunk_content_fts_idx" ON "KnowledgeChunk"
    USING gin (to_tsvector('english', "content"));
