-- Add buildingName to ProjectLocationDetails for Phase B address UX
ALTER TABLE "ProjectLocationDetails"
ADD COLUMN IF NOT EXISTS "buildingName" TEXT;