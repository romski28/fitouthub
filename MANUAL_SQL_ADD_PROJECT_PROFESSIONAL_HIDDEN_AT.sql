-- Add hiddenAt column to ProjectProfessional so pros can hide projects from their list
-- Run on Supabase SQL Editor

-- Add the column
ALTER TABLE "ProjectProfessional"
ADD COLUMN IF NOT EXISTS "hiddenAt" TIMESTAMPTZ;

-- Create index for filtered queries
CREATE INDEX IF NOT EXISTS "idx_project_professional_hidden"
ON "ProjectProfessional" ("professionalId", "hiddenAt");
