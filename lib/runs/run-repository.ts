import { prisma } from "@/lib/db/prisma";
import type { Prisma, RunStatus } from "@/lib/generated/prisma/client";

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
  stepType:
    | "INPUT_RECEIVED"
    | "AGENT_DECISION"
    | "TOOL_CALL"
    | "RUN_COMPLETED"
    | "RUN_FAILED",
  detail?: string,
  toolCallId?: string,
) {
  return prisma.runStep.create({
    data: { agentRunId: runId, stepType, detail, toolCallId },
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
