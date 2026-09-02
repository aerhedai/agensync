import { clerkClient } from "@clerk/nextjs/server";

import { prisma } from "@/lib/db/prisma";

// Deletes this person's access to just the current organisation, then their
// Clerk identity globally. Approval has no cascade from User (see
// prisma/schema.prisma), so any approval they decided would otherwise block
// the delete with a foreign-key error — nulling approverId first preserves
// the approval's own history (requestedAction, decidedAt) without needing a
// user row that no longer exists.
//
// Known limitation: a person who belongs to more than one organisation
// keeps a local User row per membership (see current-user.ts). Deleting
// their Clerk identity ends their access everywhere, but this only cleans
// up the *current* organisation's row — other orgs' rows are left pointing
// at a clerkUserId that no longer resolves. Acceptable for V1; a real
// cross-org cleanup would mean querying across organisations, which the
// rest of this codebase deliberately never does (CLAUDE.md §22).
export async function deleteMyAccount(localUserId: string, clerkUserId: string) {
  await prisma.approval.updateMany({
    where: { approverId: localUserId },
    data: { approverId: null },
  });
  await prisma.user.delete({ where: { id: localUserId } });

  const client = await clerkClient();
  await client.users.deleteUser(clerkUserId);
}
