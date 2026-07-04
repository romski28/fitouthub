-- ============================================================================
-- MANUAL SQL: Step 1 — Create Identity table (schema only, no data migration)
-- Forward: creates Identity table + nullable identityId columns on User & Professional
-- Reverse: MANUAL_SQL_REVERSE_IDENTITY_TABLE_STEP1.sql
-- Depends on: nothing (this is step 1)
-- Safe to run: no data is moved, existing auth still works via old columns
-- ============================================================================

-- 1. Create the Identity table (extracted auth/credential fields)
CREATE TABLE IF NOT EXISTS "Identity" (
    "id"                                TEXT NOT NULL,
    "email"                             TEXT NOT NULL,
    "passwordHash"                      TEXT,
    "passwordResetToken"                TEXT,
    "passwordResetExpiry"               TIMESTAMP(3),
    "emailVerified"                     BOOLEAN NOT NULL DEFAULT false,
    "verificationToken"                 TEXT,
    "otpCode"                           TEXT,
    "otpExpiresAt"                      TIMESTAMP(3),
    "otpVerifiedAt"                     TIMESTAMP(3),
    "sessionToken"                      TEXT,
    "agreedToTermsAt"                   TIMESTAMP(3),
    "agreedToTermsVersion"              TEXT DEFAULT '1.0',
    "agreedToSecurityStatementAt"       TIMESTAMP(3),
    "agreedToSecurityStatementVersion"  TEXT DEFAULT '1.0',
    "createdAt"                         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"                         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Identity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Identity_email_key" ON "Identity"("email");

-- 2. Add nullable identityId to User (no FK constraint yet — will add after backfill)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "identityId" TEXT;

-- 3. Add nullable identityId to Professional
ALTER TABLE "Professional" ADD COLUMN IF NOT EXISTS "identityId" TEXT;
