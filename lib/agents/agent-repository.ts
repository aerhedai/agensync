import { prisma } from "@/lib/db/prisma";
import type { AgentInput } from "@/lib/agents/schemas";

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
  });
}

export function createAgent(organisationId: string, input: AgentInput) {
  return prisma.agent.create({
    data: { ...input, organisationId },
  });
}

export function updateAgent(
  organisationId: string,
  id: string,
  input: AgentInput,
) {
  return prisma.agent.updateMany({
    where: { id, organisationId },
    data: input,
  });
}
