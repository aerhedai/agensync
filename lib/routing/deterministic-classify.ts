export interface KeywordCandidate {
  id: string;
  keywords: string[];
}

/**
 * The fast path tried before the LLM classifier (lib/routing/classify-
 * intent.ts): does the input contain one agent's keywords and no other
 * agent's? If so, route deterministically — no LLM call at all for the
 * obvious cases. Deliberately conservative: any ambiguity (zero matches,
 * or more than one agent matching) falls through to the LLM, which is the
 * safety net, not the other way around. An agent with no keywords
 * configured never matches here, which is the correct default — routing
 * decisions are opt-in to the fast path, not assumed.
 */
export function deterministicClassify(
  input: string,
  candidates: KeywordCandidate[],
): string | null {
  const normalized = input.toLowerCase();

  const matches = candidates.filter(
    (candidate) =>
      candidate.keywords.length > 0 &&
      candidate.keywords.some((keyword) =>
        normalized.includes(keyword.toLowerCase()),
      ),
  );

  return matches.length === 1 ? (matches[0]?.id ?? null) : null;
}
