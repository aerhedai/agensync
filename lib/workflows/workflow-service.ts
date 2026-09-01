import * as agentRepository from "@/lib/agents/agent-repository";
import type { WorkflowAgentRole } from "@/lib/generated/prisma/client";
import * as workflowRepository from "@/lib/workflows/workflow-repository";

export function findActiveEmailWorkflow(organisationId: string) {
  return workflowRepository.findActiveWorkflowByTrigger(
    organisationId,
    "EMAIL",
  );
}

export function listWorkflows(organisationId: string) {
  return workflowRepository.findWorkflowsByOrganisation(organisationId);
}

export function getWorkflow(organisationId: string, id: string) {
  return workflowRepository.findWorkflowById(organisationId, id);
}

/**
 * Both the workflow and the agent are re-looked-up scoped to
 * organisationId here, not trusted from the caller's ids alone — the only
 * thing standing between this and attaching another organisation's agent
 * to your workflow (or vice versa) is this check.
 */
export async function addMember(
  organisationId: string,
  workflowId: string,
  agentId: string,
  role: WorkflowAgentRole,
) {
  const workflow = await workflowRepository.findWorkflowById(
    organisationId,
    workflowId,
  );
  if (!workflow) {
    throw new Error("Workflow not found");
  }
  const agent = await agentRepository.findAgentById(organisationId, agentId);
  if (!agent) {
    throw new Error("Agent not found");
  }
  return workflowRepository.addWorkflowMember(workflowId, agentId, role);
}
