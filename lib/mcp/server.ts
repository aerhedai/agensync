import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import * as integrationService from "@/lib/integrations/integration-service";
import { createCalculateQuoteTool } from "@/lib/mcp/tools/calculate-quote";
import { createCheckCalendarAvailabilityTool } from "@/lib/mcp/tools/check-calendar-availability";
import { createCheckInventoryTool } from "@/lib/mcp/tools/check-inventory";
import { createCreateCalendarEventTool } from "@/lib/mcp/tools/create-calendar-event";
import { createCreateCustomEntityRecordTool } from "@/lib/mcp/tools/create-custom-entity-record";
import { createCreateStorageFolderTool } from "@/lib/mcp/tools/create-storage-folder";
import { createSaveStorageFileTool } from "@/lib/mcp/tools/save-storage-file";
import { createFindCustomEntityRecordTool } from "@/lib/mcp/tools/find-custom-entity-record";
import { createFindCustomerTool } from "@/lib/mcp/tools/find-customer";
import { createFindProductTool } from "@/lib/mcp/tools/find-product";
import { createPopulateDocumentTemplateTool } from "@/lib/mcp/tools/populate-document-template";
import { createNotifySlackTool } from "@/lib/mcp/tools/notify-slack";
import { createNotifyTeamsTool } from "@/lib/mcp/tools/notify-teams";
import { createSearchCustomEntityTool } from "@/lib/mcp/tools/search-custom-entity";
import { createSendEmailTool } from "@/lib/mcp/tools/send-email";
import { createUpdateCustomEntityRecordTool } from "@/lib/mcp/tools/update-custom-entity-record";

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
 * inside a tool handler. actionIntegrationId (an agent's
 * Agent.actionIntegrationId) similarly pins which *specific* connected
 * account action tools use — null/undefined keeps the pre-existing
 * "organisation's default account" behavior.
 *
 * An agent's actionIntegrationId is a single field shared across all of its
 * granted action tools, but a pinned account only ever belongs to one
 * provider (e.g. a Gmail address) — forwarding it unconditionally into
 * every action tool's constructor would make notify_slack hard-error
 * ("not a Slack account") for an agent pinned to Gmail, or vice versa.
 * Resolved once here and only forwarded into the tool(s) whose own
 * provider matches; otherwise undefined, so that tool falls back to its
 * own provider's organisation default instead of failing. send_email is
 * provider-agnostic across Gmail/Outlook, so it matches either.
 */
