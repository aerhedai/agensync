import { prisma } from "@/lib/db/prisma";

/**
 * Stand-in for auth/session-derived organisation context, which doesn't
 * exist yet — no auth phase has been built. Resolves to the first
 * Organisation row so the rest of the app can stay correctly scoped by
 * organisationId. Replace this with real session lookup once auth lands.
 */
export async function getCurrentOrganisation() {
  const organisation = await prisma.organisation.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (!organisation) {
    throw new Error("No organisation found — run `pnpm db:seed`.");
  }

  return organisation;
}
