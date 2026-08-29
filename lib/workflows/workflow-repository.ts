import { prisma } from "@/lib/db/prisma";
import type { WorkflowTriggerType } from "@/lib/generated/prisma/client";

export function findActiveWorkflowByTrigger(
  organisationId: string,
  trigger: WorkflowTriggerType,
) {
  return prisma.workflow.findFirst({
    where: { organisationId, trigger, status: "ACTIVE" },
    include: {
      members: { include: { agent: true } },
    },
  });
}

export function findWorkflowsByOrganisation(organisationId: string) {
  return prisma.workflow.findMany({
    where: { organisationId },
    orderBy: { createdAt: "desc" },
    include: {
      members: { include: { agent: { include: { tools: true } } } },
    },
  });
}

export function findWorkflowById(organisationId: string, id: string) {
  return prisma.workflow.findFirst({
    where: { id, organisationId },
    include: {
      members: {
        include: {
          agent: {
            include: { tools: true, _count: { select: { runs: true } } },
          },
        },
      },
    },
  });
}
