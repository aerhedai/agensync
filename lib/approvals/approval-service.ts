import * as approvalRepository from "@/lib/approvals/approval-repository";

export function listPendingApprovals(organisationId: string) {
  return approvalRepository.findPendingApprovals(organisationId);
}
