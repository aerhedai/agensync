import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import {
  DEFAULT_AGENT_MODEL,
  DEFAULT_COMPLAINTS_KEYWORDS,
  DEFAULT_QUOTE_KEYWORDS,
} from "@/lib/agents/default-agent-config";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import type { Organisation } from "@/lib/generated/prisma/client";
import { provisionEmailWorkflow } from "@/lib/workflows/provision-email-workflow";

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * Resolves the current organisation from the real Clerk session — every
 * page and server action in the app funnels org context through this one
 * function (CLAUDE.md §22: every organisation-scoped action must be
 * explicitly scoped, never a global fallback), so this is the only place
 * that needs to know Clerk exists.
 *
 * Lazily provisions a brand-new organisation's local row plus a starter
 * Email Handling workflow the first time its clerkOrgId is seen, rather
 * than via a webhook (see docs/production-notes.md for why). Race-safe
 * under concurrent first-requests for the same new org: the clerkOrgId
 * unique constraint, not this function's control flow, is what actually
 * prevents duplicate rows — a losing concurrent create falls through to
 * re-reading the winner's row instead of erroring.
 */
export async function getCurrentOrganisation(): Promise<Organisation> {
  const { userId, orgId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }
  if (!orgId) {
    redirect("/select-organisation");
  }

  const existing = await prisma.organisation.findUnique({
    where: { clerkOrgId: orgId },
  });
  if (existing) {
    return existing;
  }

  const client = await clerkClient();
  const clerkOrg = await client.organizations.getOrganization({
    organizationId: orgId,
  });

  try {
    const organisation = await prisma.organisation.create({
      data: { clerkOrgId: orgId, name: clerkOrg.name },
    });
    // Starter catalog is deliberately empty — a real business populates
    // its own via /catalog, unlike the seeded demo orgs this replaces.
    await provisionEmailWorkflow({
      organisationId: organisation.id,
      currency: "GBP",
      model: DEFAULT_AGENT_MODEL,
      quoteKeywords: DEFAULT_QUOTE_KEYWORDS,
      complaintsKeywords: DEFAULT_COMPLAINTS_KEYWORDS,
      products: [],
      customers: [],
    });
    return organisation;
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return prisma.organisation.findUniqueOrThrow({
        where: { clerkOrgId: orgId },
      });
    }
    throw error;
  }
}
