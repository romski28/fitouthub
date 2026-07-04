-- ============================================================================
-- MANUAL SQL: Step 2 — Backfill Identity rows from User and Professional
-- Forward: creates Identity rows for all users/professionals and links them
-- Reverse: MANUAL_SQL_REVERSE_IDENTITY_BACKFILL_STEP2.sql
-- Depends on: Step 1 (Identity table + identityId columns must exist)
-- Safe to run: adds rows, sets identityId. Existing auth still works via old columns.
-- ============================================================================

-- 1. Backfill from User table (16 rows)
--    Creates one Identity row per User, using prefixed ID for traceability
INSERT INTO "Identity" (
    "id",
    "email",
    "passwordHash",
    "passwordResetToken",
    "passwordResetExpiry",
    "emailVerified",
    "verificationToken",
    "otpCode",
    "otpExpiresAt",
    "otpVerifiedAt",
    "sessionToken",
    "agreedToTermsAt",
    "agreedToTermsVersion",
    "agreedToSecurityStatementAt",
    "agreedToSecurityStatementVersion",
    "createdAt",
    "updatedAt"
)
SELECT
    'id_user_' || u."id",
    u."email",
    u."passwordHash",
    u."passwordResetToken",
    u."passwordResetExpiry",
    u."emailVerified",
    u."verificationToken",
    u."otpCode",
    u."otpExpiresAt",
    u."otpVerifiedAt",
    u."sessionToken",
    u."agreedToTermsAt",
    u."agreedToTermsVersion",
    u."agreedToSecurityStatementAt",
    u."agreedToSecurityStatementVersion",
    u."createdAt",
    u."updatedAt"
FROM "User" u
WHERE u."identityId" IS NULL
  AND u."email" IS NOT NULL;

-- 2. Link User → Identity
UPDATE "User" u
SET "identityId" = 'id_user_' || u."id"
WHERE u."identityId" IS NULL
  AND u."email" IS NOT NULL;

-- 3. Backfill from Professional where email NOT already in Identity
--    (handles the case where same person has both User + Professional account)
INSERT INTO "Identity" (
    "id",
    "email",
    "passwordHash",
    "passwordResetToken",
    "passwordResetExpiry",
    "emailVerified",
    "verificationToken",
    "otpCode",
    "otpExpiresAt",
    "otpVerifiedAt",
    "sessionToken",
    "agreedToTermsAt",
    "agreedToTermsVersion",
    "agreedToSecurityStatementAt",
    "agreedToSecurityStatementVersion",
    "createdAt",
    "updatedAt"
)
SELECT
    'id_pro_' || p."id",
    p."email",
    p."passwordHash",
    NULL,
    NULL,
    false,          -- Professional has no emailVerified field; default false
    NULL,
    p."otpCode",
    p."otpExpiresAt",
    p."otpVerifiedAt",
    p."sessionToken",
    p."agreedToTermsAt",
    p."agreedToTermsVersion",
    p."agreedToSecurityStatementAt",
    p."agreedToSecurityStatementVersion",
    p."createdAt",
    p."updatedAt"
FROM "Professional" p
WHERE p."identityId" IS NULL
  AND p."email" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "Identity" i WHERE i."email" = p."email"
  );

-- 4. Link Professional → Identity
--    If email matches an existing Identity (shared with User), link to that one
UPDATE "Professional" p
SET "identityId" = (
    SELECT i."id" FROM "Identity" i WHERE i."email" = p."email" LIMIT 1
)
WHERE p."identityId" IS NULL
  AND p."email" IS NOT NULL;

-- Any remaining Professionals without identityId get their own
UPDATE "Professional" p
SET "identityId" = 'id_pro_' || p."id"
WHERE p."identityId" IS NULL
  AND p."email" IS NOT NULL;

-- ============================================================================
-- VERIFICATION QUERIES (run manually to check)
-- ============================================================================
-- SELECT count(*) AS identity_count FROM "Identity";
-- SELECT count(*) AS user_linked FROM "User" WHERE "identityId" IS NOT NULL;
-- SELECT count(*) AS pro_linked FROM "Professional" WHERE "identityId" IS NOT NULL;
-- SELECT u.email, i.id AS identity_id FROM "User" u JOIN "Identity" i ON u."identityId" = i.id LIMIT 5;
-- SELECT p.email, i.id AS identity_id FROM "Professional" p JOIN "Identity" i ON p."identityId" = i.id;
