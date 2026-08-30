import { prisma } from "@/lib/db/prisma";

export async function findToolNamesForAgent(
  agentId: string,
): Promise<string[]> {
  const rows = await prisma.agentTool.findMany({
    where: { agentId },
    select: { toolName: true },
  });
  return rows.map((row) => row.toolName);
}

/**
 * Replaces an agent's tool grants wholesale. Wrapped in a transaction
 * unlike prisma/seed.ts's equivalent delete-then-recreate (which runs
 * once, non-concurrently, as a controlled script) — this is a real
 * user-facing write path where a double form submission or a crash
 * mid-write could otherwise leave an agent with zero tools until someone
 * notices.
 */
export async function setToolsForAgent(
  agentId: string,
  toolNames: string[],
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.agentTool.deleteMany({ where: { agentId } });
    if (toolNames.length > 0) {
      await tx.agentTool.createMany({
        data: toolNames.map((toolName) => ({ agentId, toolName })),
      });
    }
  });
}
