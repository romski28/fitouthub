-- Migration: Add contract signing fields to Project table
-- Description: Adds fields to track digital contract signing by client and professional
-- Run in Supabase SQL Editor

-- Add contract-related columns to Project table
ALTER TABLE "Project"
ADD COLUMN IF NOT EXISTS "contractType" TEXT,
ADD COLUMN IF NOT EXISTS "contractContent" TEXT,
ADD COLUMN IF NOT EXISTS "contractGeneratedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "clientSignedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "clientSignedById" TEXT,
ADD COLUMN IF NOT EXISTS "professionalSignedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "professionalSignedById" TEXT;

-- Add foreign key constraints
-- Note: These are separate statements to handle cases where columns or constraints might already exist

-- Drop existing constraints if they exist (in case of re-run)
ALTER TABLE "Project"
DROP CONSTRAINT IF EXISTS "Project_clientSignedById_fkey",
DROP CONSTRAINT IF EXISTS "Project_professionalSignedById_fkey";

-- Add foreign key constraints
ALTER TABLE "Project"
ADD CONSTRAINT "Project_clientSignedById_fkey"
  FOREIGN KEY ("clientSignedById")
  REFERENCES "User"(id)
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "Project"
ADD CONSTRAINT "Project_professionalSignedById_fkey"
  FOREIGN KEY ("professionalSignedById")
  REFERENCES "User"(id)
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS "Project_clientSignedById_idx" ON "Project"("clientSignedById");
CREATE INDEX IF NOT EXISTS "Project_professionalSignedById_idx" ON "Project"("professionalSignedById");
CREATE INDEX IF NOT EXISTS "Project_clientSignedAt_idx" ON "Project"("clientSignedAt");
CREATE INDEX IF NOT EXISTS "Project_professionalSignedAt_idx" ON "Project"("professionalSignedAt");

-- Verify the changes
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'Project'
  AND column_name IN (
    'contractType',
    'contractContent',
    'contractGeneratedAt',
    'clientSignedAt',
    'clientSignedById',
    'professionalSignedAt',
    'professionalSignedById'
  )
ORDER BY column_name;
