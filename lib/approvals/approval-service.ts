import * as approvalRepository from "@/lib/approvals/approval-repository";

export function listPendingApprovals(organisationId: string) {
  return approvalRepository.findPendingApprovals(organisationId);
}

export function getPendingApprovalForRun(agentRunId: string) {
  return approvalRepository.findPendingApprovalForRun(agentRunId);
}
