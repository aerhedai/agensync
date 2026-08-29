import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

export function createApproval(
  organisationId: string,
  agentRunId: string,
  requestedAction: string,
  reason: string,
  proposedInput?: Prisma.InputJsonValue,
  proposedToolCallId?: string,
) {
  return prisma.approval.create({
    data: {
      organisationId,
      agentRunId,
      requestedAction,
      reason,
      proposedInput,
      proposedToolCallId,
    },
  });
}

export function findPendingApprovalForRun(agentRunId: string) {
  return prisma.approval.findFirst({
    where: { agentRunId, status: "PENDING" },
    orderBy: { requestedAt: "desc" },
  });
}

export function findPendingApprovals(organisationId: string) {
  return prisma.approval.findMany({
    where: { organisationId, status: "PENDING" },
    orderBy: { requestedAt: "asc" },
  });
}

export function decideApproval(
  approvalId: string,
  status: "APPROVED" | "REJECTED",
  approverId: string,
) {
  return prisma.approval.update({
    where: { id: approvalId },
    data: { status, approverId, decidedAt: new Date() },
  });
}
