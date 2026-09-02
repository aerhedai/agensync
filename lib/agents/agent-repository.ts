import { prisma } from "@/lib/db/prisma";
import type { AgentStatus, Prisma } from "@/lib/generated/prisma/client";
import type { AgentColumnsInput } from "@/lib/agents/schemas";

export function findAgentsByOrganisation(organisationId: string) {
  return prisma.agent.findMany({
    where: { organisationId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { runs: true } } },
  });
}

export function findAgentById(organisationId: string, id: string) {
  return prisma.agent.findFirst({
    where: { id, organisationId },
    include: { tools: true },
  });
}

export function createAgent(organisationId: string, input: AgentColumnsInput) {
  return prisma.agent.create({
    data: {
      ...input,
      organisationId,
      pipelineConfig: input.pipelineConfig as Prisma.InputJsonValue,
    },
  });
}

export function updateAgent(
  organisationId: string,
  id: string,
  input: AgentColumnsInput,
) {
  return prisma.agent.updateMany({
    where: { id, organisationId },
    data: {
      ...input,
      pipelineConfig: input.pipelineConfig as Prisma.InputJsonValue,
    },
  });
}

export function updateAgentStatus(
  organisationId: string,
  id: string,
  status: AgentStatus,
) {
  return prisma.agent.updateMany({
    where: { id, organisationId },
    data: { status },
  });
}

// Cascades to AgentTool/WorkflowAgent rows (pure config, no audit value —
// see schema.prisma). Deliberately NOT cascaded to AgentRun: deleting an
// agent that has real run history would silently destroy an audit trail
// this platform otherwise goes out of its way to keep (CLAUDE.md #21) —
// the foreign key is left RESTRICT, so Postgres itself refuses this and
// the service layer surfaces that as "archive instead" rather than ever
// cascading run history away.
export function deleteAgent(organisationId: string, id: string) {
  return prisma.agent.deleteMany({ where: { id, organisationId } });
}
