import { auth, currentUser as currentClerkUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { Prisma, UserRole } from "@/lib/generated/prisma/client";
import type { User } from "@/lib/generated/prisma/client";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

// Clerk's org-role string isn't a fixed literal type (custom roles are
// supported), so this maps defensively rather than assuming one exact
// shape — OWNER/APPROVER have no Clerk-side signal at all and stay
// reachable only via manual assignment for now (CLAUDE.md §8: a simple
// role model is sufficient for V1).
function mapClerkOrgRole(orgRole: string | null | undefined): UserRole {
  if (orgRole === "org:admin" || orgRole === "admin") {
    return UserRole.ADMIN;
  }
  return UserRole.MEMBER;
}

/**
 * Resolves the current user from the real Clerk session, scoped to the
 * current organisation (one Clerk person can belong to more than one org
 * via <OrganizationSwitcher/> — each membership is its own row here, see
 * prisma/schema.prisma's User model). Lazily provisions the local row on
 * first sight of a not-yet-seen (organisationId, clerkUserId) pair, and
 * re-syncs email/name/role on every call so a change made in Clerk (e.g.
 * promoted to admin) doesn't go stale locally — this is already inside an
 * upsert-shaped lookup, so re-syncing costs one extra clause, not a query.
 */
export async function getCurrentUser(): Promise<User> {
  const { userId, orgRole } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const organisation = await getCurrentOrganisation();
  const clerkUser = await currentClerkUser();
  if (!clerkUser) {
    redirect("/sign-in");
  }

  const email =
    clerkUser.primaryEmailAddress?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) {
    throw new Error("Signed-in Clerk user has no email address.");
  }
  const name =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
    email;
  const role = mapClerkOrgRole(orgRole);

  const existing = await prisma.user.findUnique({
    where: {
      organisationId_clerkUserId: {
        organisationId: organisation.id,
        clerkUserId: userId,
      },
    },
  });

  if (existing) {
    if (
      existing.email === email &&
      existing.name === name &&
      existing.role === role
    ) {
      return existing;
    }
    return prisma.user.update({
      where: { id: existing.id },
      data: { email, name, role },
    });
  }

  try {
    return await prisma.user.create({
      data: {
        organisationId: organisation.id,
        clerkUserId: userId,
        email,
        name,
        role,
      },
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return prisma.user.findUniqueOrThrow({
        where: {
          organisationId_clerkUserId: {
            organisationId: organisation.id,
            clerkUserId: userId,
          },
        },
      });
    }
    throw error;
  }
}
