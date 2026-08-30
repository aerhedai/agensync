-- CreateEnum
CREATE TYPE "WorkflowTriggerType" AS ENUM ('EMAIL');

-- CreateEnum
CREATE TYPE "WorkflowAgentRole" AS ENUM ('CLASSIFIER', 'HANDLER');

-- CreateTable
CREATE TABLE "AgentTool" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,

    CONSTRAINT "AgentTool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "trigger" "WorkflowTriggerType" NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowAgent" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "role" "WorkflowAgentRole" NOT NULL,

    CONSTRAINT "WorkflowAgent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentTool_agentId_idx" ON "AgentTool"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentTool_agentId_toolName_key" ON "AgentTool"("agentId", "toolName");

-- CreateIndex
CREATE INDEX "Workflow_organisationId_idx" ON "Workflow"("organisationId");

-- CreateIndex
CREATE INDEX "WorkflowAgent_workflowId_idx" ON "WorkflowAgent"("workflowId");

-- CreateIndex
CREATE INDEX "WorkflowAgent_agentId_idx" ON "WorkflowAgent"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowAgent_workflowId_agentId_key" ON "WorkflowAgent"("workflowId", "agentId");

-- AddForeignKey
ALTER TABLE "AgentTool" ADD CONSTRAINT "AgentTool_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAgent" ADD CONSTRAINT "WorkflowAgent_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAgent" ADD CONSTRAINT "WorkflowAgent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
