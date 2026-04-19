CREATE TABLE "MilestoneProcurementEvidence" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "paymentMilestoneId" TEXT NOT NULL,
  "projectProfessionalId" TEXT,
  "submittedBy" TEXT NOT NULL,
  "submittedByRole" TEXT NOT NULL DEFAULT 'professional',
  "claimedAmount" DECIMAL(12,2) NOT NULL,
  "approvedAmount" DECIMAL(12,2),
  "invoiceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reviewedBy" TEXT,
  "reviewedByRole" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNotes" TEXT,
  "titleTransferAcknowledged" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MilestoneProcurementEvidence_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MilestoneProcurementEvidence"
  ADD CONSTRAINT "MilestoneProcurementEvidence_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MilestoneProcurementEvidence"
  ADD CONSTRAINT "MilestoneProcurementEvidence_paymentMilestoneId_fkey"
  FOREIGN KEY ("paymentMilestoneId") REFERENCES "PaymentMilestone"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MilestoneProcurementEvidence"
  ADD CONSTRAINT "MilestoneProcurementEvidence_projectProfessionalId_fkey"
  FOREIGN KEY ("projectProfessionalId") REFERENCES "ProjectProfessional"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "MilestoneProcurementEvidence_projectId_idx"
  ON "MilestoneProcurementEvidence"("projectId");

CREATE INDEX "MilestoneProcurementEvidence_paymentMilestoneId_idx"
  ON "MilestoneProcurementEvidence"("paymentMilestoneId");

CREATE INDEX "MilestoneProcurementEvidence_projectProfessionalId_idx"
  ON "MilestoneProcurementEvidence"("projectProfessionalId");

CREATE INDEX "MilestoneProcurementEvidence_status_idx"
  ON "MilestoneProcurementEvidence"("status");
