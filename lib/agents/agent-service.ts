import * as agentRepository from "@/lib/agents/agent-repository";
import * as agentToolRepository from "@/lib/agents/agent-tool-repository";
import type { AgentInput } from "@/lib/agents/schemas";
import * as integrationRepository from "@/lib/integrations/integration-repository";

export function listAgents(organisationId: string) {
  return agentRepository.findAgentsByOrganisation(organisationId);
}

export function getAgent(organisationId: string, id: string) {
  return agentRepository.findAgentById(organisationId, id);
}

/**
 * actionTool is always "send_email" today (no UI to change it yet — see
 * Agent.actionTool's schema.prisma comment), so the account it binds to
 * must always be a Gmail one. Re-checked here (not trusted from the form)
 * since the id itself is organisation-scoped by findIntegrationById, but
 * nothing before this point confirms it's actually a Gmail account.
 */
async function validateActionIntegration(
  organisationId: string,
  actionIntegrationId: string | null,
) {
  if (!actionIntegrationId) {
    return;
  }
  const integration = await integrationRepository.findIntegrationById(
    organisationId,
    actionIntegrationId,
  );
  if (!integration) {
    throw new Error("Connected account not found");
  }
  if (integration.provider !== "gmail") {
    throw new Error(
      `The action account must be a Gmail account, not a ${integration.provider} one`,
    );
  }
}

export async function createAgent(organisationId: string, input: AgentInput) {
  const { toolNames, ...agentColumns } = input;
  await validateActionIntegration(organisationId, input.actionIntegrationId);
  const agent = await agentRepository.createAgent(organisationId, agentColumns);
  await agentToolRepository.setToolsForAgent(agent.id, toolNames);
  return agent;
}

export async function updateAgent(
  organisationId: string,
  id: string,
  input: AgentInput,
) {
  const { toolNames, ...agentColumns } = input;
  await validateActionIntegration(organisationId, input.actionIntegrationId);
  const result = await agentRepository.updateAgent(
    organisationId,
    id,
    agentColumns,
  );
  if (result.count === 0) {
    throw new Error("Agent not found");
  }
  await agentToolRepository.setToolsForAgent(id, toolNames);
}
