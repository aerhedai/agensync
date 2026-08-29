import * as workflowRepository from "@/lib/workflows/workflow-repository";

export function findActiveEmailWorkflow(organisationId: string) {
  return workflowRepository.findActiveWorkflowByTrigger(
    organisationId,
    "EMAIL",
  );
}
