import { prisma } from "@/lib/db/prisma";

/**
 * Stand-in for auth/session-derived user identity, which doesn't exist yet —
 * no auth phase has been built. Resolves to the first User row so approval
 * decisions have a real approver recorded. Replace with real session lookup
 * once auth lands (same limitation as getCurrentOrganisation()).
 */
export async function getCurrentUser() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });

  if (!user) {
    throw new Error("No user found — run `pnpm db:seed`.");
  }

  return user;
}
