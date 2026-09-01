-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "extractionFields" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "guardrailKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[];
