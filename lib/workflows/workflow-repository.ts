import { prisma } from "@/lib/db/prisma";
import type {
  WorkflowAgentRole,
  WorkflowTriggerType,
} from "@/lib/generated/prisma/client";

/**
 * triggerIntegrationId narrows to a workflow bound to that *specific*
 * connected account (e.g. exactly which webhook URL/secret received the
 * request) — pass null (the default) for "the generic workflow for this
 * trigger type," today's only behavior and still correct for triggers
 * with no natural per-account binding yet. This is a direct match, not a
 * fallback chain: a webhook request always knows its own integrationId
 * (it's in the URL), so there's no "specific, then fall back to generic"
 * case to handle — if nothing is bound to this exact account, that's a
 * real "no workflow configured for this," not a reason to guess at one.
 */
export function findActiveWorkflowByTrigger(
  organisationId: string,
  trigger: WorkflowTriggerType,
  triggerIntegrationId: string | null = null,
) {
  return prisma.workflow.findFirst({
    where: { organisationId, trigger, triggerIntegrationId, status: "ACTIVE" },
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
  input: {
    name: string;
    description: string;
    trigger: WorkflowTriggerType;
    triggerIntegrationId?: string | null;
  },
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

// Everything else already ACTIVE on this org+trigger+account, demoted to
// DRAFT — the other half of activateWorkflow's swap (workflow-service.ts).
// Scoped to triggerIntegrationId too, not just trigger: two workflows on
// the same trigger type but *different* bound accounts (e.g. two separate
// webhook URLs) don't compete for exclusivity at all — each account's
// traffic is its own, so activating one must never deactivate the other.
export function deactivateOtherWorkflowsForTrigger(
  organisationId: string,
  trigger: WorkflowTriggerType,
  triggerIntegrationId: string | null,
  excludeWorkflowId: string,
) {
  return prisma.workflow.updateMany({
    where: {
      organisationId,
      trigger,
      triggerIntegrationId,
      status: "ACTIVE",
      id: { not: excludeWorkflowId },
    },
    data: { status: "DRAFT" },
  });
}
