/**
 * Splits a document into retrievable chunks.
 *
 * Chunking is where RAG quality is actually won or lost, so the rules here
 * are deliberate rather than a default:
 *
 * - **Split on structure first, size second.** Paragraph and heading
 *   boundaries carry meaning; splitting mid-sentence every N characters
 *   produces chunks that retrieve well by keyword and read as nonsense to
 *   the model that has to use them.
 * - **Overlap between chunks.** A policy sentence that straddles a
 *   boundary would otherwise be retrievable from neither side.
 * - **Never emit an oversized chunk.** A single enormous paragraph is
 *   still hard-split, because one chunk that blows the context budget
 *   defeats the point of retrieving selectively at all.
 */

// Roughly 1,500 characters ≈ 300–400 tokens: large enough to hold a whole
// policy clause, small enough that retrieving three of them stays far
// cheaper than carrying an entire document in every prompt.
const TARGET_CHARS = 1500;
const OVERLAP_CHARS = 200;
// A hard ceiling, not a target — only reached by a single paragraph that
// exceeds it on its own.
const MAX_CHARS = 2000;

export interface Chunk {
  position: number;
  content: string;
}

function hardSplit(text: string): string[] {
  const pieces: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + MAX_CHARS, text.length);
    pieces.push(text.slice(start, end));
    if (end === text.length) break;
    // Step back by the overlap so a sentence spanning the cut is present
    // in both pieces.
    start = end - OVERLAP_CHARS;
  }
  return pieces;
}

export function chunkDocument(content: string): Chunk[] {
  const normalised = content.replace(/\r\n/g, "\n").trim();
  if (normalised === "") return [];

  // Blank lines are the strongest structural signal in the kind of text a
  // business pastes — policies, FAQs, SOPs are paragraph-shaped.
  const paragraphs = normalised
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (paragraph.length > MAX_CHARS) {
      if (current !== "") {
        chunks.push(current);
        current = "";
      }
      chunks.push(...hardSplit(paragraph));
      continue;
    }

    const candidate = current === "" ? paragraph : `${current}\n\n${paragraph}`;
    if (candidate.length <= TARGET_CHARS) {
      current = candidate;
      continue;
    }

    if (current !== "") chunks.push(current);
    current = paragraph;
  }
  if (current !== "") chunks.push(current);

  // Overlap is applied between neighbouring chunks rather than baked into
  // the accumulation above, so a chunk boundary that already fell on a
  // paragraph break still carries the tail of the previous one.
  return chunks.map((chunk, index) => {
    if (index === 0) return { position: 0, content: chunk };
    const previous = chunks[index - 1] ?? "";
    const tail = previous.slice(-OVERLAP_CHARS);
    return {
      position: index,
      content: tail === "" ? chunk : `${tail}\n\n${chunk}`,
    };
  });
}
