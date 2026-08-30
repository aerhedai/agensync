// Disabled. This route exposed Agensync's MCP tool server (find_customer,
// find_product, check_inventory, calculate_quote, send_email) directly over
// HTTP with no authentication, and — worse — no gating: the approval-gate
// and audit-trail logic (lib/runtime/tool-execution.ts's
// gateAndExecuteTool) only runs in the in-process client wrapper
// (lib/mcp/client.ts's connectMcpClient), never on the raw MCP server
// itself. Any caller reaching this endpoint could invoke send_email
// directly — a real email sent from the org's connected Gmail account —
// with no approval prompt and no ToolCall/RunStep row, completely
// bypassing the app's core safety design.
//
// Nothing in the app calls this route internally; it was unused
// scaffolding. Left disabled rather than deleted: there's a real future
// use case (letting an external AI assistant like Claude Desktop connect
// via MCP for read-only lookups) worth building properly once real
// per-org authentication exists to protect it, and once the mutating
// tools (send_email) are deliberately kept off whatever gets exposed —
// re-enabling this as-is is not safe.
export async function GET(): Promise<Response> {
  return new Response("Not found", { status: 404 });
}

export const POST = GET;
export const DELETE = GET;
