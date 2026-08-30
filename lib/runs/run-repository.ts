import { prisma } from "@/lib/db/prisma";
import type {
  Prisma,
  RunStatus,
  RunStepType,
} from "@/lib/generated/prisma/client";

export function createRun(
  organisationId: string,
  agentId: string,
  input: string,
) {
  return prisma.agentRun.create({
    data: { organisationId, agentId, input, status: "PENDING" },
  });
}

export function markRunStatus(
  runId: string,
  status: RunStatus,
  timestamps: { startedAt?: Date; completedAt?: Date } = {},
) {
  return prisma.agentRun.update({
    where: { id: runId },
    data: { status, ...timestamps },
  });
}

export function addRunStep(
  runId: string,
  stepType: RunStepType,
  detail?: string,
  toolCallId?: string,
  usage?: { promptTokens: number; completionTokens: number },
) {
  return prisma.runStep.create({
    data: {
      agentRunId: runId,
      stepType,
      detail,
      toolCallId,
      promptTokens: usage?.promptTokens,
      completionTokens: usage?.completionTokens,
    },
  });
}

export function createToolCall(
  runId: string,
  toolName: string,
  input: Record<string, unknown>,
  output: Record<string, unknown> | undefined,
  status: "SUCCESS" | "FAILED",
  error?: string,
) {
  return prisma.toolCall.create({
    data: {
      agentRunId: runId,
      toolName,
      input: input as Prisma.InputJsonValue,
      output: output as Prisma.InputJsonValue | undefined,
      status,
      error,
    },
  });
}

export function saveMessages(runId: string, messages: Prisma.InputJsonValue) {
  return prisma.agentRun.update({
    where: { id: runId },
    data: { messages },
  });
}

export function findRunById(organisationId: string, runId: string) {
  return prisma.agentRun.findFirst({
    where: { id: runId, organisationId },
    include: {
      agent: true,
      steps: { orderBy: { createdAt: "asc" }, include: { toolCall: true } },
    },
  });
}

export function findRunsByAgent(organisationId: string, agentId: string) {
  return prisma.agentRun.findMany({
    where: { organisationId, agentId },
    orderBy: { createdAt: "desc" },
  });
}

export function findRunsByAgentIds(
  organisationId: string,
  agentIds: string[],
  take: number,
) {
  return prisma.agentRun.findMany({
    where: { organisationId, agentId: { in: agentIds } },
    orderBy: { createdAt: "desc" },
    take,
    include: { agent: { select: { name: true } } },
  });
}
