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
