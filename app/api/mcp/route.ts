import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { createMcpServer } from "@/lib/mcp/server";

// Always live — an MCP tool call must never be cached.
export const dynamic = "force-dynamic";

async function handleMcpRequest(request: Request): Promise<Response> {
  const server = createMcpServer();
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
