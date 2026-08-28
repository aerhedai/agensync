import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { calculateQuoteTool } from "@/lib/mcp/tools/calculate-quote";
import { checkInventoryTool } from "@/lib/mcp/tools/check-inventory";
import { findCustomerTool } from "@/lib/mcp/tools/find-customer";
import { findProductTool } from "@/lib/mcp/tools/find-product";

// All four Phase 5 tools are read-only lookups/calculations — none mutate
// anything, so no policy/permission system is needed yet (that's Phase 7).
// Tools that write will need one.
const readOnly = { readOnlyHint: true };

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "agensync-tools", version: "0.1.0" });

  server.registerTool(
    findCustomerTool.name,
    {
      description: findCustomerTool.description,
      inputSchema: findCustomerTool.inputSchema,
      outputSchema: findCustomerTool.outputSchema,
      annotations: readOnly,
    },
    findCustomerTool.handler,
  );

  server.registerTool(
    findProductTool.name,
    {
      description: findProductTool.description,
      inputSchema: findProductTool.inputSchema,
      outputSchema: findProductTool.outputSchema,
      annotations: readOnly,
    },
    findProductTool.handler,
  );

  server.registerTool(
    checkInventoryTool.name,
    {
      description: checkInventoryTool.description,
      inputSchema: checkInventoryTool.inputSchema,
      outputSchema: checkInventoryTool.outputSchema,
      annotations: readOnly,
    },
    checkInventoryTool.handler,
  );

  server.registerTool(
    calculateQuoteTool.name,
    {
      description: calculateQuoteTool.description,
      inputSchema: calculateQuoteTool.inputSchema,
      outputSchema: calculateQuoteTool.outputSchema,
      annotations: readOnly,
    },
    calculateQuoteTool.handler,
  );

  return server;
}
