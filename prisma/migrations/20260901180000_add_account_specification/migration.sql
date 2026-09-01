-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "actionIntegrationId" TEXT;

-- AlterTable
ALTER TABLE "Workflow" ADD COLUMN     "triggerIntegrationId" TEXT;

-- CreateIndex
CREATE INDEX "Agent_actionIntegrationId_idx" ON "Agent"("actionIntegrationId");

-- CreateIndex
CREATE INDEX "Workflow_triggerIntegrationId_idx" ON "Workflow"("triggerIntegrationId");

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_actionIntegrationId_fkey" FOREIGN KEY ("actionIntegrationId") REFERENCES "Integration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_triggerIntegrationId_fkey" FOREIGN KEY ("triggerIntegrationId") REFERENCES "Integration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
