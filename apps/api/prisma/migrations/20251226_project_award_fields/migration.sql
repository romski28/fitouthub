-- Add scheduling and contractor contact fields to Project
ALTER TABLE "Project"
  ADD COLUMN "startDate" TIMESTAMP(3),
  ADD COLUMN "endDate" TIMESTAMP(3),
  ADD COLUMN "contractorContactName" TEXT,
  ADD COLUMN "contractorContactPhone" TEXT,
  ADD COLUMN "contractorContactEmail" TEXT;
