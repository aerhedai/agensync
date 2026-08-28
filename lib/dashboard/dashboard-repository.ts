import { prisma } from "@/lib/db/prisma";

export async function getDashboardCounts(organisationId: string) {
  const [agents, running, completed, failed, waitingForApproval] =
    await Promise.all([
      prisma.agent.count({ where: { organisationId } }),
      prisma.agentRun.count({ where: { organisationId, status: "RUNNING" } }),
      prisma.agentRun.count({ where: { organisationId, status: "COMPLETED" } }),
      prisma.agentRun.count({ where: { organisationId, status: "FAILED" } }),
      prisma.agentRun.count({
        where: { organisationId, status: "WAITING_FOR_APPROVAL" },
      }),
    ]);

  return { agents, running, completed, failed, waitingForApproval };
}
