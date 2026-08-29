-- AlterTable
ALTER TABLE "Approval" ADD COLUMN     "proposedInput" JSONB,
ADD COLUMN     "proposedToolCallId" TEXT;
