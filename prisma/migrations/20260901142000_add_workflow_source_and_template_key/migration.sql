-- CreateEnum
CREATE TYPE "WorkflowSource" AS ENUM ('TEMPLATE', 'CUSTOM');

-- AlterTable
ALTER TABLE "Workflow" ADD COLUMN     "source" "WorkflowSource" NOT NULL DEFAULT 'CUSTOM',
ADD COLUMN     "templateKey" TEXT;

-- DataMigration: every existing Workflow was created by
-- provision-email-workflow.ts, the platform's one starter template today —
-- the column default above (CUSTOM) is correct for genuinely new,
-- business-authored workflows going forward, but wrong for rows that
-- already exist. Correct them here rather than leaving every pre-existing
-- org's Email Handling workflow mislabeled as "custom".
UPDATE "Workflow" SET "source" = 'TEMPLATE', "templateKey" = 'email_handling'
WHERE "name" = 'Email Handling';
