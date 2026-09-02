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
