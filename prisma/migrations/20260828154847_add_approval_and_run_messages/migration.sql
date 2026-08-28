-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RunStepType" ADD VALUE 'APPROVAL_GRANTED';
ALTER TYPE "RunStepType" ADD VALUE 'RUN_CANCELLED';

-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN     "messages" JSONB;

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "requestedAction" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approverId" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Approval_agentRunId_idx" ON "Approval"("agentRunId");

-- CreateIndex
CREATE INDEX "Approval_organisationId_idx" ON "Approval"("organisationId");

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
