import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// MCP convention: tool-level errors go in the result (isError: true), not as
// a thrown protocol error — otherwise the calling LLM never sees what went
// wrong and can't self-correct.
export function toolSuccess(
  structuredContent: Record<string, unknown>,
): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent,
  };
}

export function toolError(message: string): CallToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}
