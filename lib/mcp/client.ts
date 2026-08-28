import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "@/lib/mcp/server";

/**
 * Connects an MCP client to our own tool server in-process (no HTTP hop —
 * the runtime and the tools live in the same app for now). See CLAUDE.md's
 * MCP architecture discussion: this is the same pattern the app/api/mcp
 * route would use over HTTP, just without the network.
 */
export async function connectMcpClient(): Promise<Client> {
  const server = createMcpServer();
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  const client = new Client({ name: "agensync-runtime", version: "0.1.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return client;
}
