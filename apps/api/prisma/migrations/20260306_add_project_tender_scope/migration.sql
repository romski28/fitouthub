ALTER TABLE "Project"
ADD COLUMN IF NOT EXISTS "onlySelectedProfessionalsCanBid" BOOLEAN NOT NULL DEFAULT true;
