-- DropIndex
DROP INDEX "User_email_key";

-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN     "clerkOrgId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "clerkUserId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Organisation_clerkOrgId_key" ON "Organisation"("clerkOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "User_organisationId_email_key" ON "User"("organisationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "User_organisationId_clerkUserId_key" ON "User"("organisationId", "clerkUserId");

