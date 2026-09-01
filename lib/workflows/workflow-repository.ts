import { prisma } from "@/lib/db/prisma";
import type {
  WorkflowAgentRole,
  WorkflowTriggerType,
} from "@/lib/generated/prisma/client";

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

// Idempotent (upsert on the workflowId+agentId unique constraint) — adding
// an already-attached agent just updates its role rather than erroring,
// same pattern as provisionEmailWorkflow's own membership upserts.
export function addWorkflowMember(
  workflowId: string,
  agentId: string,
  role: WorkflowAgentRole,
) {
  return prisma.workflowAgent.upsert({
    where: { workflowId_agentId: { workflowId, agentId } },
    update: { role },
    create: { workflowId, agentId, role },
  });
}
