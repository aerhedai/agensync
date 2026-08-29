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