export async function createMcpServer(
  organisationId: string,
  actionIntegrationId?: string | null,
): Promise<McpServer> {
  const server = new McpServer({ name: "aperator-tools", version: "0.1.0" });

  const actionIntegrationProvider = actionIntegrationId
    ? ((
        await integrationService.getIntegration(
          organisationId,
          actionIntegrationId,
        )
      )?.provider ?? null)
    : null;
  const emailActionIntegrationId =
    actionIntegrationProvider === "gmail" ||
    actionIntegrationProvider === "outlook"
      ? actionIntegrationId
      : undefined;
  const slackActionIntegrationId =
    actionIntegrationProvider === "slack" ? actionIntegrationId : undefined;
  const teamsActionIntegrationId =
    actionIntegrationProvider === "teams" ? actionIntegrationId : undefined;
  const calendarActionIntegrationId =
    actionIntegrationProvider === "outlook-calendar"
      ? actionIntegrationId
      : undefined;

  const findCustomerTool = createFindCustomerTool(organisationId);
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

  const findProductTool = createFindProductTool(organisationId);
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

  const checkInventoryTool = createCheckInventoryTool(organisationId);
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

  const calculateQuoteTool = createCalculateQuoteTool(organisationId);
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

  const searchCustomEntityTool = createSearchCustomEntityTool(organisationId);
  server.registerTool(
    searchCustomEntityTool.name,
    {
      description: searchCustomEntityTool.description,
      inputSchema: searchCustomEntityTool.inputSchema,
      outputSchema: searchCustomEntityTool.outputSchema,
      annotations: readOnly,
    },
    searchCustomEntityTool.handler,
  );

  const findCustomEntityRecordTool =
    createFindCustomEntityRecordTool(organisationId);
  server.registerTool(
    findCustomEntityRecordTool.name,
    {
      description: findCustomEntityRecordTool.description,
      inputSchema: findCustomEntityRecordTool.inputSchema,
      outputSchema: findCustomEntityRecordTool.outputSchema,
      annotations: readOnly,
    },
    findCustomEntityRecordTool.handler,
  );

  const createCustomEntityRecordTool =
    createCreateCustomEntityRecordTool(organisationId);
  server.registerTool(
    createCustomEntityRecordTool.name,
    {
      description: createCustomEntityRecordTool.description,
      inputSchema: createCustomEntityRecordTool.inputSchema,
      outputSchema: createCustomEntityRecordTool.outputSchema,
    },
    createCustomEntityRecordTool.handler,
  );

  const updateCustomEntityRecordTool =
    createUpdateCustomEntityRecordTool(organisationId);
  server.registerTool(
    updateCustomEntityRecordTool.name,
    {
      description: updateCustomEntityRecordTool.description,
      inputSchema: updateCustomEntityRecordTool.inputSchema,
      outputSchema: updateCustomEntityRecordTool.outputSchema,
    },
    updateCustomEntityRecordTool.handler,
  );

  const createStorageFolderTool = createCreateStorageFolderTool(organisationId);
  server.registerTool(
    createStorageFolderTool.name,
    {
      description: createStorageFolderTool.description,
      inputSchema: createStorageFolderTool.inputSchema,
      outputSchema: createStorageFolderTool.outputSchema,
    },
    createStorageFolderTool.handler,
  );

  const saveStorageFileTool = createSaveStorageFileTool(organisationId);
  server.registerTool(
    saveStorageFileTool.name,
    {
      description: saveStorageFileTool.description,
      inputSchema: saveStorageFileTool.inputSchema,
      outputSchema: saveStorageFileTool.outputSchema,
    },
    saveStorageFileTool.handler,
  );

  const populateDocumentTemplateTool =
    createPopulateDocumentTemplateTool(organisationId);
  server.registerTool(
    populateDocumentTemplateTool.name,
    {
      description: populateDocumentTemplateTool.description,
      inputSchema: populateDocumentTemplateTool.inputSchema,
      outputSchema: populateDocumentTemplateTool.outputSchema,
    },
    populateDocumentTemplateTool.handler,
  );

  const sendEmailTool = createSendEmailTool(
    organisationId,
    emailActionIntegrationId,
  );
  server.registerTool(
    sendEmailTool.name,
    {
      description: sendEmailTool.description,
      inputSchema: sendEmailTool.inputSchema,
      outputSchema: sendEmailTool.outputSchema,
    },
    sendEmailTool.handler,
  );

  const notifySlackTool = createNotifySlackTool(
    organisationId,
    slackActionIntegrationId,
  );
  server.registerTool(
    notifySlackTool.name,
    {
      description: notifySlackTool.description,
      inputSchema: notifySlackTool.inputSchema,
      outputSchema: notifySlackTool.outputSchema,
    },
    notifySlackTool.handler,
  );

  const notifyTeamsTool = createNotifyTeamsTool(
    organisationId,
    teamsActionIntegrationId,
  );
  server.registerTool(
    notifyTeamsTool.name,
    {
      description: notifyTeamsTool.description,
      inputSchema: notifyTeamsTool.inputSchema,
      outputSchema: notifyTeamsTool.outputSchema,
    },
    notifyTeamsTool.handler,
  );

  const checkCalendarAvailabilityTool = createCheckCalendarAvailabilityTool(
    organisationId,
    calendarActionIntegrationId,
  );
  server.registerTool(
    checkCalendarAvailabilityTool.name,
    {
      description: checkCalendarAvailabilityTool.description,
      inputSchema: checkCalendarAvailabilityTool.inputSchema,
      outputSchema: checkCalendarAvailabilityTool.outputSchema,
      annotations: readOnly,
    },
    checkCalendarAvailabilityTool.handler,
  );

  const createCalendarEventTool = createCreateCalendarEventTool(
    organisationId,
    calendarActionIntegrationId,
  );
  server.registerTool(
    createCalendarEventTool.name,
    {
      description: createCalendarEventTool.description,
      inputSchema: createCalendarEventTool.inputSchema,
      outputSchema: createCalendarEventTool.outputSchema,
    },
    createCalendarEventTool.handler,
  );

  return server;
}
