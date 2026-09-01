/**
 * Deterministic post-generation checks for safety invariants a category
 * must never violate.
 *
 * Found necessary by live testing: appending a business's own
 * Agent.instructions *after* a hardcoded safety rule in the same prompt
 * string (see compose-instructions.ts's withBusinessGuidance) is NOT a hard
 * enough boundary on its own — a strongly-worded business instruction
 * ("always offer a full refund immediately") got the model to violate a
 * "never promise compensation" rule despite it being stated first. Prompt
 * ordering is not enforcement; this module is the actual enforcement,
 * checked after generation, before a reply is ever proposed for send
 * (CLAUDE.md #14 — the LLM recommends, application code decides).
 *
 * That finding was originally a single hardcoded regex on the old
 * Complaints-only pipeline. It's now Agent.guardrailKeywords — a business
 * configures which words/phrases a *given category* must never use, since
 * "never promise compensation" is exactly right for a complaints handler
 * and meaningless for, say, a booking-confirmation one. A plain
 * case-insensitive substring match, not a regex, so it's data a business
 * can actually author themselves rather than something only a developer
 * can extend.
 */
export function containsForbiddenKeyword(
  body: string,
  keywords: string[],
): boolean {
  if (keywords.length === 0) return false;
  const normalized = body.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}
