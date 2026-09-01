-- CreateTable
CREATE TABLE "CustomEntityType" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fields" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomEntityType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomEntityRecord" (
    "id" TEXT NOT NULL,
    "entityTypeId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomEntityRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomEntityType_organisationId_idx" ON "CustomEntityType"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomEntityType_organisationId_name_key" ON "CustomEntityType"("organisationId", "name");

-- CreateIndex
CREATE INDEX "CustomEntityRecord_entityTypeId_idx" ON "CustomEntityRecord"("entityTypeId");

-- CreateIndex
CREATE INDEX "CustomEntityRecord_organisationId_idx" ON "CustomEntityRecord"("organisationId");

-- AddForeignKey
ALTER TABLE "CustomEntityType" ADD CONSTRAINT "CustomEntityType_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomEntityRecord" ADD CONSTRAINT "CustomEntityRecord_entityTypeId_fkey" FOREIGN KEY ("entityTypeId") REFERENCES "CustomEntityType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomEntityRecord" ADD CONSTRAINT "CustomEntityRecord_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
