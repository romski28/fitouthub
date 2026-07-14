-- ============================================================================
-- MANUAL SQL: bcrypt-hash all existing plaintext passwords in Identity
-- Run in Supabase SQL Editor AFTER deploying the bcrypt dual-read code.
-- Safe to re-run: already-hashed passwords ($2... prefix) are skipped.
-- Reverse: restore from backup. Passwords cannot be un-hashed.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE "Identity"
SET "passwordHash" = crypt("passwordHash", gen_salt('bf', 10))
WHERE "passwordHash" IS NOT NULL
  AND "passwordHash" NOT LIKE '$2%';

-- Verify:
-- SELECT email, LEFT("passwordHash", 7) AS hash_prefix FROM "Identity";
