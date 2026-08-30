import type { Agent } from "@/lib/generated/prisma/client";

/**
 * Shared prefix for every pipeline's composeReply instructions. Both rules
 * here were added after live testing caught the model violating them: first
 * "I am an AI assistant available 24/7" (answering as an AI instead of on
 * behalf of the business), then unfilled template brackets like
 * "[Customer's Name]" and "[Your Name]" left in a quote email — caught by
 * the mandatory approval gate before a customer ever saw it, but the whole
 * point of the harness is not to rely on that gate to catch avoidable
 * mistakes.
 *
 * Takes the organisation's name so the sign-off is genuinely per-business
 * ("The Acme Inc team") rather than a generic hardcoded "The team" — reuses
 * the existing Organisation.name field rather than adding a new column.
 */
export function composeBaseInstructions(organisationName: string): string {
  return `You are writing on behalf of the business — never say you're an AI or refer to yourself as an assistant. Never use placeholder brackets like [Customer's Name], [Your Name], or [Your Position] — if you don't know a name, omit it rather than inserting a placeholder, and sign off as "The ${organisationName} team" rather than an individual.`;
}

/**
 * Appends a business's own free-text Agent.instructions as the outermost,
 * last-applied layer of a pipeline's compose instructions — after the base
 * tone rules and after whatever task-specific safety invariant a pipeline
 * hardcodes (e.g. "never promise compensation"). A business can add
 * guidance; it can never delete or contradict what's already been stated
 * earlier in the same prompt string, since composeReply concatenates this
 * onto the end rather than letting instructions replace anything.
 *
 * agent.instructions is trusted input here — an organisation's own admin
 * editing their own agent's config, not attacker-supplied customer
 * content — so this isn't a prompt-injection surface in the adversarial
 * sense.
 */
export function withBusinessGuidance(
  instructions: string,
  agent: Agent,
): string {
  return `${instructions} Additional business-specific guidance from this business: ${agent.instructions}`;
}
