-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "pipelineConfig" JSONB NOT NULL DEFAULT '{}';
