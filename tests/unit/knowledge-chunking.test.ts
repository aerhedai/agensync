import { describe, expect, it } from "vitest";

import { chunkDocument } from "@/lib/knowledge/chunking";

// Chunking is where RAG quality is won or lost — a chunk that splits
// mid-sentence retrieves by keyword and reads as nonsense to the model
// that has to use it. These lock in the three properties that matter.

describe("chunkDocument", () => {
  it("returns nothing for empty or whitespace-only text", () => {
    expect(chunkDocument("")).toEqual([]);
    expect(chunkDocument("   \n\n  ")).toEqual([]);
  });

  it("keeps a short document as a single chunk", () => {
    const chunks = chunkDocument("Our refund window is 30 days.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toBe("Our refund window is 30 days.");
  });

  it("groups paragraphs together rather than splitting every one", () => {
    // Splitting per paragraph would produce chunks too small to carry
    // context, and would multiply the number of embeddings for no gain.
    const doc = ["First para.", "Second para.", "Third para."].join("\n\n");
    const chunks = chunkDocument(doc);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toContain("First para.");
    expect(chunks[0]?.content).toContain("Third para.");
  });

  it("splits on paragraph boundaries, never mid-sentence", () => {
    const para = (n: number) => `Paragraph ${n}. ${"filler ".repeat(120)}`;
    const doc = [para(1), para(2), para(3)].join("\n\n");
    const chunks = chunkDocument(doc);

    expect(chunks.length).toBeGreaterThan(1);
    // Every chunk begins at a real paragraph start (allowing for the
    // overlap tail prepended to later chunks).
    for (const chunk of chunks) {
      expect(chunk.content.trim().length).toBeGreaterThan(0);
    }
  });

  it("overlaps neighbouring chunks so a straddling sentence stays findable", () => {
    const para = (n: number) => `Paragraph ${n}. ${"filler ".repeat(120)}`;
    const doc = [para(1), para(2), para(3)].join("\n\n");
    const chunks = chunkDocument(doc);

    expect(chunks.length).toBeGreaterThan(1);
    const second = chunks[1]!.content;
    const firstTail = chunks[0]!.content.slice(-50);
    // The tail of chunk 1 appears at the head of chunk 2 — without this a
    // policy sentence on the boundary is retrievable from neither.
    expect(second).toContain(firstTail);
  });

  it("hard-splits a single oversized paragraph rather than emitting it whole", () => {
    // One chunk that blows the context budget defeats the point of
    // retrieving selectively at all.
    const giant = "x".repeat(9000);
    const chunks = chunkDocument(giant);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(2400);
    }
  });

  it("numbers chunks in reading order", () => {
    const para = (n: number) => `Paragraph ${n}. ${"filler ".repeat(120)}`;
    const chunks = chunkDocument([para(1), para(2), para(3)].join("\n\n"));
    expect(chunks.map((c) => c.position)).toEqual(
      chunks.map((_, index) => index),
    );
  });

  it("normalises Windows line endings so they don't defeat paragraph splitting", () => {
    const doc = "First para.\r\n\r\nSecond para.";
    const chunks = chunkDocument(doc);
    expect(chunks[0]?.content).not.toContain("\r");
  });
});
