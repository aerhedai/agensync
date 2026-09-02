-- DropForeignKey
ALTER TABLE "CustomEntityRecord" DROP CONSTRAINT "CustomEntityRecord_entityTypeId_fkey";

-- AddForeignKey
ALTER TABLE "CustomEntityRecord" ADD CONSTRAINT "CustomEntityRecord_entityTypeId_fkey" FOREIGN KEY ("entityTypeId") REFERENCES "CustomEntityType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
