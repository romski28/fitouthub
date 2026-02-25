-- Make locationDetailsStatus nullable to handle legacy data
-- Run this in Supabase SQL Editor

ALTER TABLE "Project" 
ALTER COLUMN "locationDetailsStatus" SET DEFAULT NULL,
ALTER COLUMN "locationDetailsStatus" DROP NOT NULL;

-- Verify the change
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'Project' AND column_name = 'locationDetailsStatus';
