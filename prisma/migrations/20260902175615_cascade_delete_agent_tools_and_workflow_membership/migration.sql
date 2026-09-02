-- DropForeignKey
ALTER TABLE "AgentTool" DROP CONSTRAINT "AgentTool_agentId_fkey";

-- DropForeignKey
ALTER TABLE "WorkflowAgent" DROP CONSTRAINT "WorkflowAgent_agentId_fkey";

-- AddForeignKey
ALTER TABLE "AgentTool" ADD CONSTRAINT "AgentTool_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAgent" ADD CONSTRAINT "WorkflowAgent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
