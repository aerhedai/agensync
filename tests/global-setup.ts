import { config } from "dotenv";

config({ path: ".env.local" });

/**
 * Purges leftover test organisations before the suite runs.
 *
 * Every integration test creates an organisation whose id starts with
 * "test-org-" and removes it in afterAll. When a test fails partway, that
 * afterAll doesn't complete, the organisation survives, and the *next* run
 * fails in beforeAll on Organisation_pkey — in a different file each time,
 * because files run in parallel. The result is a cascade of failures that
 * look like new regressions and have nothing to do with the code.
 *
 * That cost real debugging time and, worse, showed up while deciding
 * whether a change was safe to release. A test signal that can't be trusted
 * at exactly that moment isn't worth much, so the suite now starts from a
 * known state instead of depending on the previous run having exited
 * cleanly.
 *
 * Scoped strictly to the "test-org-" prefix — a developer's real local
 * organisation has a cuid id and is never touched.
 */
export default async function setup() {
  const { prisma } = await import("@/lib/db/prisma");

  const orgs = await prisma.organisation.findMany({
    where: { id: { startsWith: "test-org-" } },
    select: { id: true },
  });

  for (const { id: organisationId } of orgs) {
    // Ordered by foreign key, deepest first — the audit trail deliberately
    // does not cascade (CLAUDE.md §4.7), so it has to be unwound by hand.
    await prisma.approval.deleteMany({ where: { organisationId } });
    await prisma.runStep.deleteMany({
      where: { agentRun: { organisationId } },
    });
    await prisma.toolCall.deleteMany({
      where: { agentRun: { organisationId } },
    });
    await prisma.agentRun.deleteMany({ where: { organisationId } });
    await prisma.workflowAgent.deleteMany({
      where: { agent: { organisationId } },
    });
    await prisma.agentTool.deleteMany({ where: { agent: { organisationId } } });
    await prisma.workflow.deleteMany({ where: { organisationId } });
    await prisma.agent.deleteMany({ where: { organisationId } });
    await prisma.customEntityRecord.deleteMany({ where: { organisationId } });
    await prisma.customEntityType.deleteMany({ where: { organisationId } });
    await prisma.knowledgeChunk.deleteMany({ where: { organisationId } });
    await prisma.knowledgeDocument.deleteMany({ where: { organisationId } });
    await prisma.agentTemplate.deleteMany({ where: { organisationId } });
    await prisma.integration.deleteMany({ where: { organisationId } });
    await prisma.user.deleteMany({ where: { organisationId } });
    await prisma.organisation.delete({ where: { id: organisationId } });
  }

  if (orgs.length > 0) {
    console.log(
      `[global-setup] cleared ${orgs.length} leftover test organisation(s)`,
    );
  }

  await prisma.$disconnect();
}
