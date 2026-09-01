import * as agentRepository from "@/lib/agents/agent-repository";
import type { WorkflowAgentRole } from "@/lib/generated/prisma/client";
import type { WorkflowInput } from "@/lib/workflows/schemas";
import * as workflowRepository from "@/lib/workflows/workflow-repository";

export function findActiveEmailWorkflow(organisationId: string) {
  return workflowRepository.findActiveWorkflowByTrigger(
    organisationId,
    "EMAIL",
  );
}

// Used by the workflow detail page to warn before activating: "this will
// deactivate <name>" is a much clearer moment to learn about the
// one-active-workflow-per-trigger rule than discovering it after the fact.
export function findActiveWorkflowForTrigger(
  organisationId: string,
  trigger: Parameters<typeof workflowRepository.findActiveWorkflowByTrigger>[1],
) {
  return workflowRepository.findActiveWorkflowByTrigger(
    organisationId,
    trigger,
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

// Always CUSTOM/DRAFT — a template's workflow only ever comes from
// provision-email-workflow.ts (or a future equivalent), never this path.
// Starting in DRAFT means a business can build a workflow out (add its
// classifier and handlers) without it ever being reachable by real
// inbound traffic until they explicitly activate it.
export function createWorkflow(organisationId: string, input: WorkflowInput) {
  return workflowRepository.createWorkflow(organisationId, input);
}

/**
 * At most one workflow per (organisationId, trigger) may be ACTIVE —
 * dispatchInboundMessage can only ever route to one, so a second ACTIVE
 * workflow on the same trigger wouldn't run in parallel, it would just be
 * silently unreachable (see the Workflow.status field comment in
 * schema.prisma). Activating this one demotes whatever else currently
 * holds that trigger to DRAFT, in the same call — an explicit swap, not
 * something the caller has to remember to do in two steps.
 */
export async function activateWorkflow(
  organisationId: string,
  workflowId: string,
) {
  const workflow = await workflowRepository.findWorkflowById(
    organisationId,
    workflowId,
  );
  if (!workflow) {
    throw new Error("Workflow not found");
  }

  const hasClassifier = workflow.members.some((m) => m.role === "CLASSIFIER");
  const hasHandler = workflow.members.some((m) => m.role === "HANDLER");
  if (!hasClassifier || !hasHandler) {
    throw new Error(
      "A workflow needs a classifier and at least one handler before it can be activated",
    );
  }

  await workflowRepository.deactivateOtherWorkflowsForTrigger(
    organisationId,
    workflow.trigger,
    workflowId,
  );
  return workflowRepository.setWorkflowStatus(workflowId, "ACTIVE");
}

export async function deactivateWorkflow(
  organisationId: string,
  workflowId: string,
) {
  const workflow = await workflowRepository.findWorkflowById(
    organisationId,
    workflowId,
  );
  if (!workflow) {
    throw new Error("Workflow not found");
  }
  return workflowRepository.setWorkflowStatus(workflowId, "DRAFT");
}
