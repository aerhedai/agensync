import * as agentRepository from "@/lib/agents/agent-repository";
import * as agentToolRepository from "@/lib/agents/agent-tool-repository";
import type { AgentInput } from "@/lib/agents/schemas";

export function listAgents(organisationId: string) {
  return agentRepository.findAgentsByOrganisation(organisationId);
}

export function getAgent(organisationId: string, id: string) {
  return agentRepository.findAgentById(organisationId, id);
}

export async function createAgent(organisationId: string, input: AgentInput) {
  const { toolNames, ...agentColumns } = input;
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
