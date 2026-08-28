import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { createMcpServer } from "@/lib/mcp/server";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";

// Always live — an MCP tool call must never be cached.
export const dynamic = "force-dynamic";

async function handleMcpRequest(request: Request): Promise<Response> {
  // No auth/session exists yet, so there's no per-request org to read from
  // a token — this HTTP endpoint is the one place that placeholder
  // (getCurrentOrganisation) belongs, same as any other unauthenticated
  // entry point in the app. Everything below this line receives
  // organisationId explicitly, never re-resolves it.
  const organisation = await getCurrentOrganisation();
  const server = createMcpServer(organisation.id);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export {
  handleMcpRequest as DELETE,
  handleMcpRequest as GET,
  handleMcpRequest as POST,
};
