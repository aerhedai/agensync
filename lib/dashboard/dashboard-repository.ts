import { prisma } from "@/lib/db/prisma";
import * as runRepository from "@/lib/runs/run-repository";

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

// One number for the dashboard — deliberately just a total, not a
// breakdown. The detailed, per-run view lives at /runs; this is meant to
// answer "roughly how much is this organisation using" at a glance.
// Reuses run-repository's own aggregate rather than a second copy of the
// same query.
export async function getTotalTokenUsage(organisationId: string) {
  const { promptTokens, completionTokens } =
    await runRepository.sumAllTokensForOrganisation(organisationId);
  return promptTokens + completionTokens;
}
