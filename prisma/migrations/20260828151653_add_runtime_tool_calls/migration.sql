-- CreateEnum
CREATE TYPE "RunStepType" AS ENUM ('INPUT_RECEIVED', 'AGENT_DECISION', 'TOOL_CALL', 'RUN_COMPLETED', 'RUN_FAILED');

-- CreateEnum
CREATE TYPE "ToolCallStatus" AS ENUM ('SUCCESS', 'FAILED');

-- AlterTable
ALTER TABLE "RunStep" ADD COLUMN     "toolCallId" TEXT,
DROP COLUMN "stepType",
ADD COLUMN     "stepType" "RunStepType" NOT NULL;

-- CreateTable
CREATE TABLE "ToolCall" (
    "id" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "status" "ToolCallStatus" NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ToolCall_agentRunId_idx" ON "ToolCall"("agentRunId");

-- CreateIndex
CREATE UNIQUE INDEX "RunStep_toolCallId_key" ON "RunStep"("toolCallId");

-- AddForeignKey
ALTER TABLE "RunStep" ADD CONSTRAINT "RunStep_toolCallId_fkey" FOREIGN KEY ("toolCallId") REFERENCES "ToolCall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolCall" ADD CONSTRAINT "ToolCall_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
