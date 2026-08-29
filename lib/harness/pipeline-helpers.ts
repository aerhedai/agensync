import type { PipelineContext } from "@/lib/harness/types";
import {
  executeAndRecordTool,
  recordDisallowedTool,
} from "@/lib/runtime/tool-execution";

/**
 * The only way a pipeline touches a real tool — always through the same
 * allowedTools check the LOOP enforces (CLAUDE.md #9 step 3), so a
 * pipeline hardcoding a tool sequence can never bypass per-agent tool
 * restriction just because the sequence is deterministic.
 */
export async function callTool(
  context: PipelineContext,
  name: string,
  args: Record<string, unknown>,
): Promise<{
  isError: boolean;
  structuredContent: Record<string, unknown> | undefined;
}> {
  if (!context.allowedTools.has(name)) {
    const { error } = await recordDisallowedTool(context.runId, name, args);
    return { isError: true, structuredContent: { error } };
  }
  return executeAndRecordTool(context.runId, context.mcpClient, name, args);
}

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

/**
 * Pulls an email address straight out of the input with a regex — no LLM
 * call needed. Inbound email always carries the sender's address in a
 * "From:" header (see app/dashboard/actions.ts), so this is 100% reliable
 * for the email-triggered case and costs nothing; the LLM-extracted
 * customerEmail field (from the pipeline's extractFields call) is only a
 * fallback for manually-typed input that isn't shaped like an email.
 */
export function extractEmailDeterministically(text: string): string | null {
  return text.match(EMAIL_PATTERN)?.[0] ?? null;
}
