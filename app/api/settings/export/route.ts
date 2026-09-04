import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";

export const dynamic = "force-dynamic";

// A real data-export endpoint, not a stub: every row this organisation
// owns, as one JSON file. `Integration.credentials` is deliberately never
// selected — an export a business downloads and might store/share
// elsewhere is exactly the kind of place OAuth tokens must never end up
// (CLAUDE.md §22).
export async function GET() {
  const organisation = await getCurrentOrganisation();
  const organisationId = organisation.id;

  const [agents, agentRuns, approvals, recordTypes, integrations, workflows] =
    await Promise.all([
      prisma.agent.findMany({
        where: { organisationId },
        include: { tools: true },
      }),
      prisma.agentRun.findMany({
        where: { organisationId },
        include: { steps: true, toolCalls: true },
      }),
      prisma.approval.findMany({ where: { organisationId } }),
      // Record types with their rows, which since the catalog collapse is
      // every piece of business data this organisation owns. The previous
      // version exported the Product and Customer tables and nothing else, so
      // a business's own record types — often the only ones it actually used —
      // silently never made it into its own export.
      prisma.customEntityType.findMany({
        where: { organisationId },
        include: { records: true },
      }),
      prisma.integration.findMany({
        where: { organisationId },
        select: {
          id: true,
          provider: true,
          name: true,
          config: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.workflow.findMany({ where: { organisationId } }),
    ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    organisation: {
      id: organisation.id,
      name: organisation.name,
      currency: organisation.currency,
    },
    agents,
    agentRuns,
    approvals,
    recordTypes,
    integrations,
    workflows,
  };

  const filename = `aperator-export-${organisationId}-${
    new Date().toISOString().split("T")[0]
  }.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
