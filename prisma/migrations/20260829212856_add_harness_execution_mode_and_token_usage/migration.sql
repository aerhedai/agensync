-- CreateEnum
CREATE TYPE "AgentExecutionMode" AS ENUM ('LOOP', 'HARNESS');

-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "executionMode" "AgentExecutionMode" NOT NULL DEFAULT 'LOOP',
ADD COLUMN     "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "pipelineKey" TEXT;

-- AlterTable
ALTER TABLE "RunStep" ADD COLUMN     "completionTokens" INTEGER,
ADD COLUMN     "promptTokens" INTEGER;
