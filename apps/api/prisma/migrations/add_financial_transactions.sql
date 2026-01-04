-- CreateTable FinancialTransaction
CREATE TABLE "FinancialTransaction" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectProfessionalId" TEXT,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedBy" TEXT,
    "requestedByRole" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinancialTransaction_projectId_idx" ON "FinancialTransaction"("projectId");

-- CreateIndex
CREATE INDEX "FinancialTransaction_projectProfessionalId_idx" ON "FinancialTransaction"("projectProfessionalId");

-- CreateIndex
CREATE INDEX "FinancialTransaction_status_idx" ON "FinancialTransaction"("status");

-- CreateIndex
CREATE INDEX "FinancialTransaction_type_idx" ON "FinancialTransaction"("type");

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_projectProfessionalId_fkey" FOREIGN KEY ("projectProfessionalId") REFERENCES "ProjectProfessional"("id") ON DELETE CASCADE ON UPDATE CASCADE;
