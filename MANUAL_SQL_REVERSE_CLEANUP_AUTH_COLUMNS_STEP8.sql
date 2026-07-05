-- ============================================================================
-- REVERSE: Step 8 — Restore auth columns to User and Professional
-- Run this to undo MANUAL_SQL_CLEANUP_AUTH_COLUMNS_STEP8.sql
-- Data will be NULL — restore from Identity table if needed
-- ============================================================================

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordResetToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordResetExpiry" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "verificationToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "otpCode" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "otpExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "otpVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "agreedToTermsAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "agreedToTermsVersion" TEXT DEFAULT '1.0';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "agreedToSecurityStatementAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "agreedToSecurityStatementVersion" TEXT DEFAULT '1.0';

ALTER TABLE "Professional" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
ALTER TABLE "Professional" ADD COLUMN IF NOT EXISTS "otpCode" TEXT;
ALTER TABLE "Professional" ADD COLUMN IF NOT EXISTS "otpExpiresAt" TIMESTAMP(3);
ALTER TABLE "Professional" ADD COLUMN IF NOT EXISTS "otpVerifiedAt" TIMESTAMP(3);
ALTER TABLE "Professional" ADD COLUMN IF NOT EXISTS "sessionToken" TEXT;
ALTER TABLE "Professional" ADD COLUMN IF NOT EXISTS "agreedToTermsAt" TIMESTAMP(3);
ALTER TABLE "Professional" ADD COLUMN IF NOT EXISTS "agreedToTermsVersion" TEXT DEFAULT '1.0';
ALTER TABLE "Professional" ADD COLUMN IF NOT EXISTS "agreedToSecurityStatementAt" TIMESTAMP(3);
ALTER TABLE "Professional" ADD COLUMN IF NOT EXISTS "agreedToSecurityStatementVersion" TEXT DEFAULT '1.0';
