-- ============================================================================
-- MANUAL SQL: Step 8 — Drop redundant auth columns from User and Professional
-- Forward: drops passwordHash, OTP, session, T&C columns (data lives in Identity)
-- Reverse: MANUAL_SQL_REVERSE_CLEANUP_AUTH_COLUMNS_STEP8.sql
-- Prerequisite: AuthService.login() reads from Identity only (no legacy fallback)
-- Safe to run: columns are no longer read by auth code
-- ============================================================================

-- User: drop auth columns (password/OTP/session/T&C — now in Identity)
ALTER TABLE "User" DROP COLUMN IF EXISTS "passwordHash";
ALTER TABLE "User" DROP COLUMN IF EXISTS "passwordResetToken";
ALTER TABLE "User" DROP COLUMN IF EXISTS "passwordResetExpiry";
ALTER TABLE "User" DROP COLUMN IF EXISTS "verificationToken";
ALTER TABLE "User" DROP COLUMN IF EXISTS "otpCode";
ALTER TABLE "User" DROP COLUMN IF EXISTS "otpExpiresAt";
ALTER TABLE "User" DROP COLUMN IF EXISTS "otpVerifiedAt";
ALTER TABLE "User" DROP COLUMN IF EXISTS "sessionToken";
ALTER TABLE "User" DROP COLUMN IF EXISTS "agreedToTermsAt";
ALTER TABLE "User" DROP COLUMN IF EXISTS "agreedToTermsVersion";
ALTER TABLE "User" DROP COLUMN IF EXISTS "agreedToSecurityStatementAt";
ALTER TABLE "User" DROP COLUMN IF EXISTS "agreedToSecurityStatementVersion";

-- Professional: drop auth columns
ALTER TABLE "Professional" DROP COLUMN IF EXISTS "passwordHash";
ALTER TABLE "Professional" DROP COLUMN IF EXISTS "otpCode";
ALTER TABLE "Professional" DROP COLUMN IF EXISTS "otpExpiresAt";
ALTER TABLE "Professional" DROP COLUMN IF EXISTS "otpVerifiedAt";
ALTER TABLE "Professional" DROP COLUMN IF EXISTS "sessionToken";
ALTER TABLE "Professional" DROP COLUMN IF EXISTS "agreedToTermsAt";
ALTER TABLE "Professional" DROP COLUMN IF EXISTS "agreedToTermsVersion";
ALTER TABLE "Professional" DROP COLUMN IF EXISTS "agreedToSecurityStatementAt";
ALTER TABLE "Professional" DROP COLUMN IF EXISTS "agreedToSecurityStatementVersion";
