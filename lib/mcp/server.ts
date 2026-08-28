import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { calculateQuoteTool } from "@/lib/mcp/tools/calculate-quote";
import { checkInventoryTool } from "@/lib/mcp/tools/check-inventory";
import { findCustomerTool } from "@/lib/mcp/tools/find-customer";
import { findProductTool } from "@/lib/mcp/tools/find-product";
import { createSendEmailTool } from "@/lib/mcp/tools/send-email";

// The four Phase 5 tools are read-only lookups/calculations. send_email
// (Phase 9) is the first tool that mutates external state, so it's marked
// accordingly and gets an explicit policy rule (lib/policies/policy-engine.ts)
// rather than relying on the default ALLOW.
const readOnly = { readOnlyHint: true };

/**
 * organisationId is required (not defaulted via getCurrentOrganisation
 * internally) so every caller has to state which organisation's tools this
 * server instance serves — send_email needs it to look up the right
 * Gmail credentials, and CLAUDE.md #22 requires every organisation-scoped
 * action to be explicitly scoped, not resolved via a global fallback deep
 * inside a tool handler.
 */
export function createMcpServer(organisationId: string): McpServer {
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

  const sendEmailTool = createSendEmailTool(organisationId);
  server.registerTool(
    sendEmailTool.name,
    {
      description: sendEmailTool.description,
      inputSchema: sendEmailTool.inputSchema,
      outputSchema: sendEmailTool.outputSchema,
    },
    sendEmailTool.handler,
  );

  return server;
}
