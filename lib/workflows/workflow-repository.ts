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

export function createWorkflow(
  organisationId: string,
  input: { name: string; description: string; trigger: WorkflowTriggerType },
) {
  return prisma.workflow.create({
    data: { ...input, organisationId, source: "CUSTOM", status: "DRAFT" },
  });
}

export function setWorkflowStatus(
  workflowId: string,
  status: "ACTIVE" | "DRAFT",
) {
  return prisma.workflow.update({
    where: { id: workflowId },
    data: { status },
  });
}

// Everything else already ACTIVE on this org+trigger, demoted to DRAFT —
// the other half of activateWorkflow's swap (workflow-service.ts). Not
// scoped to a single previously-active row because there should only ever
// be one, but this stays correct even if that invariant were ever
// violated by something outside this service (a direct DB write, a bug).
export function deactivateOtherWorkflowsForTrigger(
  organisationId: string,
  trigger: WorkflowTriggerType,
  excludeWorkflowId: string,
) {
  return prisma.workflow.updateMany({
    where: {
      organisationId,
      trigger,
      status: "ACTIVE",
      id: { not: excludeWorkflowId },
    },
    data: { status: "DRAFT" },
  });
}
