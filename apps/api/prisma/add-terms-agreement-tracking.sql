-- Migration: Add T&C and Security Agreement tracking
-- Description: Adds fields to track when users agree to T&C and Security Statement
-- Run in Supabase SQL Editor

-- Add agreement tracking columns to User table
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "agreedToTermsAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "agreedToTermsVersion" TEXT DEFAULT '1.0',
ADD COLUMN IF NOT EXISTS "agreedToSecurityStatementAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "agreedToSecurityStatementVersion" TEXT DEFAULT '1.0';

-- Add agreement tracking columns to Professional table
ALTER TABLE "Professional"
ADD COLUMN IF NOT EXISTS "agreedToTermsAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "agreedToTermsVersion" TEXT DEFAULT '1.0',
ADD COLUMN IF NOT EXISTS "agreedToSecurityStatementAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "agreedToSecurityStatementVersion" TEXT DEFAULT '1.0';

-- Create indexes for agreement tracking queries
CREATE INDEX IF NOT EXISTS "User_agreedToTermsAt_idx" ON "User"("agreedToTermsAt");
CREATE INDEX IF NOT EXISTS "User_agreedToTermsVersion_idx" ON "User"("agreedToTermsVersion");
CREATE INDEX IF NOT EXISTS "Professional_agreedToTermsAt_idx" ON "Professional"("agreedToTermsAt");
CREATE INDEX IF NOT EXISTS "Professional_agreedToTermsVersion_idx" ON "Professional"("agreedToTermsVersion");

-- Verify the changes for User table
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'User'
  AND column_name IN (
    'agreedToTermsAt',
    'agreedToTermsVersion',
    'agreedToSecurityStatementAt',
    'agreedToSecurityStatementVersion'
  )
ORDER BY column_name;

-- Verify the changes for Professional table
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'Professional'
  AND column_name IN (
    'agreedToTermsAt',
    'agreedToTermsVersion',
    'agreedToSecurityStatementAt',
    'agreedToSecurityStatementVersion'
  )
ORDER BY column_name;
