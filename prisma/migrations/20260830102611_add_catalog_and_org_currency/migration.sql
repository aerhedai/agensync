-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "replySubjectTemplate" TEXT;

-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'GBP';

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_organisationId_idx" ON "Product"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_organisationId_sku_key" ON "Product"("organisationId", "sku");

-- CreateIndex
CREATE INDEX "Customer_organisationId_idx" ON "Customer"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_organisationId_email_key" ON "Customer"("organisationId", "email");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
