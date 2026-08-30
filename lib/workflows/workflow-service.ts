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
