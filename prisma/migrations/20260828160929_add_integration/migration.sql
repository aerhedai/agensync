-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('GMAIL');

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "email" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Integration_organisationId_idx" ON "Integration"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_organisationId_provider_key" ON "Integration"("organisationId", "provider");

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
