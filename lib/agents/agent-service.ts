import * as agentRepository from "@/lib/agents/agent-repository";
import type { AgentInput } from "@/lib/agents/schemas";

export function listAgents(organisationId: string) {
  return agentRepository.findAgentsByOrganisation(organisationId);
}

export function getAgent(organisationId: string, id: string) {
  return agentRepository.findAgentById(organisationId, id);
}

export function createAgent(organisationId: string, input: AgentInput) {
  return agentRepository.createAgent(organisationId, input);
}

export async function updateAgent(
  organisationId: string,
  id: string,
  input: AgentInput,
) {
  const result = await agentRepository.updateAgent(organisationId, id, input);
  if (result.count === 0) {
    throw new Error("Agent not found");
  }
}
